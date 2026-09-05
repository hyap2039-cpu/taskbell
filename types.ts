/**
 * TaskBell Data Types and Interfaces
 */

export type RepeatType = 
  | 'once' 
  | 'daily' 
  | 'weekly'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type AlarmSoundId = 'classic' | 'digital' | 'gentle';

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm (24-hour)
  repeat: RepeatType;
  weekday?: number; // 0 for Sunday, 1 for Monday, ..., 6 for Saturday (used for weekly)
  sound: AlarmSoundId;
  vibration: boolean;
  notification: boolean;
  enabled: boolean;
  completed: boolean;
  createdAt: string;
  completedAt?: string;
  isSnoozed?: boolean;
  snoozeParentId?: string; // If this is a snoozed instance of a parent reminder
  snoozeMinutes?: number;
  lastTriggeredAt?: string;
}

export interface AppSettings {
  defaultSnoozeMinutes: 5 | 10 | 15;
  defaultSound: AlarmSoundId;
  defaultVibration: boolean;
  defaultNotification: boolean;
  theme: 'light' | 'dark' | 'system';
  volume: number; // 0 to 1
  twentyFourHourFormat: boolean;
}

export type NavigationTab = 'home' | 'reminders' | 'completed' | 'settings';

export interface AlarmTriggerPayload {
  reminder: Reminder;
  triggeredAt: Date;
}
