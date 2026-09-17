// lib/push/send.ts
import webpush from 'web-push';
import { prisma } from '@/lib/prisma';

webpush.setVapidDetails(
  'mailto:noreply@budgetbuddy.app',
  process.env.VAPID_PUBLIC_KEY ?? '',
  process.env.VAPID_PRIVATE_KEY ?? ''
);

export async function sendPushNotification(
  subscription: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string }
): Promise<void> {
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
    if (statusCode === 410) {
      // Subscription is gone (browser uninstalled, permission revoked, etc.) — delete it,
      // don't retry, and don't let one dead subscription fail the whole batch.
      await prisma.pushSubscription.delete({ where: { id: subscription.id } });
      return;
    }
    throw error;
  }
}
