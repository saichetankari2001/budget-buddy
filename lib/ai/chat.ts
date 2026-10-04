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
      {
        name: 'add_income_source',
        description: "Add a new income source for the user — a job, gig, or any recurring or irregular way they earn money",
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'A short name for this income source, e.g. "Casual job" or "Uber"' },
            type: { type: 'string', enum: ['FIXED', 'IRREGULAR'], description: 'FIXED if the amount and schedule are predictable; IRREGULAR if the amount varies (e.g. gig work)' },
            amount: { type: 'number', description: 'The amount per occurrence in AUD, only for FIXED sources' },
            recurrenceInterval: { type: 'string', enum: ['WEEKLY', 'MONTHLY', 'YEARLY'], description: 'How often it recurs, only for FIXED sources' },
            startDate: { type: 'string', description: 'ISO date string for when this income starts' },
          },
          required: ['name', 'type', 'startDate'],
        },
      },
      {
        name: 'log_income',
        description: "Log an actual amount of money the user just received from an existing income source",
        parameters: {
          type: 'object',
          properties: {
            sourceName: { type: 'string', description: 'The name of the income source this money came from' },
            amount: { type: 'number', description: 'The amount received, in AUD' },
          },
          required: ['sourceName', 'amount'],
        },
      },
      {
        name: 'add_bill',
        description: "Add a new bill — a future obligation the user needs to pay on a specific date",
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'A short name for this bill, e.g. "Rent" or "Phone bill"' },
            amount: { type: 'number', description: 'The amount owed, in AUD' },
            dueDate: { type: 'string', description: 'ISO date string for when this bill is due' },
            recurrenceInterval: { type: 'string', enum: ['WEEKLY', 'MONTHLY', 'YEARLY'], description: 'How often it recurs, omit for a one-time bill' },
          },
          required: ['name', 'amount', 'dueDate'],
        },
      },
      {
        name: 'mark_bill_paid',
        description: "Mark a bill as paid, recording it as a real expense",
        parameters: {
          type: 'object',
          properties: { billName: { type: 'string', description: 'The name of the bill that was paid' } },
          required: ['billName'],
        },
      },
      {
        name: 'log_expense',
        description:
          "Log a purchase the user just made as a real expense. Infer a short description and a category name " +
          "(e.g. Food, Transport, Housing, Entertainment, Utilities) from what they said; if no category is obvious, omit it.",
        parameters: {
          type: 'object',
          properties: {
            amount: { type: 'number', description: 'The amount spent, in AUD' },
            description: { type: 'string', description: 'A short description of the purchase, e.g. "Groceries"' },
            categoryName: { type: 'string', description: 'The best-matching category name, if one is evident' },
          },
          required: ['amount', 'description'],
        },
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
  addIncomeSource: (input: {
    name: string;
    type: 'FIXED' | 'IRREGULAR';
    amount?: number;
    recurrenceInterval?: 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    startDate: string;
  }) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
  logIncome: (input: { sourceName: string; amount: number }) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
  addBill: (input: {
    name: string;
    amount: number;
    dueDate: string;
    recurrenceInterval?: 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  }) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
  markBillPaid: (billName: string) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
  logExpense: (input: {
    amount: number;
    description: string;
    categoryName?: string;
  }) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
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
      body: JSON.stringify({
        contents,
        tools: TOOLS,
        systemInstruction: {
          parts: [
            {
              text: 'You are a friendly, concise personal-finance coach speaking directly to the user (use "you"). All amounts are in Australian dollars (AUD). Do not use markdown formatting.',
            },
          ],
        },
      }),
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
    try {
      if (name === 'update_cycle_amount') {
        if (typeof args.newAmount !== 'number') {
          toolResult = { success: false, error: 'newAmount must be a number' };
        } else {
          toolResult = await handlers.updateCycleAmount(args.newAmount);
        }
      } else if (name === 'cancel_cycle') {
        toolResult = await handlers.cancelCycle();
      } else if (name === 'add_income_source') {
        if (typeof args.name !== 'string') {
          toolResult = { success: false, error: 'name must be a string' };
        } else if (args.type !== 'FIXED' && args.type !== 'IRREGULAR') {
          toolResult = { success: false, error: 'type must be FIXED or IRREGULAR' };
        } else if (typeof args.startDate !== 'string') {
          toolResult = { success: false, error: 'startDate must be a string' };
        } else {
          toolResult = await handlers.addIncomeSource({
            name: args.name,
            type: args.type,
            amount: typeof args.amount === 'number' ? args.amount : undefined,
            recurrenceInterval: args.recurrenceInterval as 'WEEKLY' | 'MONTHLY' | 'YEARLY' | undefined,
            startDate: args.startDate,
          });
        }
      } else if (name === 'log_income') {
        if (typeof args.sourceName !== 'string') {
          toolResult = { success: false, error: 'sourceName must be a string' };
        } else if (typeof args.amount !== 'number') {
          toolResult = { success: false, error: 'amount must be a number' };
        } else {
          toolResult = await handlers.logIncome({ sourceName: args.sourceName, amount: args.amount });
        }
      } else if (name === 'add_bill') {
        if (typeof args.name !== 'string') {
          toolResult = { success: false, error: 'name must be a string' };
        } else if (typeof args.amount !== 'number') {
          toolResult = { success: false, error: 'amount must be a number' };
        } else if (typeof args.dueDate !== 'string') {
          toolResult = { success: false, error: 'dueDate must be a string' };
        } else {
          toolResult = await handlers.addBill({
            name: args.name,
            amount: args.amount,
            dueDate: args.dueDate,
            recurrenceInterval: args.recurrenceInterval as 'WEEKLY' | 'MONTHLY' | 'YEARLY' | undefined,
          });
        }
      } else if (name === 'mark_bill_paid') {
        if (typeof args.billName !== 'string') {
          toolResult = { success: false, error: 'billName must be a string' };
        } else {
          toolResult = await handlers.markBillPaid(args.billName);
        }
      } else if (name === 'log_expense') {
        if (typeof args.amount !== 'number') {
          toolResult = { success: false, error: 'amount must be a number' };
        } else if (typeof args.description !== 'string') {
          toolResult = { success: false, error: 'description must be a string' };
        } else {
          toolResult = await handlers.logExpense({
            amount: args.amount,
            description: args.description,
            categoryName: typeof args.categoryName === 'string' ? args.categoryName : undefined,
          });
        }
      } else {
        toolResult = { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (toolError) {
      // The tool ran and failed (e.g. a DB error) — distinct from never reaching Gemini at all.
      // Converting this into a normal {success:false} result lets it flow through the existing
      // Gemini-relay path, where the model can explain the failure conversationally.
      console.error(`Tool handler for "${name}" threw`, toolError);
      toolResult = { success: false, error: 'That action failed — try again.' };
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
  } catch (error) {
    console.error('generateChatReply failed', error);
    return FALLBACK_REPLY;
  }
}
