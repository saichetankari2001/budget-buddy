'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  // Built via `new Uint8Array(length)` + a loop (not `.from(...)`) so TypeScript infers
  // `Uint8Array<ArrayBuffer>`, which DOM's `BufferSource` (used by applicationServerKey
  // below) requires under TS 5.7+'s generic typed-array types.
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

type Status = 'idle' | 'subscribing' | 'subscribed' | 'denied' | 'unsupported' | 'error';

export function PushSubscribe() {
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'granted') {
      setStatus('subscribed');
    } else if (Notification.permission === 'denied') {
      setStatus('denied');
    }
  }, []);

  async function handleSubscribe() {
    setStatus('subscribing');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = subscription.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });

      if (!res.ok) {
        setStatus('error');
        return;
      }

      setStatus('subscribed');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'subscribed') {
    return <p className="text-sm text-muted">You&apos;ll get a daily check-in notification.</p>;
  }
  if (status === 'denied') {
    return <p className="text-sm text-muted">Notifications blocked — you can still see check-ins here.</p>;
  }
  if (status === 'unsupported') {
    return null;
  }
  if (status === 'error') {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">Couldn&apos;t enable notifications.</p>
        <Button variant="secondary" onClick={handleSubscribe}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <Button variant="secondary" onClick={handleSubscribe} disabled={status === 'subscribing'}>
      {status === 'subscribing' ? 'Enabling…' : 'Notify me'}
    </Button>
  );
}
