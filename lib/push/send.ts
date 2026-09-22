// lib/push/send.ts
import webpush from 'web-push';
import { prisma } from '@/lib/prisma';

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.error('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not set — push notifications are disabled.');
    return false;
  }
  webpush.setVapidDetails('mailto:noreply@budgetbuddy.app', publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export async function sendPushNotification(
  subscription: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string }
): Promise<void> {
  if (!ensureVapidConfigured()) {
    return;
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload)
    );
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 410 || statusCode === 404) {
      // Subscription is gone (410) or was never valid (404) — delete it, don't retry, and don't
      // let one dead subscription fail the whole batch. deleteMany (not delete) so this doesn't
      // itself throw if the row was already removed by a concurrent call.
      await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
      return;
    }
    throw error;
  }
}
