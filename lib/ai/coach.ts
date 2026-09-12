import { buildFallbackPlanMessage, buildFallbackCheckInMessage } from '@/lib/utils/moneyCycle';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const TIMEOUT_MS = 5000;

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string' || text.length === 0) {
      throw new Error('Gemini API returned an unexpected response shape');
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generatePlanMessage(input: {
  startingAmount: number;
  committedSpend: number;
  daysRemaining: number;
  safeToSpend: number;
}): Promise<string> {
  const prompt =
    `You are a friendly, concise personal-finance coach speaking directly to the user (use "you"). ` +
    `They have $${input.startingAmount.toFixed(2)} for the next ${input.daysRemaining} days. ` +
    `$${input.committedSpend.toFixed(2)} is already committed to recurring bills, leaving them ` +
    `$${input.safeToSpend.toFixed(2)} a day to spend freely. Write one short, encouraging message ` +
    `(2-3 sentences) presenting this plan. Do not use markdown formatting.`;

  try {
    return await callGemini(prompt);
  } catch {
    return buildFallbackPlanMessage(input);
  }
}

export async function generateCheckInMessage(input: {
  spentSoFar: number;
  remainingAmount: number;
  daysRemaining: number;
  safeToSpend: number;
  pacingStatus: 'ON_TRACK' | 'OVER_PACE';
}): Promise<string> {
  const pacingHint =
    input.pacingStatus === 'OVER_PACE'
      ? 'they are spending faster than planned — gently suggest easing off'
      : 'they are on track — reassure them';
  const prompt =
    `You are a friendly, concise personal-finance coach speaking directly to the user (use "you"). ` +
    `They've spent $${input.spentSoFar.toFixed(2)} so far, with $${input.remainingAmount.toFixed(2)} left ` +
    `over ${input.daysRemaining} days (about $${input.safeToSpend.toFixed(2)}/day). Right now ${pacingHint}. ` +
    `Write one short daily check-in message (2-3 sentences). Do not use markdown formatting.`;

  try {
    return await callGemini(prompt);
  } catch {
    return buildFallbackCheckInMessage(input);
  }
}
