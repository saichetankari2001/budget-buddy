const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';
const TIMEOUT_MS = 9000;

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'update_cycle_amount',
        description: "Update the starting amount of the user's active money cycle, in Australian dollars",
        parameters: {
          type: 'object',
          properties: { newAmount: { type: 'number', description: 'The new starting amount in AUD' } },
          required: ['newAmount'],
        },
      },
      {
        name: 'cancel_cycle',
        description: "Cancel the user's active money cycle entirely",
        parameters: { type: 'object', properties: {} },
      },
    ],
  },
];

export interface ChatHistoryMessage {
  role: 'user' | 'model';
  content: string;
}

export interface ChatToolHandlers {
  updateCycleAmount: (newAmount: number) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
  cancelCycle: () => Promise<{ success: boolean; error?: string }>;
}

const FALLBACK_REPLY = "Sorry, I couldn't catch that — try again in a moment.";

async function callGemini(contents: unknown[]): Promise<{ modelContent: unknown; text: string | undefined }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents, tools: TOOLS }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned ${response.status}`);
    }

    const data = await response.json();
    const modelContent = data?.candidates?.[0]?.content;
    const textPart = modelContent?.parts?.find((p: { text?: string }) => typeof p.text === 'string');
    return { modelContent, text: textPart?.text };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateChatReply(
  message: string,
  history: ChatHistoryMessage[],
  handlers: ChatToolHandlers
): Promise<string> {
  try {
    const contents = [
      ...history.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const first = await callGemini(contents);

    const functionCallPart = (
      first.modelContent as { parts?: { functionCall?: { name: string; args: Record<string, unknown> } }[] }
    )?.parts?.find((p) => p.functionCall);

    if (!functionCallPart?.functionCall) {
      return first.text ?? FALLBACK_REPLY;
    }

    const { name, args } = functionCallPart.functionCall;
    let toolResult: { success: boolean; error?: string; [key: string]: unknown };
    if (name === 'update_cycle_amount') {
      toolResult = await handlers.updateCycleAmount(args.newAmount as number);
    } else if (name === 'cancel_cycle') {
      toolResult = await handlers.cancelCycle();
    } else {
      toolResult = { success: false, error: `Unknown tool: ${name}` };
    }

    // NOTE: live-verified against the real Gemini API (gemini-3.6-flash) — the documented
    // `role: 'function'` for relaying a functionResponse is rejected with HTTP 400
    // ("Role 'function' is not supported. Please use a valid role: ... USER ... MODEL, USER.").
    // `role: 'user'` is what the real API accepts and responds to correctly.
    const second = await callGemini([
      ...contents,
      first.modelContent,
      { role: 'user', parts: [{ functionResponse: { name, response: toolResult } }] },
    ]);

    return second.text ?? FALLBACK_REPLY;
  } catch {
    return FALLBACK_REPLY;
  }
}
