/**
 * Local Storage Service for TaskBell
 * Handles persistent storage of reminders, completion state, and user settings.
 */

import { Reminder, AppSettings } from '../types';

const STORAGE_KEY_REMINDERS = 'taskbell_reminders_v1';
const STORAGE_KEY_SETTINGS = 'taskbell_settings_v1';

const DEFAULT_SETTINGS: AppSettings = {
  defaultSnoozeMinutes: 5,
  defaultSound: 'classic',
  defaultVibration: true,
  defaultNotification: true,
  theme: 'dark',
  volume: 0.8,
  twentyFourHourFormat: false,
};

function getTodayDateString(offsetDays: number = 0): string {
  const d = new Date();
  if (offsetDays !== 0) {
    d.setDate(d.getDate() + offsetDays);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const SEED_REMINDERS: Reminder[] = [
  {
    id: 'seed-1',
    title: 'Gym jaana hai',
    description: 'Chest and triceps workout session',
    date: getTodayDateString(0),
    time: '07:00',
    repeat: 'daily',
    sound: 'classic',
    vibration: true,
    notification: true,
    enabled: true,
    completed: false,
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: 'seed-2',
    title: 'Shop jaana hai',
    description: 'Grocery shopping & fresh supplies',
    date: getTodayDateString(0),
    time: '10:30',
    repeat: 'once',
    sound: 'digital',
    vibration: true,
    notification: true,
    enabled: true,
    completed: false,
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
  },
  {
    id: 'seed-3',
    title: 'Padhai karni hai',
    description: 'Chapter 4 revision and coding exercises',
    date: getTodayDateString(0),
    time: '18:00',
    repeat: 'daily',
    sound: 'classic',
    vibration: true,
    notification: true,
    enabled: true,
    completed: false,
    createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
  },
  {
    id: 'seed-4',
    title: 'Medicine lena hai',
    description: 'Post-dinner vitamin tablets',
    date: getTodayDateString(0),
    time: '21:00',
    repeat: 'daily',
    sound: 'gentle',
    vibration: true,
    notification: true,
    enabled: true,
    completed: false,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
];

class StorageService {
  /**
   * Retrieves all reminders from localStorage.
   * If empty on first run, seeds default realistic reminders.
   */
  public getReminders(): Reminder[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_REMINDERS);
      if (!data) {
        this.saveReminders(SEED_REMINDERS);
        return [...SEED_REMINDERS];
      }
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch (err) {
      console.error('Failed to read reminders from localStorage:', err);
      return [];
    }
  }

  /**
   * Saves full reminders array to localStorage
   */
  public saveReminders(reminders: Reminder[]): void {
    try {
      localStorage.setItem(STORAGE_KEY_REMINDERS, JSON.stringify(reminders));
    } catch (err) {
      console.error('Failed to write reminders to localStorage:', err);
    }
  }

  /**
   * Saves or adds a reminder
   */
  public addReminder(reminder: Reminder): void {
    const list = this.getReminders();
    list.unshift(reminder);
    this.saveReminders(list);
  }

  /**
   * Updates an existing reminder by ID
   */
  public updateReminder(id: string, updates: Partial<Reminder>): Reminder | null {
    const list = this.getReminders();
    const index = list.findIndex((r) => r.id === id);
    if (index === -1) return null;

    const updated = { ...list[index], ...updates };
    list[index] = updated;
    this.saveReminders(list);
    return updated;
  }

  /**
   * Deletes a reminder by ID
   */
  public deleteReminder(id: string): void {
    const list = this.getReminders().filter((r) => r.id !== id);
    this.saveReminders(list);
  }

  /**
   * Toggles the enabled/disabled state of a reminder
   */
  public toggleReminderEnabled(id: string): Reminder | null {
    const list = this.getReminders();
    const item = list.find((r) => r.id === id);
    if (!item) return null;

    item.enabled = !item.enabled;
    this.saveReminders(list);
    return item;
  }

  /**
   * Marks a reminder completed
   */
  public markReminderCompleted(id: string): Reminder | null {
    const list = this.getReminders();
    const item = list.find((r) => r.id === id);
    if (!item) return null;

    item.completed = true;
    item.enabled = false;
    item.completedAt = new Date().toISOString();
    this.saveReminders(list);
    return item;
  }

  /**
   * Restores a completed reminder back to active
   */
  public restoreReminder(id: string): Reminder | null {
    const list = this.getReminders();
    const item = list.find((r) => r.id === id);
    if (!item) return null;

    item.completed = false;
    item.enabled = true;
    delete item.completedAt;

    // If date is in past, adjust date to today or tomorrow
    const now = new Date();
    const itemDateTime = new Date(`${item.date}T${item.time}`);
    if (itemDateTime < now) {
      const todayStr = getTodayDateString(0);
      const [h, m] = item.time.split(':').map(Number);
      const testTime = new Date();
      testTime.setHours(h, m, 0, 0);
      if (testTime < now) {
        item.date = getTodayDateString(1); // Tomorrow
      } else {
        item.date = todayStr; // Later today
      }
    }

    this.saveReminders(list);
    return item;
  }

  /**
   * Clears all reminders
   */
  public clearAllReminders(): void {
    try {
      localStorage.removeItem(STORAGE_KEY_REMINDERS);
    } catch (err) {
      console.error('Failed to clear reminders:', err);
    }
  }

  /**
   * Retrieves app settings with fallback to defaults
   */
  public getSettings(): AppSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (!data) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch (err) {
      console.error('Failed to read settings:', err);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Saves app settings
   */
  public saveSettings(settings: AppSettings): void {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }
}

export const storageService = new StorageService();
