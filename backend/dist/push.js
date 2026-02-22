"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushNotifyGuest = pushNotifyGuest;
// Push notification stub. Replace with FCM (Firebase Cloud Messaging) when configured.
async function pushNotifyGuest(guestId, body) {
    // Stub: log only. In production, look up guest.pushToken and send via FCM.
    console.log(`[Push stub] guest ${guestId}: ${body}`);
}
