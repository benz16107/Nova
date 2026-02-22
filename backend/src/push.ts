// Push notification stub. Replace with FCM (Firebase Cloud Messaging) when configured.
export async function pushNotifyGuest(guestId: string, body: string): Promise<void> {
  // Stub: log only. In production, look up guest.pushToken and send via FCM.
  console.log(`[Push stub] guest ${guestId}: ${body}`);
}
