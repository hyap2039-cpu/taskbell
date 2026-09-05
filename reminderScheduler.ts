/**
 * ReminderScheduler Interface and WebReminderScheduler Implementation
 * 
 * ARCHITECTURE FOR FUTURE ANDROID CONVERSION:
 * -------------------------------------------------------------
 * This file provides the central abstraction layer between TaskBell's core
 * reminder logic and device alarm scheduling.
 * 
 * Current Web Implementation:
 * - `WebReminderScheduler` manages in-browser setTimeout timers, system clock
 *   checks, and visibility change reconciliations (catching alarms when tab awakens).
 * 
 * Future Android Implementation:
 * - In Capacitor, `AndroidReminderScheduler` implements `ReminderScheduler` by
 *   calling Capacitor plugins or native Android Java/Kotlin bridges that interact with:
 *     1. `AlarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)`
 *     2. Android `BroadcastReceiver` to handle alarm wakeups even when the app is killed.
 *     3. Full-screen `Activity` (lockscreen display) with `SHOW_WHEN_LOCKED` and `TURN_SCREEN_ON`.
 *     4. Android `NotificationChannel` with high importance / full-screen intent.
 */

import { Reminder } from '../types';

export interface ReminderScheduler {
  schedule(reminder: Reminder): Promise<void>;
  cancel(reminderId: string): Promise<void>;
  snooze(reminderId: string, minutes: number): Promise<void>;
  init(onTrigger: (reminder: Reminder) => void): void;
  destroy(): void;
  rescheduleAll(reminders: Reminder[]): Promise<void>;
}

export type TriggerCallback = (reminder: Reminder) => void;

/**
 * Calculates the exact Next Date/Time timestamp for a reminder.
 */
export function calculateNextOccurrence(reminder: Reminder, referenceDate: Date = new Date()): Date {
  const [hours, minutes] = reminder.time.split(':').map(Number);

  if (reminder.isSnoozed) {
    // Snoozed items have a direct scheduled date and time
    const target = new Date(`${reminder.date}T${reminder.time}:00`);
    if (!isNaN(target.getTime())) {
      return target;
    }
  }

  const candidate = new Date(referenceDate);
  candidate.setHours(hours, minutes, 0, 0);

  if (reminder.repeat === 'once') {
    // Use the explicit reminder date
    const [y, m, d] = reminder.date.split('-').map(Number);
    const onceDate = new Date(y, m - 1, d, hours, minutes, 0, 0);
    return onceDate;
  }

  if (reminder.repeat === 'daily') {
    // If today's time has already passed, schedule for tomorrow
    if (candidate.getTime() <= referenceDate.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate;
  }

  if (reminder.repeat === 'weekly') {
    // Weekday: 0 = Sun, 1 = Mon, ..., 6 = Sat
    const targetDay = reminder.weekday !== undefined ? reminder.weekday : candidate.getDay();
    let daysUntilTarget = (targetDay - candidate.getDay() + 7) % 7;
    
    // If target day is today but time has passed, jump to next week
    if (daysUntilTarget === 0 && candidate.getTime() <= referenceDate.getTime()) {
      daysUntilTarget = 7;
    }
    candidate.setDate(candidate.getDate() + daysUntilTarget);
    return candidate;
  }

  // Day-of-week repeat options ('monday', 'tuesday', etc.)
  const dayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  if (reminder.repeat in dayMap) {
    const targetDay = dayMap[reminder.repeat];
    let daysUntilTarget = (targetDay - candidate.getDay() + 7) % 7;
    if (daysUntilTarget === 0 && candidate.getTime() <= referenceDate.getTime()) {
      daysUntilTarget = 7;
    }
    candidate.setDate(candidate.getDate() + daysUntilTarget);
    return candidate;
  }

  return candidate;
}

/**
 * Web Implementation of the ReminderScheduler using Browser APIs
 */
export class WebReminderScheduler implements ReminderScheduler {
  private activeTimers = new Map<string, number>();
  private scheduledReminders = new Map<string, Reminder>();
  private onTriggerCallback: TriggerCallback | null = null;
  private tickerIntervalId: number | null = null;
  private visibilityListener: (() => void) | null = null;

  public init(onTrigger: TriggerCallback): void {
    this.onTriggerCallback = onTrigger;

    // Background wake check: when the browser tab becomes visible again,
    // immediately check if any alarms were scheduled during sleep/screen-off.
    this.visibilityListener = () => {
      if (document.visibilityState === 'visible') {
        this.verifyDueReminders();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityListener);

    // Periodic safety check every 5 seconds (handles system clock adjustments)
    this.tickerIntervalId = window.setInterval(() => {
      this.verifyDueReminders();
    }, 5000);
  }

  public destroy(): void {
    this.activeTimers.forEach((timerId) => clearTimeout(timerId));
    this.activeTimers.clear();
    this.scheduledReminders.clear();

    if (this.tickerIntervalId !== null) {
      clearInterval(this.tickerIntervalId);
      this.tickerIntervalId = null;
    }

    if (this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
  }

  /**
   * Schedules a reminder using browser setTimeout with target time reconciliation
   */
  public async schedule(reminder: Reminder): Promise<void> {
    // Clear any previous timer for this reminder ID
    this.cancelTimer(reminder.id);

    if (!reminder.enabled || reminder.completed) {
      this.scheduledReminders.delete(reminder.id);
      return;
    }

    const now = new Date();
    const nextTrigger = calculateNextOccurrence(reminder, now);
    const delayMs = nextTrigger.getTime() - now.getTime();

    // Store in memory for periodic reconciliation
    this.scheduledReminders.set(reminder.id, reminder);

    // If already due or past due by less than 15 minutes, trigger immediately
    if (delayMs <= 0) {
      const pastSeconds = Math.abs(delayMs) / 1000;
      if (pastSeconds < 900) {
        this.triggerReminder(reminder);
      }
      return;
    }

    // Browsers clamp setTimeout to ~24.8 days (2147483647 ms).
    // For large delays, the periodic ticker will reschedule when within range.
    if (delayMs < 2147483647) {
      const timerId = window.setTimeout(() => {
        this.triggerReminder(reminder);
      }, delayMs);

      this.activeTimers.set(reminder.id, timerId);
    }
  }

  /**
   * Cancels a scheduled timer
   */
  public async cancel(reminderId: string): Promise<void> {
    this.cancelTimer(reminderId);
    this.scheduledReminders.delete(reminderId);
  }

  /**
   * Snoozes a reminder for specified minutes
   */
  public async snooze(reminderId: string, minutes: number): Promise<void> {
    const reminder = this.scheduledReminders.get(reminderId);
    if (!reminder) return;

    const snoozeTarget = new Date(Date.now() + minutes * 60 * 1000);
    const hours = String(snoozeTarget.getHours()).padStart(2, '0');
    const mins = String(snoozeTarget.getMinutes()).padStart(2, '0');
    const y = snoozeTarget.getFullYear();
    const m = String(snoozeTarget.getMonth() + 1).padStart(2, '0');
    const d = String(snoozeTarget.getDate()).padStart(2, '0');

    const snoozedReminder: Reminder = {
      ...reminder,
      id: `${reminder.id}-snooze-${Date.now()}`,
      isSnoozed: true,
      snoozeParentId: reminder.id,
      snoozeMinutes: minutes,
      date: `${y}-${m}-${d}`,
      time: `${hours}:${mins}`,
    };

    await this.schedule(snoozedReminder);
  }

  /**
   * Reschedules all enabled reminders in batch
   */
  public async rescheduleAll(reminders: Reminder[]): Promise<void> {
    this.activeTimers.forEach((timerId) => clearTimeout(timerId));
    this.activeTimers.clear();
    this.scheduledReminders.clear();

    for (const rem of reminders) {
      if (rem.enabled && !rem.completed) {
        await this.schedule(rem);
      }
    }
  }

  private cancelTimer(id: string): void {
    const existing = this.activeTimers.get(id);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.activeTimers.delete(id);
    }
  }

  private triggerReminder(reminder: Reminder): void {
    this.cancelTimer(reminder.id);
    if (this.onTriggerCallback) {
      this.onTriggerCallback(reminder);
    }
  }

  /**
   * Verifies all scheduled reminders against current time to detect any missed alarms
   */
  private verifyDueReminders(): void {
    const now = new Date();
    this.scheduledReminders.forEach((reminder) => {
      if (!reminder.enabled || reminder.completed) return;
      const nextTrigger = calculateNextOccurrence(reminder, now);
      const diffMs = now.getTime() - nextTrigger.getTime();

      // If scheduled within the past 60 seconds and not already active
      if (diffMs >= 0 && diffMs < 60000) {
        this.triggerReminder(reminder);
      }
    });
  }
}

/**
 * Global instance of ReminderScheduler.
 * NOTE FOR ANDROID CONVERSION:
 * Replace this initialization with `new AndroidReminderScheduler()` when running inside Capacitor.
 */
export const defaultScheduler: ReminderScheduler = new WebReminderScheduler();
