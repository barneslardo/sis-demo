import { SIS_CHAT_TOOLS } from "./sis-tools.js";

export type ChatMessage = { role: string; content: string };

type ToolDef = (typeof SIS_CHAT_TOOLS)[number];

type ModelEntry = { id: string; label: string; provider: "litellm" };

// Every model goes through the OpenAI-compatible LLM gateway (LiteLLM), which
// tracks usage per demo site. gemma4 is self-hosted; grok-4.3 is xAI;
// claude-sonnet-5-5 is Anthropic.
const MODEL_CATALOG: ModelEntry[] = [
  { id: "gemma4", label: "Gemma 4 (self-hosted)", provider: "litellm" },
  { id: "grok-4.3", label: "Grok 4.3 (xAI)", provider: "litellm" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (Anthropic)", provider: "litellm" },
];

function gateway() {
  return {
    baseUrl: (process.env.LLM_BASE_URL ?? "").replace(/\/+$/, ""),
    apiKey: process.env.LLM_API_KEY ?? "",
    defaultModel: process.env.CHAT_DEFAULT_MODEL || "gemma4",
  };
}

async function runToolLoop(
  systemPrompt: string,
  messages: ChatMessage[],
  model: string,
  runTool: (name: string, input: Record<string, unknown>) => Promise<unknown>,
  toolDefs: readonly ToolDef[] = SIS_CHAT_TOOLS
): Promise<string> {
  const { baseUrl, apiKey } = gateway();
  const tools = toolDefs.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  const loopMessages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  for (let round = 0; round < 8; round++) {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: loopMessages, tools, max_tokens: 4096 }),
    });
    if (!resp.ok) throw new Error(`LLM gateway error ${resp.status}: ${await resp.text()}`);
    const data = (await resp.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message?: {
          content?: string;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
      }>;
    };
    const choice = data.choices?.[0];
    if (choice?.finish_reason !== "tool_calls" || !choice.message?.tool_calls?.length) {
      return choice?.message?.content || "No response from the model.";
    }
    loopMessages.push(choice.message);
    for (const tc of choice.message.tool_calls) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        /* model emitted malformed JSON — let the tool's validation answer */
      }
      const result = await runTool(tc.function.name, input);
      loopMessages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }
  return "I reached the tool-call limit. Please try a simpler question.";
}

export function listAvailableChatModels(): ModelEntry[] {
  const { baseUrl, apiKey } = gateway();
  return baseUrl && apiKey ? MODEL_CATALOG : [];
}

export async function runChatCompletion(opts: {
  systemPrompt: string;
  messages: ChatMessage[];
  model?: string;
  /** Ignored: the provider is always the LLM gateway. Kept for request compatibility. */
  provider?: string;
  runTool: (name: string, input: Record<string, unknown>) => Promise<unknown>;
  tools?: readonly ToolDef[];
}): Promise<{ content: string; provider: string; model: string }> {
  const allowed = listAvailableChatModels();
  if (!allowed.length) throw new Error("No LLM gateway configured — set LLM_BASE_URL and LLM_API_KEY");

  // Resolve strictly against the catalog: a model that isn't on it is ignored,
  // so a crafted request can't reach anything else.
  const requested = allowed.find((m) => m.id === opts.model);
  if (opts.model && !requested) {
    console.warn(`[chat] ignoring requested model "${opts.model}" — allowed: ${allowed.map((m) => m.id).join(", ")}`);
  }
  const chosen = requested ?? allowed.find((m) => m.id === gateway().defaultModel) ?? allowed[0];
  const content = await runToolLoop(opts.systemPrompt, opts.messages, chosen.id, opts.runTool, opts.tools ?? SIS_CHAT_TOOLS);
  return { content, provider: chosen.provider, model: chosen.id };
}
