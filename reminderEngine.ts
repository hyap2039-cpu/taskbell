/**
 * Core Reminder Engine for TaskBell
 * 
 * Orchestrates business logic, recurring patterns, notification triggering,
 * sound playback, and scheduler state synchronization.
 * Decoupled from React lifecycle for modularity and future Android integration.
 */

import { Reminder } from '../types';
import { defaultScheduler, calculateNextOccurrence } from './reminderScheduler';
import { storageService } from './storageService';
import { notificationService } from './notificationService';
import { soundService } from './soundService';

export type AlarmTriggerListener = (reminder: Reminder) => void;

class ReminderEngine {
  private activeAlarmReminder: Reminder | null = null;
  private triggerListeners = new Set<AlarmTriggerListener>();
  private isInitialized = false;

  public init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Connect the scheduler trigger callback to this engine
    defaultScheduler.init((reminder) => {
      this.handleReminderTriggered(reminder);
    });

    // Initial scheduling of all enabled reminders from storage
    const allReminders = storageService.getReminders();
    defaultScheduler.rescheduleAll(allReminders);
  }

  public subscribeToAlarm(listener: AlarmTriggerListener): () => void {
    this.triggerListeners.add(listener);
    // If an alarm is currently ringing, notify subscriber immediately
    if (this.activeAlarmReminder) {
      listener(this.activeAlarmReminder);
    }
    return () => {
      this.triggerListeners.delete(listener);
    };
  }

  public getActiveAlarm(): Reminder | null {
    return this.activeAlarmReminder;
  }

  /**
   * Handles when a scheduled reminder fires
   */
  public async handleReminderTriggered(reminder: Reminder): Promise<void> {
    console.log(`[TaskBell Engine] Alarm Triggered for: ${reminder.title} at ${new Date().toLocaleTimeString()}`);
    this.activeAlarmReminder = reminder;

    // 1. Dispatch browser notification if enabled
    if (reminder.notification) {
      await notificationService.showReminderNotification(reminder);
    }

    // 2. Play configured alarm sound & vibration in loop
    const settings = storageService.getSettings();
    soundService.setVolume(settings.volume);
    soundService.startLoop(reminder.sound || settings.defaultSound, reminder.vibration);

    // 3. Update lastTriggeredAt timestamp
    storageService.updateReminder(reminder.id, {
      lastTriggeredAt: new Date().toISOString(),
    });

    // 4. Notify React UI listeners to display the full-screen alarm modal
    this.triggerListeners.forEach((listener) => {
      try {
        listener(reminder);
      } catch (err) {
        console.error('Error in alarm listener callback:', err);
      }
    });
  }

  /**
   * Schedules a reminder
   */
  public async scheduleReminder(reminder: Reminder): Promise<void> {
    await defaultScheduler.schedule(reminder);
  }

  /**
   * Cancels a reminder
   */
  public async cancelReminder(reminderId: string): Promise<void> {
    await defaultScheduler.cancel(reminderId);
    if (this.activeAlarmReminder && this.activeAlarmReminder.id === reminderId) {
      this.dismissActiveAlarm();
    }
  }

  /**
   * Snoozes a reminder for a given number of minutes
   */
  public async snoozeReminder(reminderId: string, minutes: number): Promise<Reminder> {
    // 1. Stop audio/vibration for active alarm
    soundService.stop();
    this.activeAlarmReminder = null;

    // 2. Find target reminder
    const all = storageService.getReminders();
    const original = all.find((r) => r.id === reminderId) || this.activeAlarmReminder;

    const snoozeTarget = new Date(Date.now() + minutes * 60 * 1000);
    const hours = String(snoozeTarget.getHours()).padStart(2, '0');
    const mins = String(snoozeTarget.getMinutes()).padStart(2, '0');
    const y = snoozeTarget.getFullYear();
    const m = String(snoozeTarget.getMonth() + 1).padStart(2, '0');
    const d = String(snoozeTarget.getDate()).padStart(2, '0');

    const snoozedReminder: Reminder = {
      ...(original || {
        id: reminderId,
        title: 'Task Reminder',
        date: `${y}-${m}-${d}`,
        time: `${hours}:${mins}`,
        repeat: 'once',
        sound: 'classic',
        vibration: true,
        notification: true,
        enabled: true,
        completed: false,
        createdAt: new Date().toISOString(),
      }),
      id: `snooze-${Date.now()}`,
      title: original ? `[Snoozed] ${original.title}` : 'Snoozed Task',
      description: original?.description,
      date: `${y}-${m}-${d}`,
      time: `${hours}:${mins}`,
      isSnoozed: true,
      snoozeParentId: original?.id,
      snoozeMinutes: minutes,
      enabled: true,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    // Save snoozed reminder to storage so it shows in the dashboard
    storageService.addReminder(snoozedReminder);
    await defaultScheduler.schedule(snoozedReminder);

    return snoozedReminder;
  }

  /**
   * Dismisses the active alarm, stopping sound and updating recurring logic
   */
  public dismissActiveAlarm(): void {
    soundService.stop();
    const current = this.activeAlarmReminder;
    this.activeAlarmReminder = null;

    if (!current) return;

    if (current.isSnoozed) {
      // Snoozed instance is done, delete it or mark completed
      storageService.deleteReminder(current.id);
      return;
    }

    if (current.repeat === 'once') {
      // Mark once-only reminders completed after dismissal
      storageService.markReminderCompleted(current.id);
    } else {
      // Recurring reminders (daily, weekly) remain active and are rescheduled for their next cycle
      this.advanceRecurringReminder(current);
    }
  }

  /**
   * Advances a recurring reminder to its next cycle in storage and scheduler
   */
  public advanceRecurringReminder(reminder: Reminder): void {
    const nextOccurrence = calculateNextOccurrence(reminder, new Date());
    const y = nextOccurrence.getFullYear();
    const m = String(nextOccurrence.getMonth() + 1).padStart(2, '0');
    const d = String(nextOccurrence.getDate()).padStart(2, '0');

    storageService.updateReminder(reminder.id, {
      date: `${y}-${m}-${d}`,
    });

    const updated = { ...reminder, date: `${y}-${m}-${d}` };
    defaultScheduler.schedule(updated);
  }

  /**
   * Marks a reminder completed directly
   */
  public markCompleted(reminderId: string): void {
    if (this.activeAlarmReminder && this.activeAlarmReminder.id === reminderId) {
      this.dismissActiveAlarm();
    }
    storageService.markReminderCompleted(reminderId);
    defaultScheduler.cancel(reminderId);
  }

  /**
   * Finds the single next upcoming active reminder
   */
  public getNextReminder(reminders: Reminder[]): { reminder: Reminder; triggerDate: Date } | null {
    const now = new Date();
    const activeReminders = reminders.filter((r) => r.enabled && !r.completed);
    if (activeReminders.length === 0) return null;

    let closestReminder: Reminder | null = null;
    let closestTime = Infinity;
    let closestDate: Date | null = null;

    for (const r of activeReminders) {
      const nextTime = calculateNextOccurrence(r, now);
      const diff = nextTime.getTime() - now.getTime();
      // Look for upcoming occurrences (or due right now)
      if (diff > -60000 && diff < closestTime) {
        closestTime = diff;
        closestReminder = r;
        closestDate = nextTime;
      }
    }

    if (!closestReminder || !closestDate) return null;
    return { reminder: closestReminder, triggerDate: closestDate };
  }

  /**
   * Checks due reminders from a list
   */
  public checkDueReminders(reminders: Reminder[]): Reminder[] {
    const now = new Date();
    return reminders.filter((r) => {
      if (!r.enabled || r.completed) return false;
      const trigger = calculateNextOccurrence(r, now);
      const diff = now.getTime() - trigger.getTime();
      return diff >= 0 && diff < 60000;
    });
  }

  /**
   * Calculates the next trigger date for a reminder
   */
  public calculateNextTriggerDate(reminder: Reminder): Date {
    return calculateNextOccurrence(reminder, new Date());
  }

  /**
   * Formats a 24h time string (e.g. "07:00") to 12h format ("07:00 AM")
   */
  public formatDisplayTime(timeStr: string, use24h: boolean = false): string {
    if (!timeStr) return '';
    const [hStr, mStr] = timeStr.split(':');
    const hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr, 10);

    if (use24h) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${String(displayHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
  }

  /**
   * Formats a date string (YYYY-MM-DD) into readable human labels (Today, Tomorrow, or Mon, 12 Oct)
   */
  public formatDisplayDate(dateStr: string): string {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    if (target.getTime() === today.getTime()) {
      return 'Today';
    }
    if (target.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
    }

    return target.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
}

export const reminderEngine = new ReminderEngine();
