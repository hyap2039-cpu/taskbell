/**
 * Central State & Reactivity Hook for TaskBell
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Reminder, AppSettings } from '../types';
import { storageService } from '../services/storageService';
import { reminderEngine } from '../services/reminderEngine';

export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>(() => storageService.getReminders());
  const [settings, setSettings] = useState<AppSettings>(() => storageService.getSettings());
  const [activeAlarm, setActiveAlarm] = useState<Reminder | null>(() => reminderEngine.getActiveAlarm());
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Initialize reminder engine and listen for active alarms
  useEffect(() => {
    reminderEngine.init();

    const unsubscribe = reminderEngine.subscribeToAlarm((alarmReminder) => {
      setActiveAlarm(alarmReminder);
      // Refresh list to show updated snoozes/timestamps
      setReminders(storageService.getReminders());
    });

    // Digital clock ticker every 1 second
    const clockTimer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(clockTimer);
    };
  }, []);

  // Sync theme with HTML document element
  useEffect(() => {
    const applyTheme = () => {
      const root = document.documentElement;
      if (settings.theme === 'dark') {
        root.classList.add('dark');
      } else if (settings.theme === 'light') {
        root.classList.remove('dark');
      } else {
        // System preference
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    };

    applyTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      if (settings.theme === 'system') {
        applyTheme();
      }
    };
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [settings.theme]);

  // Actions
  const reloadReminders = useCallback(() => {
    setReminders(storageService.getReminders());
  }, []);

  const addReminder = useCallback(async (newReminder: Reminder) => {
    storageService.addReminder(newReminder);
    await reminderEngine.scheduleReminder(newReminder);
    reloadReminders();
  }, [reloadReminders]);

  const updateReminder = useCallback(async (id: string, updates: Partial<Reminder>) => {
    const updated = storageService.updateReminder(id, updates);
    if (updated) {
      if (updated.enabled && !updated.completed) {
        await reminderEngine.scheduleReminder(updated);
      } else {
        await reminderEngine.cancelReminder(id);
      }
    }
    reloadReminders();
  }, [reloadReminders]);

  const deleteReminder = useCallback(async (id: string) => {
    await reminderEngine.cancelReminder(id);
    storageService.deleteReminder(id);
    reloadReminders();
  }, [reloadReminders]);

  const toggleReminder = useCallback(async (id: string) => {
    const toggled = storageService.toggleReminderEnabled(id);
    if (toggled) {
      if (toggled.enabled && !toggled.completed) {
        await reminderEngine.scheduleReminder(toggled);
      } else {
        await reminderEngine.cancelReminder(id);
      }
    }
    reloadReminders();
  }, [reloadReminders]);

  const completeReminder = useCallback(async (id: string) => {
    reminderEngine.markCompleted(id);
    reloadReminders();
  }, [reloadReminders]);

  const restoreReminder = useCallback(async (id: string) => {
    const restored = storageService.restoreReminder(id);
    if (restored) {
      await reminderEngine.scheduleReminder(restored);
    }
    reloadReminders();
  }, [reloadReminders]);

  const snoozeActiveAlarm = useCallback(async (minutes: number) => {
    if (!activeAlarm) return;
    const currentId = activeAlarm.id;
    setActiveAlarm(null);
    await reminderEngine.snoozeReminder(currentId, minutes);
    reloadReminders();
  }, [activeAlarm, reloadReminders]);

  const dismissActiveAlarm = useCallback(() => {
    reminderEngine.dismissActiveAlarm();
    setActiveAlarm(null);
    reloadReminders();
  }, [reloadReminders]);

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...newSettings };
      storageService.saveSettings(merged);
      return merged;
    });
  }, []);

  const clearAllData = useCallback(() => {
    storageService.clearAllReminders();
    reloadReminders();
  }, [reloadReminders]);

  // Derived queries
  const activeReminders = useMemo(() => {
    return reminders
      .filter((r) => !r.completed)
      .sort((a, b) => {
        // Sort chronologically by date and time
        const dtA = `${a.date}T${a.time}`;
        const dtB = `${b.date}T${b.time}`;
        return dtA.localeCompare(dtB);
      });
  }, [reminders]);

  const completedReminders = useMemo(() => {
    return reminders
      .filter((r) => r.completed)
      .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  }, [reminders]);

  const nextReminderData = useMemo(() => {
    return reminderEngine.getNextReminder(reminders);
  }, [reminders, currentTime]);

  const todayDateStr = useMemo(() => {
    const y = currentTime.getFullYear();
    const m = String(currentTime.getMonth() + 1).padStart(2, '0');
    const d = String(currentTime.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [currentTime]);

  const todaysReminders = useMemo(() => {
    return reminders.filter((r) => !r.completed && (r.date === todayDateStr || r.repeat === 'daily'));
  }, [reminders, todayDateStr]);

  const upcomingReminders = useMemo(() => {
    return reminders.filter((r) => !r.completed && r.date > todayDateStr && r.repeat !== 'daily');
  }, [reminders, todayDateStr]);

  return {
    reminders,
    activeReminders,
    completedReminders,
    todaysReminders,
    upcomingReminders,
    nextReminderData,
    settings,
    activeAlarm,
    currentTime,
    addReminder,
    updateReminder,
    deleteReminder,
    toggleReminder,
    completeReminder,
    restoreReminder,
    snoozeActiveAlarm,
    dismissActiveAlarm,
    updateSettings,
    clearAllData,
    reloadReminders,
  };
}
