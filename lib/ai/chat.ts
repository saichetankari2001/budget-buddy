import { startOfSydneyDay } from '@/lib/utils/moneyCycle';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-120b';
const TIMEOUT_MS = 9000;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'start_cycle',
      description:
        "Start the user's first (or next) money cycle — required before most other budgeting actions make sense, since there's no active cycle yet to attach them to. " +
        'A cycle needs a starting amount (how much money they have right now, across everything they mentioned) and an end date (when this budgeting period ends). ' +
        'If they give an explicit end date or describe a pay cycle, use that; otherwise default to 30 days from today. ' +
        'Call this whenever the user describes their financial situation and has no active cycle yet — do not ask them to use a separate form first.',
      parameters: {
        type: 'object',
        properties: {
          startingAmount: { type: 'number', description: 'How much money they currently have, in AUD' },
          endDate: { type: 'string', description: 'ISO date string for when this budgeting cycle ends' },
        },
        required: ['startingAmount', 'endDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_cycle_amount',
      description: "Update the starting amount of the user's active money cycle, in Australian dollars",
      parameters: {
        type: 'object',
        properties: { newAmount: { type: 'number', description: 'The new starting amount in AUD' } },
        required: ['newAmount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_cycle',
      description: "Cancel the user's active money cycle entirely",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
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
  },
  {
    type: 'function',
    function: {
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
  },
  {
    type: 'function',
    function: {
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
  },
  {
    type: 'function',
    function: {
      name: 'mark_bill_paid',
      description: "Mark a bill as paid, recording it as a real expense",
      parameters: {
        type: 'object',
        properties: { billName: { type: 'string', description: 'The name of the bill that was paid' } },
        required: ['billName'],
      },
    },
  },
  {
    type: 'function',
    function: {
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
  },
  {
    type: 'function',
    function: {
      name: 'add_savings_goal',
      description: "Create a new savings goal the user wants to work toward — a named target amount, optionally with a target date",
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'A short name for this goal, e.g. "Laptop fund" or "Holiday"' },
          targetAmount: { type: 'number', description: 'The total amount the user wants to save, in AUD' },
          targetDate: { type: 'string', description: 'ISO date string for when they want to reach it, if mentioned' },
        },
        required: ['name', 'targetAmount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_savings_contribution',
      description: "Log money the user just put toward an existing savings goal",
      parameters: {
        type: 'object',
        properties: {
          goalName: { type: 'string', description: 'The name of the savings goal this money went toward' },
          amount: { type: 'number', description: 'The amount contributed, in AUD' },
        },
        required: ['goalName', 'amount'],
      },
    },
  },
];

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatToolHandlers {
  startCycle: (input: { startingAmount: number; endDate: string }) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
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
  addSavingsGoal: (input: {
    name: string;
    targetAmount: number;
    targetDate?: string;
  }) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
  logSavingsContribution: (input: { goalName: string; amount: number }) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
}

const FALLBACK_REPLY = "Sorry, I couldn't catch that — try again in a moment.";
const RATE_LIMIT_FALLBACK_REPLY = "I'm getting a lot of requests right now — give me a few seconds and try again.";

// A 429 is a known, transient condition (Groq's per-minute token budget), not a real failure — it
// deserves a distinct message telling the user to wait and retry, not the generic catch-all. This
// matters most for exactly the case that motivated it: the FIRST call's tool action can have
// already succeeded (e.g. a cycle really did get created) before the SECOND call hits this limit,
// so "try again" is accurate, while the generic "I couldn't catch that" reads as if nothing happened.
class GroqRateLimitError extends Error {
  constructor() {
    super('Groq API returned 429');
    this.name = 'GroqRateLimitError';
  }
}

interface GroqToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
}

async function callGroq(messages: GroqMessage[]): Promise<{ message: GroqMessage }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, messages, tools: TOOLS }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new GroqRateLimitError();
      }
      throw new Error(`Groq API returned ${response.status}`);
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    if (!message) {
      throw new Error('Groq API returned an unexpected response shape');
    }

    return { message };
  } finally {
    clearTimeout(timeout);
  }
}

type ToolResult = { success: boolean; error?: string; [key: string]: unknown };

async function dispatchTool(name: string, args: Record<string, unknown>, handlers: ChatToolHandlers): Promise<ToolResult> {
  if (name === 'start_cycle') {
    if (typeof args.startingAmount !== 'number') {
      return { success: false, error: 'startingAmount must be a number' };
    } else if (typeof args.endDate !== 'string') {
      return { success: false, error: 'endDate must be a string' };
    }
    return handlers.startCycle({ startingAmount: args.startingAmount, endDate: args.endDate });
  } else if (name === 'update_cycle_amount') {
    if (typeof args.newAmount !== 'number') {
      return { success: false, error: 'newAmount must be a number' };
    }
    return handlers.updateCycleAmount(args.newAmount);
  } else if (name === 'cancel_cycle') {
    return handlers.cancelCycle();
  } else if (name === 'add_income_source') {
    if (typeof args.name !== 'string') {
      return { success: false, error: 'name must be a string' };
    } else if (args.type !== 'FIXED' && args.type !== 'IRREGULAR') {
      return { success: false, error: 'type must be FIXED or IRREGULAR' };
    } else if (typeof args.startDate !== 'string') {
      return { success: false, error: 'startDate must be a string' };
    }
    return handlers.addIncomeSource({
      name: args.name,
      type: args.type,
      amount: typeof args.amount === 'number' ? args.amount : undefined,
      recurrenceInterval: args.recurrenceInterval as 'WEEKLY' | 'MONTHLY' | 'YEARLY' | undefined,
      startDate: args.startDate,
    });
  } else if (name === 'log_income') {
    if (typeof args.sourceName !== 'string') {
      return { success: false, error: 'sourceName must be a string' };
    } else if (typeof args.amount !== 'number') {
      return { success: false, error: 'amount must be a number' };
    }
    return handlers.logIncome({ sourceName: args.sourceName, amount: args.amount });
  } else if (name === 'add_bill') {
    if (typeof args.name !== 'string') {
      return { success: false, error: 'name must be a string' };
    } else if (typeof args.amount !== 'number') {
      return { success: false, error: 'amount must be a number' };
    } else if (typeof args.dueDate !== 'string') {
      return { success: false, error: 'dueDate must be a string' };
    }
    return handlers.addBill({
      name: args.name,
      amount: args.amount,
      dueDate: args.dueDate,
      recurrenceInterval: args.recurrenceInterval as 'WEEKLY' | 'MONTHLY' | 'YEARLY' | undefined,
    });
  } else if (name === 'mark_bill_paid') {
    if (typeof args.billName !== 'string') {
      return { success: false, error: 'billName must be a string' };
    }
    return handlers.markBillPaid(args.billName);
  } else if (name === 'log_expense') {
    if (typeof args.amount !== 'number') {
      return { success: false, error: 'amount must be a number' };
    } else if (typeof args.description !== 'string') {
      return { success: false, error: 'description must be a string' };
    }
    return handlers.logExpense({
      amount: args.amount,
      description: args.description,
      categoryName: typeof args.categoryName === 'string' ? args.categoryName : undefined,
    });
  } else if (name === 'add_savings_goal') {
    if (typeof args.name !== 'string') {
      return { success: false, error: 'name must be a string' };
    } else if (typeof args.targetAmount !== 'number') {
      return { success: false, error: 'targetAmount must be a number' };
    }
    return handlers.addSavingsGoal({
      name: args.name,
      targetAmount: args.targetAmount,
      targetDate: typeof args.targetDate === 'string' ? args.targetDate : undefined,
    });
  } else if (name === 'log_savings_contribution') {
    if (typeof args.goalName !== 'string') {
      return { success: false, error: 'goalName must be a string' };
    } else if (typeof args.amount !== 'number') {
      return { success: false, error: 'amount must be a number' };
    }
    return handlers.logSavingsContribution({ goalName: args.goalName, amount: args.amount });
  }
  return { success: false, error: `Unknown tool: ${name}` };
}

export async function generateChatReply(
  message: string,
  history: ChatHistoryMessage[],
  handlers: ChatToolHandlers
): Promise<string> {
  try {
    const systemMessage: GroqMessage = {
      role: 'system',
      content: `Today's date is ${startOfSydneyDay(new Date()).toISOString().slice(0, 10)} (Australia/Sydney). When the user gives a date with no year (e.g. "by December", "next month", "the 5th"), resolve it to the next real occurrence of that date on or after today — never a date in the past, and never a year from your training data. You are a friendly personal-finance coach speaking directly to the user (use "you"). They are new to budgeting and have no prior financial-management experience. All amounts are in Australian dollars (AUD). When a message describes several distinct things to act on (e.g. a starting cycle plus a bill plus an income source), call a tool for every one of them in this same turn rather than only the first — you are not limited to one tool call per message. Keep routine confirmations (e.g. logging an expense or income) short — one or two sentences. When a message naturally touches a money concept worth understanding (e.g. why a category is close to its limit, what a safe-to-spend balance means), briefly explain it in plain language so they build real financial awareness over time. Do not use markdown formatting.`,
    };

    let messages: GroqMessage[] = [
      systemMessage,
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    // A single user message can need more than one round of tool calls — e.g. the model tries
    // start_cycle, is told a cycle already exists, and then calls add_bill instead on the next
    // round. Loop until the model finally replies with text, bounded so a model that never
    // settles can't hang the request indefinitely.
    const MAX_TOOL_ROUNDS = 5;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await callGroq(messages);

      const toolCalls = response.message.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        return response.message.content ?? FALLBACK_REPLY;
      }

      // Run sequentially, not in parallel: a later call in the same turn (e.g. add_bill right after
      // start_cycle) can depend on an earlier one having already taken effect, and sequential
      // execution avoids any doubt about DB write ordering for a single user's actions.
      const toolMessages: GroqMessage[] = [];
      for (const toolCall of toolCalls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }
        const name = toolCall.function.name;

        let toolResult: ToolResult;
        try {
          toolResult = await dispatchTool(name, args, handlers);
        } catch (toolError) {
          // The tool ran and failed (e.g. a DB error) — distinct from never reaching Groq at all.
          // Converting this into a normal {success:false} result lets it flow through the existing
          // Groq-relay path, where the model can explain the failure conversationally.
          console.error(`Tool handler for "${name}" threw`, toolError);
          toolResult = { success: false, error: 'That action failed — try again.' };
        }
        toolMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(toolResult) });
      }

      messages = [
        ...messages,
        { role: 'assistant', content: response.message.content ?? null, tool_calls: response.message.tool_calls },
        ...toolMessages,
      ];
    }

    return FALLBACK_REPLY;
  } catch (error) {
    console.error('generateChatReply failed', error);
    if (error instanceof GroqRateLimitError) {
      return RATE_LIMIT_FALLBACK_REPLY;
    }
    return FALLBACK_REPLY;
  }
}
