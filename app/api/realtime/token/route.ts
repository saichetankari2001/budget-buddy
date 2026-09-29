import { NextResponse } from 'next/server';
import * as Ably from 'ably';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { channelNameForUser } from '@/lib/realtime/publish';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new AppError(500, 'ABLY_API_KEY is not configured');
    }

    const client = new Ably.Rest(apiKey);
    // Scoped to exactly this user's own channel, resolved server-side from the session — never from
    // a client-supplied id — so a token minted here can never grant access to another user's
    // realtime updates. Same IDOR-safe pattern as every other route in this app. `subscribe`-only:
    // the browser never needs to publish.
    const tokenRequest = await client.auth.createTokenRequest({
      clientId: user.userId,
      capability: {
        [channelNameForUser(user.userId)]: ['subscribe'],
      },
    });

    return NextResponse.json(tokenRequest);
  } catch (error) {
    return handleRouteError(error);
  }
}
