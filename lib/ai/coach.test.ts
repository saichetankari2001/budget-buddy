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

  it('includes the shortfall warning in the prompt sent to Gemini when present', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    } as Response);

    await generatePlanMessage({ ...input, shortfallWarning: "you're projected to be short before rent clears on the 30th" });

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(options!.body as string);
    const prompt = body.contents[0].parts[0].text;
    expect(prompt).toContain("you're projected to be short before rent clears on the 30th");
  });

  it('omits any shortfall text from the prompt when shortfallWarning is not present', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    } as Response);

    await generatePlanMessage(input);

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(options!.body as string);
    const prompt = body.contents[0].parts[0].text;
    expect(prompt).not.toContain('Importantly:');
  });

  it('appends the shortfall warning to the fallback message when the Gemini call fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));

    const result = await generatePlanMessage({ ...input, shortfallWarning: "you're projected to be short before rent clears on the 30th" });
    expect(result).toContain("you're projected to be short before rent clears on the 30th");
  });

  it('includes the previous cycle score in the prompt sent to Gemini when present', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    } as Response);

    await generatePlanMessage({ ...input, previousCycleScore: 78 });

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(options!.body as string);
    const prompt = body.contents[0].parts[0].text;
    expect(prompt).toContain('78');
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
    expect(result).toContain('spending a bit faster than planned');
  });

  it('includes the shortfall warning in the prompt sent to Gemini when present', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    } as Response);

    await generateCheckInMessage({ ...input, shortfallWarning: "you're projected to be short before rent clears on the 30th" });

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(options!.body as string);
    const prompt = body.contents[0].parts[0].text;
    expect(prompt).toContain("you're projected to be short before rent clears on the 30th");
  });

  it('omits any shortfall text from the prompt when shortfallWarning is not present', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    } as Response);

    await generateCheckInMessage(input);

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(options!.body as string);
    const prompt = body.contents[0].parts[0].text;
    expect(prompt).not.toContain('Importantly:');
  });

  it('appends the shortfall warning to the fallback message when the Gemini call fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));

    const result = await generateCheckInMessage({ ...input, shortfallWarning: "you're projected to be short before rent clears on the 30th" });
    expect(result).toContain("you're projected to be short before rent clears on the 30th");
  });

  it('includes the health score and delta in the prompt sent to Gemini when present', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    } as Response);

    await generateCheckInMessage({ ...input, healthScore: { total: 82, delta: 5 } });

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(options!.body as string);
    const prompt = body.contents[0].parts[0].text;
    expect(prompt).toContain('82');
    expect(prompt).toContain('5');
  });
});
