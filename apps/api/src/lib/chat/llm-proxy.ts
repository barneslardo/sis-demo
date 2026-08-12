import { SIS_CHAT_TOOLS, runSisTool } from "./sis-tools.js";

export type ChatMessage = { role: string; content: string };

type ToolDef = (typeof SIS_CHAT_TOOLS)[number];

async function runOpenAiLoop(
  systemPrompt: string,
  messages: ChatMessage[],
  model: string,
  runTool: (name: string, input: Record<string, unknown>) => Promise<unknown>,
  toolDefs: readonly ToolDef[] = SIS_CHAT_TOOLS
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const tools = toolDefs.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  let loopMessages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  for (let round = 0; round < 8; round++) {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: loopMessages,
        tools,
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI error ${resp.status}: ${await resp.text()}`);
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
    const toolMsgs = [];
    for (const tc of choice.message.tool_calls) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        /* empty */
      }
      const result = await runTool(tc.function.name, input);
      toolMsgs.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
    loopMessages.push(...toolMsgs);
  }
  return "I reached the tool-call limit. Please try a simpler question.";
}

async function runGrokLoop(
  systemPrompt: string,
  messages: ChatMessage[],
  model: string,
  runTool: (name: string, input: Record<string, unknown>) => Promise<unknown>,
  toolDefs: readonly ToolDef[] = SIS_CHAT_TOOLS
): Promise<string> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) throw new Error("GROK_API_KEY is not configured");

  const tools = toolDefs.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  let loopMessages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  for (let round = 0; round < 8; round++) {
    const resp = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "grok-4.3",
        messages: loopMessages,
        tools,
        max_tokens: 4096,
      }),
    });
    if (!resp.ok) throw new Error(`Grok error ${resp.status}: ${await resp.text()}`);
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
    const toolMsgs = [];
    for (const tc of choice.message.tool_calls) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        /* empty */
      }
      const result = await runTool(tc.function.name, input);
      toolMsgs.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
    loopMessages.push(...toolMsgs);
  }
  return "I reached the tool-call limit. Please try a simpler question.";
}

async function runAnthropicLoop(
  systemPrompt: string,
  messages: ChatMessage[],
  model: string,
  runTool: (name: string, input: Record<string, unknown>) => Promise<unknown>,
  toolDefs: readonly ToolDef[] = SIS_CHAT_TOOLS
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const tools = toolDefs.map((t: ToolDef) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  let loopMessages: Array<Record<string, unknown>> = messages.filter((m) => m.role !== "system");

  for (let round = 0; round < 8; round++) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages: loopMessages,
      }),
    });
    if (!resp.ok) throw new Error(`Anthropic error ${resp.status}: ${await resp.text()}`);
    const data = (await resp.json()) as {
      stop_reason?: string;
      content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    };
    if (data.stop_reason === "end_turn" || !data.content?.some((b) => b.type === "tool_use")) {
      return data.content?.filter((b) => b.type === "text").map((b) => b.text).join("\n") || "No response.";
    }
    loopMessages.push({ role: "assistant", content: data.content });
    const toolResults = [];
    for (const block of data.content ?? []) {
      if (block.type !== "tool_use" || !block.id) continue;
      const result = await runTool(block.name ?? "", block.input ?? {});
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    loopMessages.push({ role: "user", content: toolResults });
  }
  return "I reached the tool-call limit. Please try a simpler question.";
}

export function listAvailableChatModels() {
  const models: Array<{ id: string; label: string; provider: string }> = [];
  // Prefer Grok 4.3 as the default chat model when configured.
  if (process.env.GROK_API_KEY) {
    models.push({ id: "grok-4.3", label: "Grok 4.3 (xAI)", provider: "grok" });
  }
  if (process.env.OPENAI_API_KEY) {
    models.push(
      { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "openai" },
      { id: "gpt-4o", label: "GPT-4o", provider: "openai" }
    );
  }
  if (process.env.ANTHROPIC_API_KEY) {
    models.push(
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet", provider: "anthropic" }
    );
  }
  return models;
}

function defaultProvider(): string {
  if (process.env.GROK_API_KEY) return "grok";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "anthropic";
}

export async function runChatCompletion(opts: {
  systemPrompt: string;
  messages: ChatMessage[];
  model?: string;
  provider?: string;
  runTool: (name: string, input: Record<string, unknown>) => Promise<unknown>;
  tools?: readonly ToolDef[];
}): Promise<{ content: string; provider: string; model: string }> {
  const provider = opts.provider || defaultProvider();
  const model =
    opts.model ||
    (provider === "anthropic"
      ? "claude-sonnet-4-20250514"
      : provider === "grok"
        ? "grok-4.3"
        : "gpt-4o-mini");
  const toolDefs = opts.tools ?? SIS_CHAT_TOOLS;

  let content: string;
  if (provider === "anthropic") {
    content = await runAnthropicLoop(opts.systemPrompt, opts.messages, model, opts.runTool, toolDefs);
  } else if (provider === "grok") {
    content = await runGrokLoop(opts.systemPrompt, opts.messages, model, opts.runTool, toolDefs);
  } else {
    content = await runOpenAiLoop(opts.systemPrompt, opts.messages, model, opts.runTool, toolDefs);
  }
  return { content, provider, model };
}
