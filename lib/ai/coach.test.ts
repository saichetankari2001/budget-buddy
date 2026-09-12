import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generatePlanMessage, generateCheckInMessage } from './coach';

describe('generatePlanMessage', () => {
  const input = { startingAmount: 500, committedSpend: 200, daysRemaining: 10, safeToSpend: 30 };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns the AI-generated text when the Gemini call succeeds', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Here is your plan for the next 10 days.' }] } }],
      }),
    } as Response);

    const result = await generatePlanMessage(input);
    expect(result).toBe('Here is your plan for the next 10 days.');
  });

  it('falls back to the template message when the Gemini call throws', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));

    const result = await generatePlanMessage(input);
    expect(result).toContain('$500.00');
    expect(result).toContain('$30.00');
  });

  it('falls back to the template message when Gemini returns a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 429 } as Response);

    const result = await generatePlanMessage(input);
    expect(result).toContain('$500.00');
  });

  it('falls back to the template message when the response shape is malformed', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

    const result = await generatePlanMessage(input);
    expect(result).toContain('$500.00');
  });
});

describe('generateCheckInMessage', () => {
  const input = {
    spentSoFar: 150,
    remainingAmount: 350,
    daysRemaining: 8,
    safeToSpend: 43.75,
    pacingStatus: 'OVER_PACE' as const,
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns the AI-generated text when the Gemini call succeeds', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Ease off a little today.' }] } }] }),
    } as Response);

    const result = await generateCheckInMessage(input);
    expect(result).toBe('Ease off a little today.');
  });

  it('falls back to the template message on failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('timeout'));

    const result = await generateCheckInMessage(input);
    expect(result.toLowerCase()).toContain('over');
  });
});
