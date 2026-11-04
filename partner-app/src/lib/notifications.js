// Web Push & In-App Notifications utility for Partner App

export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('[Notification] requestPermission error:', err);
    return Notification.permission;
  }
}

/**
 * Shows an OS / Browser Push Notification for a new incoming order.
 */
export function showOrderPushNotification({ orderId, subOrderId, garmentCount, hubName, onClick }) {
  if (!isNotificationSupported()) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    const title = '🔔 New Order Received!';
    const count = garmentCount ? `${garmentCount} garment(s)` : 'Garments ready';
    const body = `Order ${subOrderId || orderId}: ${count} for processing${hubName ? ` from ${hubName}` : ''}. Tap to accept.`;

    const notif = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: subOrderId || orderId,
      renotify: true,
      requireInteraction: true,
      silent: true, // We trigger custom chime sound via sound.js
    });

    notif.onclick = function (event) {
      event.preventDefault();
      window.focus();
      if (onClick) onClick();
      notif.close();
    };

    return notif;
  } catch (err) {
    console.warn('[Notification] showOrderPushNotification error:', err);
    return null;
  }
}
