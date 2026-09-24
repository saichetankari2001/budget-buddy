import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateChatReply } from './chat';

describe('generateChatReply', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('replies directly when Gemini responds with plain text (no tool call)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { role: 'model', parts: [{ text: 'Sure, happy to help!' }] } }] }),
    } as Response);

    const handlers = { updateCycleAmount: vi.fn(), cancelCycle: vi.fn() };
    const result = await generateChatReply('hey there', [], handlers);

    expect(result).toBe('Sure, happy to help!');
    expect(handlers.updateCycleAmount).not.toHaveBeenCalled();
  });

  it('calls update_cycle_amount when Gemini requests it, then uses the follow-up reply', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ functionCall: { name: 'update_cycle_amount', args: { newAmount: 700 } } }],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { role: 'model', parts: [{ text: 'Done — updated to $700.' }] } }],
        }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn().mockResolvedValue({ success: true, remainingAmount: 700 }),
      cancelCycle: vi.fn(),
    };
    const result = await generateChatReply('change it to 700', [], handlers);

    expect(result).toBe('Done — updated to $700.');
    expect(handlers.updateCycleAmount).toHaveBeenCalledWith(700);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('calls cancel_cycle when Gemini requests it', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'cancel_cycle', args: {} } }] } }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { role: 'model', parts: [{ text: 'Your cycle has been cancelled.' }] } }],
        }),
      } as Response);

    const handlers = { updateCycleAmount: vi.fn(), cancelCycle: vi.fn().mockResolvedValue({ success: true }) };
    const result = await generateChatReply('cancel my cycle', [], handlers);

    expect(result).toBe('Your cycle has been cancelled.');
    expect(handlers.cancelCycle).toHaveBeenCalled();
  });

  it('relays a tool failure back to Gemini rather than inventing error text itself', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'cancel_cycle', args: {} } }] } }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { role: 'model', parts: [{ text: "You don't have an active cycle to cancel." }] } }],
        }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn().mockResolvedValue({ success: false, error: 'No active cycle found' }),
    };
    await generateChatReply('cancel my cycle', [], handlers);

    const secondCallBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    // NOTE: live-verified against the real Gemini API (gemini-3.6-flash) — a `role: 'function'`
    // content entry is rejected outright with HTTP 400 ("Role 'function' is not supported").
    // The implementation sends the functionResponse back under role 'user' instead, so this
    // assertion locates the entry by its functionResponse part rather than by role name.
    const functionResponsePart = secondCallBody.contents.find((c: { parts?: { functionResponse?: unknown }[] }) =>
      c.parts?.some((p) => p.functionResponse)
    );
    expect(functionResponsePart.parts[0].functionResponse.response).toEqual({
      success: false,
      error: 'No active cycle found',
    });
  });

  it('returns a generic fallback message when the Gemini call fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));

    const handlers = { updateCycleAmount: vi.fn(), cancelCycle: vi.fn() };
    const result = await generateChatReply('change it to 700', [], handlers);

    expect(result).toBe("Sorry, I couldn't catch that — try again in a moment.");
  });
});
