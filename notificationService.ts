/**
 * Notification Service for TaskBell
 * Encapsulates Browser Notifications API with fallback handling.
 * Designed to be swappable with native Android LocalNotifications via Capacitor.
 */

import { Reminder } from '../types';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

class NotificationService {
  /**
   * Checks current permission status
   */
  public getPermissionStatus(): NotificationPermissionState {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  }

  /**
   * Requests permission from user with promise
   */
  public async requestPermission(): Promise<NotificationPermissionState> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }

    try {
      const result = await Notification.requestPermission();
      return result;
    } catch (err) {
      console.warn('Error requesting notification permission:', err);
      return 'denied';
    }
  }

  /**
   * Dispatches a notification for a due reminder
   */
  public async showReminderNotification(reminder: Reminder): Promise<boolean> {
    if (this.getPermissionStatus() !== 'granted') {
      return false;
    }

    try {
      const title = `🔔 ${reminder.title}`;
      const options: NotificationOptions = {
        body: reminder.description 
          ? `${reminder.description}\nTime: ${reminder.time}`
          : `Scheduled for ${reminder.time}. Tap to open alarm.`,
        icon: '/pwa-192x192.png',
        badge: '/icon.svg',
        tag: `reminder-${reminder.id}`,
        requireInteraction: true,
        // Vibration pattern for mobile web
        vibrate: reminder.vibration ? [300, 150, 300, 150, 300] : undefined,
      } as NotificationOptions;

      // Try service worker registration if available for better background display
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration && 'showNotification' in registration) {
            await registration.showNotification(title, options);
            return true;
          }
        } catch (swErr) {
          console.warn('Service worker showNotification failed, falling back to window.Notification:', swErr);
        }
      }

      // Standard window.Notification fallback
      const notification = new Notification(title, options);
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      return true;
    } catch (err) {
      console.warn('Failed to display notification:', err);
      return false;
    }
  }
}

export const notificationService = new NotificationService();
