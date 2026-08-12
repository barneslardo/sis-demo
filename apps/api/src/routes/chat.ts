import { Router } from "express";
import { capDelegatedScopes, resolveSessionEntitledScopes } from "@sis/shared";
import { AppError } from "../lib/errors.js";
import { listAvailableChatModels, runChatCompletion } from "../lib/chat/llm-proxy.js";
import { parseGrantedScopes } from "../lib/chat/delegated-api.js";
import { runSisTool, chatToolsForScopes } from "../lib/chat/sis-tools.js";
import {
  getDelegatedAccessToken,
  isAgentExchangeEnabled,
} from "../lib/agent-token-exchange.js";
import { ensureFreshIdToken } from "../lib/session-id-token.js";
import { mapChatProviderError, tryScopeGuidanceReply } from "../lib/chat/scope-guidance.js";

export const chatRouter = Router();

function requireAdminSession(req: import("express").Request, _res: import("express").Response, next: import("express").NextFunction) {
  if (!req.user) return next(new AppError(401, "UNAUTHORIZED", "Sign in required"));
  if (req.user.role !== "admin") return next(new AppError(403, "FORBIDDEN", "Admin access required"));
  return next();
}

chatRouter.get("/models", (_req, res) => {
  res.json({ data: listAvailableChatModels() });
});

chatRouter.post("/", requireAdminSession, async (req, res, next) => {
  const started = Date.now();
  try {
    const models = listAvailableChatModels();
    if (!models.length) {
      throw new AppError(
        503,
        "LLM_DISABLED",
        "Set GROK_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in .env"
      );
    }

    const { messages = [], model, provider } = req.body ?? {};
    const admin = req.user!;

    if (!isAgentExchangeEnabled()) {
      throw new AppError(
        503,
        "AGENT_NOT_CONFIGURED",
        "ID-JAG requires AGENT_CLIENT_ID (AI agent registration id, not OKTA_OIDC_CLIENT_ID), " +
          "AGENT_PRIVATE_KEY_PATH (agent key), and RESOURCE_AS_ISSUER (SIS custom authorization server)."
      );
    }

    let idToken: string;
    try {
      idToken = await ensureFreshIdToken(req);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        401,
        "ID_TOKEN_EXPIRED",
        "Your Okta sign-in token expired. Sign out, then sign in with Okta again."
      );
    }

    const entitledScopes = resolveSessionEntitledScopes(
      admin.email,
      admin.groups ?? [],
      admin.scopes
    );

    let delegatedScopes: string[] = [];
    let delegatedAccess: { accessToken: string; grantedScopes: string[]; sessionCookie?: string };
    try {
      const delegated = await getDelegatedAccessToken(idToken, entitledScopes.join(" "));
      if (!delegated.access_token) {
        throw new Error("Token exchange returned no access_token");
      }
      const oktaScopes = parseGrantedScopes(delegated.scope);
      delegatedScopes = capDelegatedScopes(oktaScopes, entitledScopes);
      if (oktaScopes.length !== delegatedScopes.length) {
        console.log(
          `[chat] capped scopes user=${admin.email} okta=${oktaScopes.length} effective=${delegatedScopes.length} (${delegatedScopes.join(", ")})`
        );
      }
      delegatedAccess = {
        accessToken: delegated.access_token,
        grantedScopes: delegatedScopes,
        sessionCookie: req.headers.cookie,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("JWKSet") || msg.includes("kid")) {
        throw new AppError(
          502,
          "AGENT_JWK_MISMATCH",
          "Okta rejected the agent client assertion. Register the agent public key (kid from secrets/agent-private-key.json) on the AI agent registration in Okta."
        );
      }
      if (msg.includes("subject_token") && msg.includes("invalid")) {
        throw new AppError(
          401,
          "ID_TOKEN_EXPIRED",
          "Your Okta id_token is no longer valid for agent delegation. Sign out and sign in with Okta again."
        );
      }
      if (msg.includes("Policy evaluation failed")) {
        throw new AppError(
          502,
          "DELEGATION_POLICY_DENIED",
          "Okta denied the delegated token for your group. Confirm your user is in an entitled group and the SIS authorization server has a jwt-bearer rule for that group."
        );
      }
      throw new AppError(
        502,
        "DELEGATION_FAILED",
        `${msg} Ensure the agent is connected to the SIS authorization server and hop-2 allows jwt-bearer (run scripts/setup_okta_id_jag.py).`
      );
    }

    const persona = admin.persona ?? "Staff";
    const systemPrompt = [
      "You are the SIS Admin Assistant embedded in the Student Information System web app.",
      `You help the signed-in user (${admin.displayName}, ${admin.email}, persona: ${persona}) manage student records.`,
      "",
      "Use the provided tools for all student data operations — do not invent records.",
      "When creating students with FERPA, financial, ADA, disciplinary, counselor, risk, or academic data, use create_student_with_records (one call per student with nested category objects).",
      "For at-risk or high-risk student lists, use list_high_risk_students (not get_student_risk on every student).",
      "Use upsert_* and add_* tools to update category records on existing students.",
      "Use @university.edu email addresses for fictitious demo students (not @example.com).",
      "Be concise and cite student names, emails, and IDs from tool results.",
      "Do not delete students unless the user explicitly asks; deletion is not available via chat.",
      "",
      "Okta AI agent Cross App Access: each tool call uses the user's delegated OAuth token.",
      `Effective scopes for this session (capped to your Okta group): ${delegatedScopes.join(", ") || "(none — tools will fail)"}.`,
      "Only tools matching your scopes are available. Category data (ADA, FERPA, financial, academic, disciplinary, counselor, risk) requires the matching sis.students.* scope — do not infer it from core profile fields.",
      "create_student_with_records requires sis.admin. Category write tools require the matching category scope.",
      "If a tool result includes userMessage and error=insufficient_scope, relay that explanation to the user verbatim (you may shorten slightly but keep persona, scope names, and who owns the data).",
      "If the user asks about a data category you cannot access, explain which OAuth scope is missing and which staff persona can help — do not guess or hallucinate protected data.",
      "If oktaSync reports an error, the student was still saved in SIS — mention sync status briefly but do not treat it as failure.",
    ].join("\n");

    const lastUser = [...(messages as Array<{ role: string; content: string }>)]
      .reverse()
      .find((m) => m.role === "user" && typeof m.content === "string");
    if (lastUser?.content) {
      const guidance = tryScopeGuidanceReply(lastUser.content, delegatedScopes, persona);
      if (guidance) {
        console.log(`[chat] scope-guidance user=${admin.email} persona=${persona}`);
        return res.json({
          data: {
            content: guidance,
            provider: "sis",
            model: "scope-policy",
            delegationMode: "okta",
            delegatedScopes,
          },
        });
      }
    }

    const allowedTools = chatToolsForScopes(delegatedScopes);

    const result = await runChatCompletion({
      systemPrompt,
      messages,
      model,
      provider,
      tools: allowedTools,
      runTool: async (name, input) => runSisTool(name, input, delegatedAccess),
    });

    console.log(
      `[chat] ok user=${admin.email} mode=okta provider=${result.provider} ms=${Date.now() - started} scopes=${delegatedScopes.length}`
    );
    res.json({
      data: {
        ...result,
        delegationMode: "okta",
        delegatedScopes,
      },
    });
  } catch (err) {
    console.error(`[chat] error user=${req.user?.email} ms=${Date.now() - started}`, err);
    if (err instanceof AppError) return next(err);
    return next(mapChatProviderError(err));
  }
});
