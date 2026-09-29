'use client';

import { useEffect, useRef } from 'react';
import * as Ably from 'ably';

/**
 * Subscribes to this signed-in user's private realtime channel and calls `onUpdate` whenever their
 * cash-flow data changes elsewhere (another tab, the AI coach chat, a bill/income mutation). The
 * token endpoint resolves the caller's own identity server-side via the session cookie — this hook
 * never accepts a user id, matching this app's existing IDOR-safe convention. `onUpdate` is expected
 * to trigger whatever refetch mechanism the calling component already has (e.g. bumping a
 * `refreshKey` state), not to carry the new data itself.
 */
export function useRealtimeCycleUpdates(onUpdate: () => void): void {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const client = new Ably.Realtime({ authUrl: '/api/realtime/token' });

    client.auth.authorize().then((tokenDetails) => {
      // The token's own capability grant names exactly one channel — this user's own — so the
      // client learns its channel name from the grant itself rather than constructing it
      // independently, keeping channelNameForUser (lib/realtime/publish.ts) the single source of
      // truth for that string.
      const capability = JSON.parse(tokenDetails.capability) as Record<string, string[]>;
      const channelName = Object.keys(capability)[0];
      if (!channelName) return;
      const channel = client.channels.get(channelName);
      channel.subscribe('cycle-updated', () => onUpdateRef.current());
    });

    return () => {
      client.close();
    };
  }, []);
}
