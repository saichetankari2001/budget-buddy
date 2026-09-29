import * as Ably from 'ably';

let restClient: Ably.Rest | null = null;

function getClient(): Ably.Rest {
  if (!restClient) {
    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('ABLY_API_KEY is not configured');
    }
    restClient = new Ably.Rest(apiKey);
  }
  return restClient;
}

/**
 * The one place that defines a user's private realtime channel name. Both this file's publisher and
 * the token route (app/api/realtime/token/route.ts) must agree on this exact string, so it's exported
 * rather than duplicated in both places.
 */
export function channelNameForUser(userId: string): string {
  return `user:${userId}:cycle-updates`;
}

/**
 * Notifies any open tab for this user that their cash-flow data changed, so the dashboard orb and
 * cashflow chart can re-fetch and animate to the new values. Never throws: a failed publish is
 * logged and swallowed — live sync to *other* tabs/devices is additive, not load-bearing, since the
 * caller's own mutation has already succeeded and its own response already reflects the change.
 * Callers should still `await` this (rather than leave the promise dangling) so the publish attempt
 * actually completes before a serverless function's invocation ends.
 */
export async function publishCycleUpdate(userId: string): Promise<void> {
  try {
    const channel = getClient().channels.get(channelNameForUser(userId));
    await channel.publish('cycle-updated', {});
  } catch (error) {
    console.error(`Failed to publish cycle-updated event for user ${userId}:`, error);
  }
}
