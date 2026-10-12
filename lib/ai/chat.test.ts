import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateChatReply } from './chat';

describe('generateChatReply', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('GROQ_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('replies directly when Groq responds with plain text (no tool call)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Sure, happy to help!' } }] }),
    } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn(),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn(),
      addBill: vi.fn(),
      markBillPaid: vi.fn(),
      logExpense: vi.fn(),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };
    const result = await generateChatReply('hey there', [], handlers);

    expect(result).toBe('Sure, happy to help!');
    expect(handlers.updateCycleAmount).not.toHaveBeenCalled();
  });

  it("anchors today's real date in the system prompt, so a bare relative date (e.g. 'by December') resolves against the actual current year, not the model's training-era guess", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T00:00:00.000Z'));

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Got it.' } }] }),
    } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn(),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn(),
      addBill: vi.fn(),
      markBillPaid: vi.fn(),
      logExpense: vi.fn(),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };
    await generateChatReply('I want to save $500 for a laptop by December', [], handlers);

    const [, requestInit] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(requestInit!.body as string);
    const systemText = body.messages[0].content as string;

    expect(body.messages[0].role).toBe('system');
    expect(systemText).toContain('2026-10-12');

    vi.useRealTimers();
  });

  it('calls update_cycle_amount when Groq requests it, then uses the follow-up reply', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'update_cycle_amount', arguments: '{"newAmount":700}' } }],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Done — updated to $700.' } }] }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn().mockResolvedValue({ success: true, remainingAmount: 700 }),
      cancelCycle: vi.fn(),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn(),
      addBill: vi.fn(),
      markBillPaid: vi.fn(),
      logExpense: vi.fn(),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };
    const result = await generateChatReply('change it to 700', [], handlers);

    expect(result).toBe('Done — updated to $700.');
    expect(handlers.updateCycleAmount).toHaveBeenCalledWith(700);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('calls cancel_cycle when Groq requests it', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'cancel_cycle', arguments: '{}' } }],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Your cycle has been cancelled.' } }] }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn().mockResolvedValue({ success: true }),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn(),
      addBill: vi.fn(),
      markBillPaid: vi.fn(),
      logExpense: vi.fn(),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };
    const result = await generateChatReply('cancel my cycle', [], handlers);

    expect(result).toBe('Your cycle has been cancelled.');
    expect(handlers.cancelCycle).toHaveBeenCalled();
  });

  it('relays a tool failure back to Groq rather than inventing error text itself', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'cancel_cycle', arguments: '{}' } }],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: "You don't have an active cycle to cancel." } }] }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn().mockResolvedValue({ success: false, error: 'No active cycle found' }),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn(),
      addBill: vi.fn(),
      markBillPaid: vi.fn(),
      logExpense: vi.fn(),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };
    await generateChatReply('cancel my cycle', [], handlers);

    const secondCallBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    const toolMessage = secondCallBody.messages.find((m: { role: string }) => m.role === 'tool');
    expect(JSON.parse(toolMessage.content)).toEqual({
      success: false,
      error: 'No active cycle found',
    });
    expect(toolMessage.tool_call_id).toBe('call_1');
  });

  it('returns a generic fallback message when the Groq call fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn(),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn(),
      addBill: vi.fn(),
      markBillPaid: vi.fn(),
      logExpense: vi.fn(),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };
    const result = await generateChatReply('change it to 700', [], handlers);

    expect(result).toBe("Sorry, I couldn't catch that — try again in a moment.");
  });

  it('logs the failure when the outer catch produces the fallback reply', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn(),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn(),
      addBill: vi.fn(),
      markBillPaid: vi.fn(),
      logExpense: vi.fn(),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };
    await generateChatReply('change it to 700', [], handlers);

    expect(consoleErrorSpy).toHaveBeenCalledWith('generateChatReply failed', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('sends a system message with AUD/persona framing on every Groq call', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Sure, happy to help!' } }] }),
    } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn(),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn(),
      addBill: vi.fn(),
      markBillPaid: vi.fn(),
      logExpense: vi.fn(),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };
    await generateChatReply('hey there', [], handlers);

    const requestBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(requestBody.messages[0].content).toContain('AUD');
    expect(requestBody.messages[0].content).toContain('Australian dollars');
  });

  it('relays a thrown error from a tool handler to Groq as a {success:false} result, and logs it, instead of letting the exception propagate', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'update_cycle_amount', arguments: '{"newAmount":700}' } }],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'That action failed — try again.' } }] }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn().mockRejectedValue(new Error('unexpected db failure')),
      cancelCycle: vi.fn(),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn(),
      addBill: vi.fn(),
      markBillPaid: vi.fn(),
      logExpense: vi.fn(),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };

    const result = await generateChatReply('change it to 700', [], handlers);

    // The exception never propagates out of generateChatReply — it resolves to Groq's
    // second-turn reply, exactly like any other tool failure.
    expect(result).toBe('That action failed — try again.');

    const secondCallBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    const toolMessage = secondCallBody.messages.find((m: { role: string }) => m.role === 'tool');
    expect(JSON.parse(toolMessage.content)).toEqual({
      success: false,
      error: 'That action failed — try again.',
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('calls addIncomeSource when Groq requests add_income_source, then uses the follow-up reply', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'add_income_source',
                      arguments: JSON.stringify({ name: 'Casual job', type: 'FIXED', amount: 30, recurrenceInterval: 'WEEKLY', startDate: '2026-09-29T00:00:00.000Z' }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Added your casual job — $30/week starting Sep 29.' } }] }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn(),
      addIncomeSource: vi.fn().mockResolvedValue({ success: true, id: 'income_1' }),
      logIncome: vi.fn(),
      addBill: vi.fn(),
      markBillPaid: vi.fn(),
      logExpense: vi.fn(),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };
    const result = await generateChatReply('I got a new casual job, $30/hour weekly starting next Monday', [], handlers);

    expect(result).toBe('Added your casual job — $30/week starting Sep 29.');
    expect(handlers.addIncomeSource).toHaveBeenCalledWith({
      name: 'Casual job',
      type: 'FIXED',
      amount: 30,
      recurrenceInterval: 'WEEKLY',
      startDate: '2026-09-29T00:00:00.000Z',
    });
  });

  it('calls logIncome when Groq requests log_income, then uses the follow-up reply', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'log_income', arguments: JSON.stringify({ sourceName: 'Uber', amount: 85 }) } }],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Logged $85 from Uber.' } }] }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn(),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn().mockResolvedValue({ success: true, id: 'entry_1' }),
      addBill: vi.fn(),
      markBillPaid: vi.fn(),
      logExpense: vi.fn(),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };
    const result = await generateChatReply('I just got $85 from Uber', [], handlers);

    expect(result).toBe('Logged $85 from Uber.');
    expect(handlers.logIncome).toHaveBeenCalledWith({ sourceName: 'Uber', amount: 85 });
  });

  it('calls addBill when Groq requests add_bill, then uses the follow-up reply', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'add_bill', arguments: JSON.stringify({ name: 'Phone', amount: 30, dueDate: '2026-10-02T00:00:00.000Z' }) } }],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Added your $30 phone bill, due Oct 2.' } }] }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn(),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn(),
      addBill: vi.fn().mockResolvedValue({ success: true, id: 'bill_1' }),
      markBillPaid: vi.fn(),
      logExpense: vi.fn(),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };
    const result = await generateChatReply('add a phone bill, $30, due Oct 2', [], handlers);

    expect(result).toBe('Added your $30 phone bill, due Oct 2.');
    expect(handlers.addBill).toHaveBeenCalledWith({ name: 'Phone', amount: 30, dueDate: '2026-10-02T00:00:00.000Z' });
  });

  it('calls markBillPaid when Groq requests mark_bill_paid, then uses the follow-up reply', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'mark_bill_paid', arguments: JSON.stringify({ billName: 'Phone' }) } }],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Marked your phone bill as paid.' } }] }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn(),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn(),
      addBill: vi.fn(),
      markBillPaid: vi.fn().mockResolvedValue({ success: true, expenseId: 'expense_1' }),
      logExpense: vi.fn(),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };
    const result = await generateChatReply('I paid the phone bill', [], handlers);

    expect(result).toBe('Marked your phone bill as paid.');
    expect(handlers.markBillPaid).toHaveBeenCalledWith('Phone');
  });

  it('calls logExpense when Groq requests log_expense, then uses the follow-up reply', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'log_expense', arguments: JSON.stringify({ amount: 20, description: 'Groceries', categoryName: 'Food' }) },
                  },
                ],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Logged $20 for Groceries under Food.' } }] }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn(),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn(),
      addBill: vi.fn(),
      markBillPaid: vi.fn(),
      logExpense: vi.fn().mockResolvedValue({ success: true, id: 'expense_1', categoryName: 'Food' }),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };
    const result = await generateChatReply('I spent $20 on groceries', [], handlers);

    expect(result).toBe('Logged $20 for Groceries under Food.');
    expect(handlers.logExpense).toHaveBeenCalledWith({ amount: 20, description: 'Groceries', categoryName: 'Food' });
  });

  it('calls logExpense with categoryName omitted when Groq has no clear category to infer', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'log_expense', arguments: JSON.stringify({ amount: 15, description: 'Random stuff' }) } }],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Logged $15 for Random stuff.' } }] }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn(),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn(),
      addBill: vi.fn(),
      markBillPaid: vi.fn(),
      logExpense: vi.fn().mockResolvedValue({ success: true, id: 'expense_2', categoryName: 'Other' }),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };
    const result = await generateChatReply('spent $15 on random stuff', [], handlers);

    expect(result).toBe('Logged $15 for Random stuff.');
    expect(handlers.logExpense).toHaveBeenCalledWith({ amount: 15, description: 'Random stuff', categoryName: undefined });
  });

  it('relays a thrown error from the addBill handler to Groq as a {success:false} result, and logs it, instead of letting the exception propagate', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'add_bill', arguments: JSON.stringify({ name: 'Phone', amount: 30, dueDate: '2026-10-02T00:00:00.000Z' }) } }],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'That action failed — try again.' } }] }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn(),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn(),
      addBill: vi.fn().mockRejectedValue(new Error('unexpected db failure')),
      markBillPaid: vi.fn(),
      logExpense: vi.fn(),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };

    const result = await generateChatReply('add a phone bill, $30, due Oct 2', [], handlers);

    expect(result).toBe('That action failed — try again.');

    const secondCallBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    const toolMessage = secondCallBody.messages.find((m: { role: string }) => m.role === 'tool');
    expect(JSON.parse(toolMessage.content)).toEqual({
      success: false,
      error: 'That action failed — try again.',
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('treats a non-numeric args.newAmount as a validation failure relayed to Groq, without calling the handler', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'update_cycle_amount', arguments: JSON.stringify({ newAmount: 'seven hundred' }) } }],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: "I couldn't tell what amount you meant." } }] }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn(),
      addIncomeSource: vi.fn(),
      logIncome: vi.fn(),
      addBill: vi.fn(),
      markBillPaid: vi.fn(),
      logExpense: vi.fn(),
      addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn(),
    };
    const result = await generateChatReply('change it to some amount', [], handlers);

    expect(result).toBe("I couldn't tell what amount you meant.");
    expect(handlers.updateCycleAmount).not.toHaveBeenCalled();

    const secondCallBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    const toolMessage = secondCallBody.messages.find((m: { role: string }) => m.role === 'tool');
    expect(JSON.parse(toolMessage.content)).toEqual({
      success: false,
      error: 'newAmount must be a number',
    });
  });

  it('calls addSavingsGoal when Groq requests add_savings_goal, then uses the follow-up reply', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'add_savings_goal', arguments: JSON.stringify({ name: 'Laptop fund', targetAmount: 1500, targetDate: '2026-12-25T00:00:00.000Z' }) },
                  },
                ],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: "Got it — I've set up your Laptop fund goal." } }] }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(), cancelCycle: vi.fn(), addIncomeSource: vi.fn(), logIncome: vi.fn(),
      addBill: vi.fn(), markBillPaid: vi.fn(), logExpense: vi.fn(),
      addSavingsGoal: vi.fn().mockResolvedValue({ success: true, id: 'goal_1' }),
      logSavingsContribution: vi.fn(),
    };

    const result = await generateChatReply('I want to save $1500 for a laptop by Christmas', [], handlers);

    expect(handlers.addSavingsGoal).toHaveBeenCalledWith({ name: 'Laptop fund', targetAmount: 1500, targetDate: '2026-12-25T00:00:00.000Z' });
    expect(result).toBe("Got it — I've set up your Laptop fund goal.");
  });

  it('calls logSavingsContribution when Groq requests log_savings_contribution', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'log_savings_contribution', arguments: JSON.stringify({ goalName: 'Laptop fund', amount: 50 }) } }],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Nice, $50 closer to your laptop fund.' } }] }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(), cancelCycle: vi.fn(), addIncomeSource: vi.fn(), logIncome: vi.fn(),
      addBill: vi.fn(), markBillPaid: vi.fn(), logExpense: vi.fn(), addSavingsGoal: vi.fn(),
      logSavingsContribution: vi.fn().mockResolvedValue({ success: true, id: 'contrib_1' }),
    };

    const result = await generateChatReply('I put $50 towards my laptop fund', [], handlers);

    expect(handlers.logSavingsContribution).toHaveBeenCalledWith({ goalName: 'Laptop fund', amount: 50 });
    expect(result).toBe('Nice, $50 closer to your laptop fund.');
  });
});
