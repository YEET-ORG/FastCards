// Qwen provider — talks to the team's hosted Qwen through the
// OpenAI-compatible chat-completions protocol (vLLM/SGLang/Ollama/
// DashScope all expose this) with function calling.
//
// Config:
//   QWEN_BASE_URL  e.g. http://qwen-host:8000/v1   (required for live mode)
//   QWEN_MODEL     the served model name            (default "qwen3")
//   QWEN_API_KEY   optional bearer token
//
// Safety properties (spec §14): tool arguments are parsed with
// JSON.parse and validated against the tool's zod schema before any
// service call — malformed or unknown-tool calls return an error result
// to the model, never a crash and never an unvalidated execution.

import { z } from 'zod';

import type { ToolDef } from './tools.js';

interface QwenToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface QwenChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: QwenToolCall[];
  tool_call_id?: string;
  /** Some Qwen servers emit reasoning here; never forwarded to clients. */
  reasoning_content?: string;
}

export interface QwenConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
  maxIterations?: number;
}

export function qwenConfigFromEnv(): QwenConfig | null {
  const baseUrl = process.env.QWEN_BASE_URL;
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    model: process.env.QWEN_MODEL ?? 'qwen3',
    apiKey: process.env.QWEN_API_KEY,
  };
}

function toOpenAiTools(tools: ToolDef[]) {
  return tools.map((t) => {
    const schema = z.toJSONSchema(t.schema) as Record<string, unknown>;
    delete schema.$schema;
    return {
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: schema },
    };
  });
}

async function chatCompletion(
  cfg: QwenConfig,
  body: Record<string, unknown>,
): Promise<QwenChatMessage> {
  const fetchFn = cfg.fetchFn ?? fetch;
  const res = await fetchFn(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qwen returned ${res.status}: ${text.slice(0, 300)}`);
  }
  const json: any = await res.json();
  const message = json?.choices?.[0]?.message;
  if (!message) throw new Error('Qwen response had no message.');
  return message as QwenChatMessage;
}

/**
 * Manual tool loop: request → run validated tool calls → feed results
 * back → repeat until the model answers in text (or the iteration cap).
 */
export async function runQwenTurn(
  cfg: QwenConfig,
  system: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  tools: ToolDef[],
): Promise<string> {
  const toolIndex = new Map(tools.map((t) => [t.name, t]));
  const messages: QwenChatMessage[] = [
    { role: 'system', content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const openAiTools = toOpenAiTools(tools);
  const maxIterations = cfg.maxIterations ?? 8;

  for (let i = 0; i < maxIterations; i++) {
    const message = await chatCompletion(cfg, {
      model: cfg.model,
      messages,
      tools: openAiTools,
      tool_choice: 'auto',
      temperature: 0.3,
      max_tokens: 1200,
    });

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return (message.content ?? '').trim();
    }

    // Echo the assistant turn (with its tool calls), then answer each
    // call — all results in the same iteration, mirrored by id.
    messages.push({ role: 'assistant', content: message.content ?? '', tool_calls: toolCalls });

    for (const call of toolCalls) {
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: runToolCall(toolIndex, call),
      });
    }
  }

  return 'I could not finish that request — please try again with a simpler ask.';
}

function runToolCall(toolIndex: Map<string, ToolDef>, call: QwenToolCall): string {
  const tool = toolIndex.get(call.function.name);
  if (!tool) {
    return JSON.stringify({ error: 'unknown_tool', message: `No tool named ${call.function.name}.` });
  }
  let rawInput: unknown;
  try {
    rawInput = call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    return JSON.stringify({ error: 'invalid_arguments', message: 'Arguments were not valid JSON.' });
  }
  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    return JSON.stringify({
      error: 'invalid_arguments',
      message: `Invalid arguments: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    });
  }
  return tool.run(parsed.data);
}
