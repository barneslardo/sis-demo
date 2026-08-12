import { AppError } from "../errors.js";
import { DCR_CATEGORIES, OAuthScopes, hasScope, type OAuthScope } from "@sis/shared";

type CategoryIntent = {
  scope: OAuthScope;
  label: string;
  owner: string;
  ask: RegExp;
};

/** User-message patterns → DCR category the question is asking about. */
const CATEGORY_INTENTS: CategoryIntent[] = [
  {
    scope: OAuthScopes.STUDENTS_ADA,
    label: "ADA accommodation records",
    owner: "Student Affairs",
    ask: /\b(ada\b|accomodat|accommodation|accommodations|disabilit)/i,
  },
  {
    scope: OAuthScopes.STUDENTS_FERPA,
    label: "FERPA records",
    owner: "Enrollment Counselor",
    ask: /\b(ferpa\b|directory opt-?out|education records release)/i,
  },
  {
    scope: OAuthScopes.STUDENTS_FINANCIAL,
    label: "financial aid records",
    owner: "Enrollment Counselor",
    ask: /\b(financial aid|fafsa|scholarship|outstanding balance|aid package|efc\b)/i,
  },
  {
    scope: OAuthScopes.STUDENTS_DISCIPLINARY,
    label: "disciplinary records",
    owner: "Student Affairs",
    ask: /\b(disciplinary|discipline incident|sanction|hearing officer)/i,
  },
  {
    scope: OAuthScopes.STUDENTS_COUNSELOR,
    label: "counselor notes",
    owner: "Student Affairs",
    ask: /\b(counselor note|guidance counselor|academic counselor note)/i,
  },
  {
    scope: OAuthScopes.STUDENTS_RISK,
    label: "risk indicators",
    owner: "Student Affairs",
    ask: /\b(at[- ]risk|high[- ]risk|risk indicator|intervention flag|academic probation)/i,
  },
  {
    scope: OAuthScopes.STUDENTS_ACADEMIC,
    label: "academic records",
    owner: "Student Affairs",
    ask: /\b(transcript|academic standing|credit hours earned|expected graduation)/i,
  },
];

const TOOL_CATEGORY_HINTS: Partial<Record<string, { label: string; owner: string }>> = {
  get_student_ferpa: { label: "FERPA records", owner: "Enrollment Counselor" },
  upsert_student_ferpa: { label: "FERPA records", owner: "Enrollment Counselor" },
  get_student_financial: { label: "financial aid records", owner: "Enrollment Counselor" },
  upsert_student_financial: { label: "financial aid records", owner: "Enrollment Counselor" },
  get_student_ada: { label: "ADA accommodation records", owner: "Student Affairs" },
  upsert_student_ada: { label: "ADA accommodation records", owner: "Student Affairs" },
  get_student_disciplinary: { label: "disciplinary records", owner: "Student Affairs" },
  add_student_disciplinary_incident: { label: "disciplinary records", owner: "Student Affairs" },
  get_student_counselor_notes: { label: "counselor notes", owner: "Student Affairs" },
  add_student_counselor_note: { label: "counselor notes", owner: "Student Affairs" },
  get_student_risk: { label: "risk indicators", owner: "Student Affairs" },
  upsert_student_risk: { label: "risk indicators", owner: "Student Affairs" },
  list_high_risk_students: { label: "risk indicators", owner: "Student Affairs" },
  get_student_academic: { label: "academic records", owner: "Student Affairs" },
  upsert_student_academic: { label: "academic records", owner: "Student Affairs" },
  create_student_with_records: { label: "full multi-category student records", owner: "Enrollment Admin" },
};

function scopeList(scopes: string[]): string {
  return scopes.length ? scopes.join(", ") : "(none)";
}

export function buildScopeAccessDeniedMessage(opts: {
  categoryLabel: string;
  ownerPersona: string;
  requiredScopes: OAuthScope[];
  grantedScopes: string[];
  persona?: string;
  toolName?: string;
}): string {
  const role = opts.persona ? `**${opts.persona}**` : "your role";
  const required = opts.requiredScopes.join(", ");
  return [
    `I can't access **${opts.categoryLabel}** with your current permissions.`,
    "",
    `${role} is not granted the required OAuth scope (${required}). In this demo, that dataset is owned by **${opts.ownerPersona}** staff.`,
    "",
    `Your effective scopes: ${scopeList(opts.grantedScopes)}.`,
    "",
    "I can still help with student roster search, core profile fields, and any other categories your scopes allow. Ask me to rephrase within those boundaries, or sign in with a persona that includes the needed scope.",
  ].join("\n");
}

/** Fast path: answer out-of-scope category questions without calling the LLM. */
export function tryScopeGuidanceReply(
  userMessage: string,
  grantedScopes: string[],
  persona?: string
): string | null {
  if (grantedScopes.includes(OAuthScopes.ADMIN)) return null;

  const text = userMessage.trim();
  if (!text) return null;

  for (const intent of CATEGORY_INTENTS) {
    if (!intent.ask.test(text)) continue;
    if (hasScope(grantedScopes, intent.scope)) continue;
    return buildScopeAccessDeniedMessage({
      categoryLabel: intent.label,
      ownerPersona: intent.owner,
      requiredScopes: [intent.scope],
      grantedScopes,
      persona,
    });
  }

  return null;
}

export function formatToolScopeDenied(
  toolName: string,
  requiredScopes: OAuthScope[],
  grantedScopes: string[]
) {
  const hint = TOOL_CATEGORY_HINTS[toolName];
  const dcr = DCR_CATEGORIES.find((c) => requiredScopes.includes(c.scope));

  const userMessage = buildScopeAccessDeniedMessage({
    categoryLabel: hint?.label ?? dcr?.label ?? toolName.replaceAll("_", " "),
    ownerPersona: hint?.owner ?? dcr?.staffGroup ?? "the appropriate staff persona",
    requiredScopes,
    grantedScopes,
    toolName,
  });

  return {
    error: "insufficient_scope",
    tool: toolName,
    requiredScopes,
    grantedScopes,
    userMessage,
  };
}

export function mapChatProviderError(err: unknown): AppError {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("429") || msg.includes("resource-exhausted") || /rate limit/i.test(msg)) {
    return new AppError(
      503,
      "LLM_RATE_LIMIT",
      "The AI provider is temporarily busy. Wait a moment and try again, or choose another model from the chat dropdown."
    );
  }
  if (/API key is not configured/i.test(msg)) {
    return new AppError(503, "LLM_DISABLED", msg);
  }
  return new AppError(
    502,
    "LLM_ERROR",
    "The assistant could not complete your request. Please try again or rephrase your question."
  );
}
