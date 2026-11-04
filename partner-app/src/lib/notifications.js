// Web & Native Android Notifications utility for Partner App
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

let channelCreated = false;
let globalOnClickHandler = null;

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function isNotificationSupported() {
  if (Capacitor.isNativePlatform()) return true;
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Ensures high-priority notification channel with custom chime sound exists on Android
 */
export async function setupAndroidNotificationChannel() {
  if (!isNativeAndroid()) return;
  if (channelCreated) return;

  try {
    await LocalNotifications.createChannel({
      id: 'new_orders',
      name: 'New Order Alerts',
      description: 'Heads-up alert with custom sound and vibration when new orders arrive',
      importance: 5, // IMPORTANCE_HIGH / MAX heads-up banner
      visibility: 1, // Shows on secure lockscreen
      sound: 'order_chime.wav', // Resides in res/raw/order_chime.wav
      vibration: true,
      lights: true,
      lightColor: '#4f46e5',
    });
    channelCreated = true;
    console.log('[Notification] Android "new_orders" channel created successfully');
  } catch (err) {
    console.warn('[Notification] Could not create Android channel:', err);
  }
}

/**
 * Register global notification action listener for Android
 */
export function registerNotificationTapListener(onOrderSelected) {
  globalOnClickHandler = onOrderSelected;
  if (Capacitor.isNativePlatform()) {
    try {
      LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        const targetId = action.notification?.extra?.subOrderId || action.notification?.extra?.orderId;
        if (targetId && globalOnClickHandler) {
          globalOnClickHandler(targetId);
        }
      });
    } catch (e) {
      console.warn('[Notification] Error registering tap listener:', e);
    }
  }
}

export async function getNotificationPermission() {
  if (Capacitor.isNativePlatform()) {
    try {
      const check = await LocalNotifications.checkPermissions();
      return check.display; // 'granted' | 'denied' | 'prompt'
    } catch {
      return 'prompt';
    }
  }
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (Capacitor.isNativePlatform()) {
    try {
      await setupAndroidNotificationChannel();
      const res = await LocalNotifications.requestPermissions();
      return res.display;
    } catch (err) {
      console.warn('[Notification] Native requestPermissions error:', err);
      return 'denied';
    }
  }

  if (!isNotificationSupported()) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('[Notification] Web requestPermission error:', err);
    return Notification.permission;
  }
}

/**
 * Shows a Push / Local Notification for a new incoming order (Web & Android).
 */
export async function showOrderPushNotification({ orderId, subOrderId, garmentCount, hubName, onClick }) {
  const count = garmentCount ? `${garmentCount} garment(s)` : 'Garments ready';
  const title = '🔔 New Order Received!';
  const body = `Order ${subOrderId || orderId}: ${count} for processing${hubName ? ` from ${hubName}` : ''}. Tap to accept.`;

  // 1. Native Android Local Notification with custom sound & vibration
  if (Capacitor.isNativePlatform()) {
    try {
      await setupAndroidNotificationChannel();
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }

      const notifId = Math.floor(Date.now() % 100000);
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title,
            body,
            channelId: 'new_orders',
            sound: 'order_chime.wav',
            extra: {
              subOrderId: subOrderId || orderId,
              orderId,
            },
            smallIcon: 'ic_launcher',
            iconColor: '#4f46e5',
            actionTypeId: '',
          },
        ],
      });
      return true;
    } catch (err) {
      console.warn('[Notification] Native Android LocalNotification failed:', err);
    }
  }

  // 2. Web Browser Push Notification Fallback
  if (!isNotificationSupported() || Notification.permission !== 'granted') return null;

  try {
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
