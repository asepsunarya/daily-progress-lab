// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Award,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Flame,
  Gift,
  ShieldCheck,
  LogOut,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  UserCircle2,
  Zap,
} from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'daily-progress-lab:v2';
const LEGACY_STORAGE_KEY = 'daily-progress-lab:v1';
const PROFILE_KEY = 'daily-progress-lab:profile';
const API_SYNC_PROFILE_KEY = 'daily-progress-lab:sync-profile-id';
const BACKUP_VERSION = 1;
const dayMs = 24 * 60 * 60 * 1000;
const DEFAULT_FREEZE_COUNT = 2;
const REST_DAY_XP = 5;
const QUEST_COMPLETION_KEY = 'daily-progress-lab:quest-completions:v1';
const QUEST_BONUS_BY_TIER = { daily: 15, weekly: 80 };
const defaultRewards = [
  { id: crypto.randomUUID(), name: 'Kopi favorit', cost: 80 },
  { id: crypto.randomUUID(), name: 'Episode bebas rasa bersalah', cost: 120 },
  { id: crypto.randomUUID(), name: 'Self-date kecil', cost: 250 },
];
const todayKey = () => toDateKey(new Date());
const defaultHabits = [
  { id: crypto.randomUUID(), title: 'Deep work / belajar', points: 25, color: '#7c3aed' },
  { id: crypto.randomUUID(), title: 'Olahraga / jalan kaki', points: 20, color: '#059669' },
  { id: crypto.randomUUID(), title: 'Jurnal progress', points: 15, color: '#ea580c' },
];

function toDateKey(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function monthKey(date) {
  return toDateKey(date).slice(0, 7);
}

function loadJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function loadState() {
  const parsed = loadJson(STORAGE_KEY) || loadJson(LEGACY_STORAGE_KEY);
  if (parsed?.habits && parsed?.logs) {
    return {
      habits: parsed.habits,
      logs: parsed.logs,
      notes: parsed.notes || {},
      freezeCount: Number.isFinite(parsed.freezeCount) ? parsed.freezeCount : DEFAULT_FREEZE_COUNT,
      rewards: Array.isArray(parsed.rewards) ? parsed.rewards : defaultRewards,
      redemptions: Array.isArray(parsed.redemptions) ? parsed.redemptions : [],
    };
  }
  return { habits: defaultHabits, logs: {}, notes: {}, freezeCount: DEFAULT_FREEZE_COUNT, rewards: defaultRewards, redemptions: [] };
}

function loadQuestCompletions() {
  const parsed = loadJson(QUEST_COMPLETION_KEY);
  if (parsed?.daily && parsed?.weekly) return parsed;
  return { daily: {}, weekly: {} };
}


function getSyncProfileId(profile) {
  if (profile?.email) return `email:${profile.email.toLowerCase()}`;
  const existing = localStorage.getItem(API_SYNC_PROFILE_KEY);
  if (existing) return existing;
  const generated = `browser:${crypto.randomUUID()}`;
  localStorage.setItem(API_SYNC_PROFILE_KEY, generated);
  return generated;
}

function mergeRemoteState(localState, remoteState) {
  if (!remoteState?.habits?.length && !Object.keys(remoteState?.logs || {}).length) return localState;
  return {
    ...localState,
    ...remoteState,
    habits: remoteState.habits?.length ? remoteState.habits : localState.habits,
    logs: { ...localState.logs, ...(remoteState.logs || {}) },
    notes: { ...localState.notes, ...(remoteState.notes || {}) },
    rewards: remoteState.rewards?.length ? remoteState.rewards : localState.rewards,
    redemptions: remoteState.redemptions?.length ? remoteState.redemptions : localState.redemptions,
  };
}

async function fetchRemoteProgress(profileId) {
  const response = await fetch(`/api/daily-progress?profileId=${encodeURIComponent(profileId)}`);
  if (!response.ok) throw new Error('Remote progress fetch failed');
  return response.json();
}

async function saveRemoteProgress(profileId, profile, state) {
  const response = await fetch('/api/daily-progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId, profile, state }),
  });
  if (!response.ok) throw new Error('Remote progress save failed');
  return response.json();
}

function loadProfile() {
  const parsed = loadJson(PROFILE_KEY);
  if (parsed?.name && parsed?.email) return parsed;
  return null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateBackup(payload) {
  if (!isPlainObject(payload)) return 'File backup harus berupa JSON object.';
  if (payload.app !== 'daily-progress-lab') return 'File ini bukan backup Daily XP.';
  if (payload.version !== BACKUP_VERSION) return `Versi backup tidak didukung: ${payload.version ?? 'kosong'}.`;
  if (!isPlainObject(payload.data)) return 'Data backup tidak lengkap.';

  const { profile, state } = payload.data;
  if (profile !== null && (!isPlainObject(profile) || typeof profile.name !== 'string' || typeof profile.email !== 'string')) {
    return 'Profil di file backup tidak valid.';
  }
  if (!isPlainObject(state)) return 'State progress di file backup tidak valid.';
  if (!Array.isArray(state.habits)) return 'Daftar habit di file backup tidak valid.';
  if (!isPlainObject(state.logs)) return 'Riwayat progress di file backup tidak valid.';
  if (state.notes !== undefined && !isPlainObject(state.notes)) return 'Catatan di file backup tidak valid.';
  if (state.freezeCount !== undefined && !Number.isFinite(state.freezeCount)) return 'Jumlah streak freeze di file backup tidak valid.';
  if (state.rewards !== undefined && !Array.isArray(state.rewards)) return 'Daftar reward di file backup tidak valid.';
  if (state.redemptions !== undefined && !Array.isArray(state.redemptions)) return 'Riwayat redeem di file backup tidak valid.';

  const invalidHabit = state.habits.some(habit => !isPlainObject(habit) || typeof habit.id !== 'string' || typeof habit.title !== 'string' || !Number.isFinite(habit.points));
  if (invalidHabit) return 'Ada habit di file backup yang tidak valid.';

  const invalidReward = (state.rewards || []).some(reward => !isPlainObject(reward) || typeof reward.id !== 'string' || typeof reward.name !== 'string' || !Number.isFinite(reward.cost));
  if (invalidReward) return 'Ada reward di file backup yang tidak valid.';

  const invalidLog = Object.entries(state.logs).some(([date, log]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isPlainObject(log)) return true;
    return !Array.isArray(log.completed) || log.completed.some(id => typeof id !== 'string');
  });
  if (invalidLog) return 'Ada riwayat progress di file backup yang tidak valid.';

  return null;
}

function normalizeBackupState(importedState) {
  return {
    habits: importedState.habits,
    logs: importedState.logs,
    notes: importedState.notes || {},
    freezeCount: Number.isFinite(importedState.freezeCount) ? importedState.freezeCount : DEFAULT_FREEZE_COUNT,
    rewards: Array.isArray(importedState.rewards) ? importedState.rewards : defaultRewards,
    redemptions: Array.isArray(importedState.redemptions) ? importedState.redemptions : [],
  };
}

function habitXp(habits, id) {
  return habits.find(habit => habit.id === id)?.points || 0;
}

function logXp(log, habits) {
  const habitTotal = (log?.completed || []).reduce((sum, id) => sum + habitXp(habits, id), 0);
  return habitTotal + (log?.restDay ? REST_DAY_XP : 0);
}

function redemptionSpent(redemptions) {
  return redemptions.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
}

function isProtectedLog(log) {
  return Boolean(log?.completed?.length || log?.restDay || log?.frozen);
}

function isPastDate(key) {
  return key < todayKey();
}

function logPercent(log, habits) {
  if (!habits.length) return 0;
  return Math.round(((log?.completed?.length || 0) / habits.length) * 100);
}

function getLevel(totalXp) {
  let level = 1;
  let required = 100;
  let remaining = totalXp;
  while (remaining >= required) {
    remaining -= required;
    level += 1;
    required = Math.round(required * 1.18 + 35);
  }
  return { level, current: remaining, required, percent: Math.min(100, Math.round((remaining / required) * 100)) };
}

function getStreak(logs) {
  let streak = 0;
  const cursor = new Date();
  while (true) {
    const key = toDateKey(cursor);
    if (!isProtectedLog(logs[key])) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function weekKeyFromDateKey(key) {
  return toDateKey(startOfWeek(new Date(`${key}T00:00:00`)));
}

function completionCountForRange(logs, habits, start, days, predicate = isProtectedLog) {
  return Array.from({ length: days }, (_, index) => toDateKey(addDays(start, index)))
    .filter(key => predicate(logs[key], habits)).length;
}

function questBonusXp(completions) {
  const countClaimed = periods => Object.values(periods || {})
    .reduce((sum, period) => sum + Object.values(period || {}).filter(Boolean).length, 0);
  const daily = countClaimed(completions?.daily) * QUEST_BONUS_BY_TIER.daily;
  const weekly = countClaimed(completions?.weekly) * QUEST_BONUS_BY_TIER.weekly;
  return daily + weekly;
}

function getQuests(state, selectedDate) {
  const selectedLog = state.logs[selectedDate] || { completed: [] };
  const selectedWeekStart = startOfWeek(new Date(`${selectedDate}T00:00:00`));
  const completedSelectedDay = selectedLog.completed?.length || 0;
  const totalHabits = state.habits.length || 1;
  const completedWeekDays = completionCountForRange(state.logs, state.habits, selectedWeekStart, 7);
  const perfectWeekDays = completionCountForRange(state.logs, state.habits, selectedWeekStart, 7, (log, habits) => !log?.restDay && !log?.frozen && logPercent(log, habits) === 100);
  const weeklyHabitChecks = Array.from({ length: 7 }, (_, index) => toDateKey(addDays(selectedWeekStart, index)))
    .reduce((sum, key) => sum + (state.logs[key]?.completed?.length || 0), 0);

  return {
    daily: [
      {
        id: 'daily-first-step',
        title: 'First step',
        description: 'Selesaikan minimal 1 habit di tanggal terpilih.',
        progress: Math.min(completedSelectedDay, 1),
        target: 1,
        done: completedSelectedDay >= 1,
      },
      {
        id: 'daily-half-clear',
        title: 'Half clear',
        description: 'Tuntaskan separuh habit harianmu.',
        progress: Math.min(completedSelectedDay, Math.ceil(totalHabits / 2)),
        target: Math.ceil(totalHabits / 2),
        done: completedSelectedDay >= Math.ceil(totalHabits / 2),
      },
      {
        id: 'daily-perfect-or-rest',
        title: 'Clean finish',
        description: 'Capai 100% checklist atau tandai rest day sadar.',
        progress: selectedLog.restDay ? 1 : completedSelectedDay,
        target: selectedLog.restDay ? 1 : totalHabits,
        done: selectedLog.restDay || completedSelectedDay >= totalHabits,
      },
    ],
    weekly: [
      {
        id: 'weekly-three-active-days',
        title: '3 active days',
        description: 'Jaga ritme dengan 3 hari aktif minggu ini.',
        progress: Math.min(completedWeekDays, 3),
        target: 3,
        done: completedWeekDays >= 3,
      },
      {
        id: 'weekly-ten-checks',
        title: '10 habit clears',
        description: 'Kumpulkan 10 centang habit sepanjang minggu.',
        progress: Math.min(weeklyHabitChecks, 10),
        target: 10,
        done: weeklyHabitChecks >= 10,
      },
      {
        id: 'weekly-perfect-pair',
        title: 'Perfect pair',
        description: 'Buat 2 perfect day dalam satu minggu.',
        progress: Math.min(perfectWeekDays, 2),
        target: 2,
        done: perfectWeekDays >= 2,
      },
    ],
  };
}

function describeTrend(current, previous, unit) {
  if (current === 0 && previous === 0) return `Belum ada ${unit} di dua periode terakhir`;
  if (previous === 0) return current > 0 ? `Naik dari 0 ke ${current} ${unit}` : `Belum ada ${unit} periode ini`;
  const diff = current - previous;
  if (diff === 0) return `Stabil di ${current} ${unit}`;
  const direction = diff > 0 ? 'Naik' : 'Turun';
  const percent = Math.round((Math.abs(diff) / previous) * 100);
  return `${direction} ${Math.abs(diff)} ${unit} (${percent}%)`;
}

function getInsights(state) {
  const protectedEntries = Object.entries(state.logs)
    .filter(([, log]) => isProtectedLog(log))
    .sort(([a], [b]) => a.localeCompare(b));
  const protectedSet = new Set(protectedEntries.map(([key]) => key));
  const totalCompletedDays = protectedEntries.length;

  let longestStreak = 0;
  let run = 0;
  if (protectedEntries.length) {
    const first = new Date(`${protectedEntries[0][0]}T00:00:00`);
    const last = new Date(`${protectedEntries.at(-1)[0]}T00:00:00`);
    for (let cursor = first; cursor <= last; cursor = addDays(cursor, 1)) {
      if (protectedSet.has(toDateKey(cursor))) {
        run += 1;
        longestStreak = Math.max(longestStreak, run);
      } else {
        run = 0;
      }
    }
  }

  const weekBuckets = new Map();
  const monthBuckets = new Map();
  protectedEntries.forEach(([key, log]) => {
    const weekKey = weekKeyFromDateKey(key);
    const week = weekBuckets.get(weekKey) || { key: weekKey, activeDays: 0, xp: 0 };
    week.activeDays += 1;
    week.xp += logXp(log, state.habits);
    weekBuckets.set(weekKey, week);

    const month = monthBuckets.get(key.slice(0, 7)) || { key: key.slice(0, 7), activeDays: 0, xp: 0 };
    month.activeDays += 1;
    month.xp += logXp(log, state.habits);
    monthBuckets.set(month.key, month);
  });

  const bestWeek = [...weekBuckets.values()].sort((a, b) => b.activeDays - a.activeDays || b.xp - a.xp || a.key.localeCompare(b.key))[0] || null;
  const bestMonth = [...monthBuckets.values()].sort((a, b) => b.activeDays - a.activeDays || b.xp - a.xp || a.key.localeCompare(b.key))[0] || null;

  const today = new Date();
  const currentWeekStart = startOfWeek(today);
  const previousWeekStart = addDays(currentWeekStart, -7);
  const countRange = (start, days) => Array.from({ length: days }, (_, index) => toDateKey(addDays(start, index)))
    .filter(key => isProtectedLog(state.logs[key])).length;
  const currentWeekDays = countRange(currentWeekStart, 7);
  const previousWeekDays = countRange(previousWeekStart, 7);

  const currentMonth = monthKey(today);
  const previousMonth = monthKey(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const currentMonthDays = protectedEntries.filter(([key]) => key.startsWith(currentMonth)).length;
  const previousMonthDays = protectedEntries.filter(([key]) => key.startsWith(previousMonth)).length;

  const habitSignals = state.habits.map(habit => {
    const count = protectedEntries.filter(([, log]) => log.completed?.includes(habit.id)).length;
    return { ...habit, count, rate: totalCompletedDays ? Math.round((count / totalCompletedDays) * 100) : 0 };
  });
  const topHabit = habitSignals.length && totalCompletedDays
    ? [...habitSignals].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))[0]
    : null;
  const attentionHabit = habitSignals.length && totalCompletedDays
    ? [...habitSignals].sort((a, b) => a.count - b.count || a.title.localeCompare(b.title))[0]
    : null;

  return {
    currentStreak: getStreak(state.logs),
    longestStreak,
    bestWeek,
    bestMonth,
    totalCompletedDays,
    weekTrend: describeTrend(currentWeekDays, previousWeekDays, 'hari aktif/minggu'),
    monthTrend: describeTrend(currentMonthDays, previousMonthDays, 'hari aktif/bulan'),
    topHabit,
    attentionHabit,
    hasEnoughData: totalCompletedDays >= 3,
  };
}

function getMonthDays(currentMonth) {
  const [year, month] = currentMonth.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const leading = first.getDay();
  const days = [];
  for (let i = 0; i < leading; i += 1) days.push(null);
  for (let day = 1; day <= last.getDate(); day += 1) days.push(new Date(year, month - 1, day));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function getMonthReport(state, currentMonth) {
  const entries = Object.entries(state.logs).filter(([key]) => key.startsWith(currentMonth));
  const activeDays = entries.filter(([, log]) => isProtectedLog(log)).length;
  const restDays = entries.filter(([, log]) => log.restDay).length;
  const frozenDays = entries.filter(([, log]) => log.frozen).length;
  const perfectDays = entries.filter(([, log]) => !log.restDay && !log.frozen && logPercent(log, state.habits) === 100).length;
  const totalXp = entries.reduce((sum, [, log]) => sum + logXp(log, state.habits), 0);
  const possibleDays = new Date(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5)), 0).getDate();
  const consistency = Math.round((activeDays / possibleDays) * 100);
  const habitCounts = state.habits.map(habit => ({
    ...habit,
    count: entries.filter(([, log]) => log.completed?.includes(habit.id)).length,
  })).sort((a, b) => b.count - a.count);
  return { activeDays, restDays, frozenDays, perfectDays, totalXp, consistency, habitCounts };
}

function App() {
  const [profile, setProfile] = useState(loadProfile);
  const [state, setState] = useState(loadState);
  const [habitTitle, setHabitTitle] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [rewardCost, setRewardCost] = useState('');
  const [rewardMessage, setRewardMessage] = useState('');
  const [syncStatus, setSyncStatus] = useState('Local-first mode. Supabase sync checks after load.');
  const remoteLoadComplete = useRef(false);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [visibleMonth, setVisibleMonth] = useState(monthKey(new Date()));
  const [note, setNote] = useState(state.notes[todayKey()] || '');
  const [backupStatus, setBackupStatus] = useState('');
  const [questCompletions, setQuestCompletions] = useState(loadQuestCompletions);
  const importInputRef = useRef(null);
  const today = state.logs[selectedDate] || { completed: [] };

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state]);
  useEffect(() => localStorage.setItem(QUEST_COMPLETION_KEY, JSON.stringify(questCompletions)), [questCompletions]);
  useEffect(() => {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
  }, [profile]);
  useEffect(() => {
    let cancelled = false;
    const profileId = getSyncProfileId(profile);
    remoteLoadComplete.current = false;
    setSyncStatus('Checking Supabase sync...');
    fetchRemoteProgress(profileId)
      .then(data => {
        if (cancelled) return;
        if (data.configured && data.state) {
          setState(prev => mergeRemoteState(prev, data.state));
          setSyncStatus(data.syncedAt ? `Synced from Supabase at ${new Date(data.syncedAt).toLocaleTimeString()}` : 'Supabase sync ready.');
        } else {
          setSyncStatus('Local mode: add Supabase env vars to enable cloud persistence.');
        }
      })
      .catch(() => {
        if (!cancelled) setSyncStatus('Local mode: Supabase sync is unavailable right now.');
      })
      .finally(() => {
        if (!cancelled) remoteLoadComplete.current = true;
      });
    return () => { cancelled = true; };
  }, [profile?.email]);
  useEffect(() => {
    if (!remoteLoadComplete.current) return;
    const profileId = getSyncProfileId(profile);
    const handle = window.setTimeout(() => {
      saveRemoteProgress(profileId, profile, state)
        .then(data => {
          if (data.configured) setSyncStatus(`Saved to Supabase at ${new Date(data.syncedAt).toLocaleTimeString()}`);
        })
        .catch(() => setSyncStatus('Local changes saved. Remote sync failed.'));
    }, 700);
    return () => window.clearTimeout(handle);
  }, [state, profile]);
  useEffect(() => setNote(state.notes[selectedDate] || ''), [selectedDate, state.notes]);
  useEffect(() => {
    setState(prev => ({ ...prev, notes: { ...prev.notes, [selectedDate]: note } }));
  }, [note, selectedDate]);

  const stats = useMemo(() => {
    const baseXp = Object.values(state.logs).reduce((sum, log) => sum + logXp(log, state.habits), 0);
    const questXp = questBonusXp(questCompletions);
    const totalXp = baseXp + questXp;
    const completedToday = today.completed.length;
    const totalToday = state.habits.length || 1;
    const dailyPercent = Math.round((completedToday / totalToday) * 100);
    const activeDays = Object.values(state.logs).filter(isProtectedLog).length;
    const spentXp = redemptionSpent(state.redemptions || []);
    return { totalXp, questXp, spentXp, rewardBalance: Math.max(0, totalXp - spentXp), completedToday, totalToday, dailyPercent, activeDays, streak: getStreak(state.logs), level: getLevel(totalXp) };
  }, [state, today.completed.length, questCompletions]);

  const monthReport = useMemo(() => getMonthReport(state, visibleMonth), [state, visibleMonth]);
  const insights = useMemo(() => getInsights(state), [state]);
  const monthDays = useMemo(() => getMonthDays(visibleMonth), [visibleMonth]);
  const quests = useMemo(() => getQuests(state, selectedDate), [state, selectedDate]);
  const dailyQuestKey = selectedDate;
  const weeklyQuestKey = weekKeyFromDateKey(selectedDate);

  const achievements = [
    { icon: Flame, label: 'Streak 3 hari', done: stats.streak >= 3 },
    { icon: Trophy, label: 'Level 3', done: stats.level.level >= 3 },
    { icon: Award, label: '7 hari aktif', done: stats.activeDays >= 7 },
    { icon: Sparkles, label: '100% hari ini', done: stats.dailyPercent === 100 },
  ];

  function toggleHabit(id) {
    setState(prev => {
      const log = prev.logs[selectedDate] || { completed: [] };
      const completed = log.completed.includes(id) ? log.completed.filter(item => item !== id) : [...log.completed, id];
      return { ...prev, logs: { ...prev.logs, [selectedDate]: { ...log, completed, restDay: false, frozen: false } } };
    });
  }

  function addHabit(e) {
    e.preventDefault();
    const title = habitTitle.trim();
    if (!title) return;
    const palette = ['#2563eb', '#db2777', '#16a34a', '#9333ea', '#dc2626', '#0891b2'];
    setState(prev => ({
      ...prev,
      habits: [...prev.habits, { id: crypto.randomUUID(), title, points: 10 + Math.floor(Math.random() * 20), color: palette[prev.habits.length % palette.length] }],
    }));
    setHabitTitle('');
  }

  function resetDemo() {
    if (!confirm('Reset semua data lokal?')) return;
    const fresh = { habits: defaultHabits, logs: {}, notes: {}, freezeCount: DEFAULT_FREEZE_COUNT, rewards: defaultRewards, redemptions: [] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    setState(fresh);
    setSelectedDate(todayKey());
    setVisibleMonth(monthKey(new Date()));
    setNote('');
    setBackupStatus('');
  }

  function exportBackup() {
    const backup = {
      app: 'daily-progress-lab',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: { profile, state },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily-xp-backup-v${BACKUP_VERSION}-${todayKey()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setBackupStatus('Backup JSON berhasil dibuat. Simpan filenya baik-baik ya.');
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());
      const error = validateBackup(payload);
      if (error) {
        setBackupStatus(error);
        return;
      }

      const incomingState = normalizeBackupState(payload.data.state);
      const incomingProfile = payload.data.profile;
      const confirmed = confirm('Import backup akan menimpa profil dan semua data progress lokal saat ini. Lanjutkan?');
      if (!confirmed) {
        setBackupStatus('Import dibatalkan. Data lokal tidak diubah.');
        return;
      }

      setProfile(incomingProfile);
      setState(incomingState);
      setSelectedDate(todayKey());
      setVisibleMonth(monthKey(new Date()));
      setNote(incomingState.notes[todayKey()] || '');
      setBackupStatus('Import selesai. Data progress berhasil dipulihkan dari backup.');
    } catch {
      setBackupStatus('File tidak bisa dibaca sebagai JSON backup yang valid.');
    }
  }


  function toggleRestDay() {
    setState(prev => {
      const log = prev.logs[selectedDate] || { completed: [] };
      const restDay = !log.restDay;
      return {
        ...prev,
        logs: {
          ...prev.logs,
          [selectedDate]: { ...log, completed: restDay ? [] : log.completed, restDay, frozen: restDay ? false : log.frozen },
        },
      };
    });
  }

  function useFreeze() {
    setState(prev => {
      const log = prev.logs[selectedDate] || { completed: [] };
      if (prev.freezeCount <= 0 || !isPastDate(selectedDate) || isProtectedLog(log)) return prev;
      return {
        ...prev,
        freezeCount: prev.freezeCount - 1,
        logs: { ...prev.logs, [selectedDate]: { ...log, completed: [], frozen: true, restDay: false } },
      };
    });
  }

  function claimQuest(tier, quest) {
    const periodKey = tier === 'daily' ? dailyQuestKey : weeklyQuestKey;
    if (!quest.done || questCompletions[tier]?.[periodKey]?.[quest.id]) return;
    setQuestCompletions(prev => ({
      ...prev,
      [tier]: {
        ...(prev[tier] || {}),
        [periodKey]: { ...(prev[tier]?.[periodKey] || {}), [quest.id]: true },
      },
    }));
  }

  function changeMonth(offset) {
    const [year, month] = visibleMonth.split('-').map(Number);
    const next = new Date(year, month - 1 + offset, 1);
    setVisibleMonth(monthKey(next));
  }

  function addReward(e) {
    e.preventDefault();
    const name = rewardName.trim();
    const cost = Number(rewardCost);
    if (!name || !Number.isFinite(cost) || cost <= 0) {
      setRewardMessage('Isi nama reward dan biaya XP yang valid dulu.');
      return;
    }
    setState(prev => ({
      ...prev,
      rewards: [...(prev.rewards || []), { id: crypto.randomUUID(), name, cost: Math.round(cost) }],
    }));
    setRewardName('');
    setRewardCost('');
    setRewardMessage('Reward baru masuk shop. Tinggal dikejar XP-nya ✨');
  }

  function editReward(reward) {
    const name = prompt('Nama reward', reward.name)?.trim();
    if (!name) return;
    const cost = Number(prompt('Biaya XP', reward.cost));
    if (!Number.isFinite(cost) || cost <= 0) {
      setRewardMessage('Biaya reward harus angka lebih dari 0.');
      return;
    }
    setState(prev => ({
      ...prev,
      rewards: (prev.rewards || []).map(item => item.id === reward.id ? { ...item, name, cost: Math.round(cost) } : item),
    }));
    setRewardMessage('Reward berhasil diperbarui.');
  }

  function deleteReward(id) {
    if (!confirm('Hapus reward ini dari shop? Riwayat redeem tetap disimpan.')) return;
    setState(prev => ({ ...prev, rewards: (prev.rewards || []).filter(item => item.id !== id) }));
    setRewardMessage('Reward dihapus dari shop.');
  }

  function redeemReward(reward) {
    if (stats.rewardBalance < reward.cost) {
      setRewardMessage(`XP belum cukup untuk ${reward.name}. Butuh ${reward.cost - stats.rewardBalance} XP lagi.`);
      return;
    }
    setState(prev => ({
      ...prev,
      redemptions: [
        { id: crypto.randomUUID(), rewardId: reward.id, name: reward.name, cost: reward.cost, redeemedAt: new Date().toISOString() },
        ...(prev.redemptions || []),
      ],
    }));
    setRewardMessage(`Redeemed: ${reward.name}. Nikmati hadiahnya, kamu pantas dapat ini.`);
  }

  const selectedLog = state.logs[selectedDate] || { completed: [] };
  const canUseFreeze = state.freezeCount > 0 && isPastDate(selectedDate) && !isProtectedLog(selectedLog);

  if (!profile) return <LoginScreen onLogin={setProfile} />;

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow"><Zap size={16}/> Daily XP</p>
          <h1>Level up progress harianmu, satu quest kecil tiap hari.</h1>
          <p className="subtitle">Catat habit, kumpulkan XP, naik level, jaga streak, dan ubah rutinitasmu jadi RPG ringan untuk hidup nyata.</p>
        </div>
        <div className="level-card">
          <div className="profile-row">
            <UserCircle2 size={38}/>
            <div><strong>{profile.name}</strong><small>{profile.email}</small></div>
            <button className="icon-btn" onClick={() => setProfile(null)} title="Logout"><LogOut size={18}/></button>
          </div>
          <div className="level-ring">Lv {stats.level.level}</div>
          <div>
            <strong>{stats.level.current}/{stats.level.required} XP</strong>
            <div className="bar"><span style={{ width: `${stats.level.percent}%` }} /></div>
            <small>{stats.level.percent}% menuju level berikutnya</small>
          </div>
        </div>
      </section>

      <section className="idea-strip panel">
        <strong>Daily XP roadmap:</strong>
        <span>quest harian</span><span>party goals</span><span>boss battle mingguan</span><span>reminder streak</span><span>leaderboard privat</span>
      </section>

      <section className="backup-panel panel">
        <div>
          <p className="eyebrow">Backup lokal v{BACKUP_VERSION}</p>
          <h2>Export / Import Data</h2>
          <p>Simpan atau pulihkan profil, habit, XP, badge, quest, dan riwayat progress dari file JSON.</p>
          {backupStatus && <small className="backup-status">{backupStatus}</small>}
        </div>
        <div className="backup-actions">
          <button className="ghost" type="button" onClick={exportBackup}>Export Data</button>
          <button className="ghost" type="button" onClick={() => importInputRef.current?.click()}>Import Data</button>
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={importBackup} hidden />
        </div>
      </section>

      <section className="grid stats-grid five">
        <Stat icon={Target} label="Progress tanggal terpilih" value={`${stats.dailyPercent}%`} />
        <Stat icon={Flame} label="Streak" value={`${stats.streak} hari`} />
        <Stat icon={ShieldCheck} label="Streak Freeze" value={`${state.freezeCount} tersedia`} />
        <Stat icon={Sparkles} label="Total XP" value={stats.totalXp} />
        <Stat icon={CalendarDays} label="Hari aktif" value={stats.activeDays} />
      </section>

      <section className="grid main-grid">
        <section className="panel today-panel">
          <div className="section-head">
            <div><p className="eyebrow">{selectedDate === todayKey() ? 'Hari ini' : selectedDate}</p><h2>Checklist progress</h2></div>
            <button className="ghost" onClick={resetDemo}><RotateCcw size={16}/> Reset</button>
          </div>
          <div className="daily-progress"><span style={{ width: `${stats.dailyPercent}%` }} /></div>
          <div className="protection-row">
            <button className={`ghost protection ${selectedLog.restDay ? 'active rest' : ''}`} onClick={toggleRestDay} type="button">Rest day +{REST_DAY_XP} XP</button>
            <button className={`ghost protection ${selectedLog.frozen ? 'active freeze' : ''}`} onClick={useFreeze} disabled={!canUseFreeze} type="button">Pakai freeze untuk missed day</button>
          </div>
          <p className="log-status">{selectedLog.frozen ? '🛡️ Tanggal ini dilindungi Streak Freeze.' : selectedLog.restDay ? '🌙 Tanggal ini ditandai Rest Day: sengaja istirahat, XP kecil saja.' : canUseFreeze ? 'Missed day terdeteksi. Pakai freeze untuk menjaga streak.' : 'Checklist habit atau tandai rest day kalau memang sengaja istirahat.'}</p>
          <div className="habit-list">
            {state.habits.map(habit => {
              const done = today.completed.includes(habit.id);
              return <button key={habit.id} className={`habit ${done ? 'done' : ''}`} onClick={() => toggleHabit(habit.id)}>
                <span className="dot" style={{ background: habit.color }} />
                <span>{habit.title}</span>
                <strong>+{habit.points} XP</strong>
                <CheckCircle2 className="check" size={22}/>
              </button>;
            })}
          </div>
          <form className="add-form" onSubmit={addHabit}>
            <input value={habitTitle} onChange={e => setHabitTitle(e.target.value)} placeholder="Tambah quest/habit baru..." />
            <button><Plus size={18}/> Tambah</button>
          </form>
        </section>

        <section className="panel quest-panel">
          <div className="section-head compact">
            <div><p className="eyebrow"><Target size={16}/> Quest bonus</p><h2>Misi harian & mingguan</h2></div>
            <span className="quest-xp">+{stats.questXp} XP bonus terkumpul</span>
          </div>
          <QuestGroup title="Daily Quests" subtitle={`Reset lokal: ${dailyQuestKey}`} tier="daily" quests={quests.daily} completions={questCompletions.daily?.[dailyQuestKey] || {}} onClaim={claimQuest} />
          <QuestGroup title="Weekly Quests" subtitle={`Reset minggu: ${weeklyQuestKey}`} tier="weekly" quests={quests.weekly} completions={questCompletions.weekly?.[weeklyQuestKey] || {}} onClaim={claimQuest} />
        </section>

        <section className="panel calendar-panel">
          <div className="section-head compact">
            <div><p className="eyebrow">Kalender</p><h2>{visibleMonth}</h2></div>
            <div className="month-nav"><button onClick={() => changeMonth(-1)}><ChevronLeft size={18}/></button><button onClick={() => changeMonth(1)}><ChevronRight size={18}/></button></div>
          </div>
          <div className="weekday-grid">{['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map(day => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">
            {monthDays.map((day, index) => {
              if (!day) return <span className="calendar-cell empty" key={`empty-${index}`} />;
              const key = toDateKey(day);
              const percent = logPercent(state.logs[key], state.habits);
              const log = state.logs[key];
              const stateClass = log?.frozen ? 'frozen' : log?.restDay ? 'rest' : percent > 0 ? 'done' : '';
              return <button key={key} className={`calendar-cell ${stateClass} ${key === selectedDate ? 'selected' : ''}`} onClick={() => setSelectedDate(key)}>
                <span>{day.getDate()}</span><small>{log?.frozen ? 'Freeze' : log?.restDay ? 'Rest' : percent ? `${percent}%` : '—'}</small><i style={{ opacity: Math.max(.08, percent / 100), background: log?.frozen ? '#38bdf8' : log?.restDay ? '#f59e0b' : percent === 100 ? '#22c55e' : '#8b5cf6' }} />
              </button>;
            })}
          </div>
        </section>
      </section>

      <section className="panel insights-panel">
        <div className="section-head compact">
          <div><p className="eyebrow"><BarChart3 size={16}/> Insights</p><h2>Personal best & sinyal konsistensi</h2></div>
          {!insights.hasEnoughData && <span className="empty-pill">Butuh 3 hari aktif untuk insight lebih tajam</span>}
        </div>
        <div className="insight-grid">
          <Report label="Current streak" value={`${insights.currentStreak} hari`} />
          <Report label="Longest streak" value={`${insights.longestStreak} hari`} />
          <Report label="Best week" value={insights.bestWeek ? `${insights.bestWeek.activeDays} hari • ${insights.bestWeek.key}` : 'Belum ada'} />
          <Report label="Best month" value={insights.bestMonth ? `${insights.bestMonth.activeDays} hari • ${insights.bestMonth.key}` : 'Belum ada'} />
          <Report label="Total completed days" value={`${insights.totalCompletedDays} hari`} />
        </div>
        <div className="trend-grid">
          <div className="signal-card"><span>Vs minggu lalu</span><strong>{insights.weekTrend}</strong></div>
          <div className="signal-card"><span>Vs bulan lalu</span><strong>{insights.monthTrend}</strong></div>
          <div className="signal-card positive"><span>Top habit</span><strong>{insights.topHabit ? `${insights.topHabit.title} • ${insights.topHabit.count}x` : 'Belum cukup data'}</strong></div>
          <div className="signal-card warning"><span>Butuh perhatian</span><strong>{insights.attentionHabit ? `${insights.attentionHabit.title} • ${insights.attentionHabit.rate}%` : 'Belum cukup data'}</strong></div>
        </div>
      </section>

      <section className="grid lower-grid">
        <div className="panel">
          <p className="eyebrow">Refleksi</p>
          <h2>Catatan kemenangan kecil</h2>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Quest kecil apa yang kamu menangkan hari ini?" />
        </div>
        <div className="panel">
          <p className="eyebrow"><BarChart3 size={16}/> Laporan bulanan</p>
          <h2>Ringkasan {visibleMonth}</h2>
          <div className="report-grid">
            <Report label="XP bulan ini" value={monthReport.totalXp} />
            <Report label="Hari aktif" value={monthReport.activeDays} />
            <Report label="Perfect days" value={monthReport.perfectDays} />
            <Report label="Rest / Freeze" value={`${monthReport.restDays}/${monthReport.frozenDays}`} />
            <Report label="Konsistensi" value={`${monthReport.consistency}%`} />
          </div>
          <div className="habit-ranking">
            {monthReport.habitCounts.map(habit => <div key={habit.id}>
              <span><i style={{ background: habit.color }} />{habit.title}</span><strong>{habit.count}x</strong>
            </div>)}
          </div>
        </div>
      </section>

      <section className="panel reward-panel">
        <div className="section-head">
          <div><p className="eyebrow"><Gift size={16}/> Reward shop</p><h2>Tukar progress jadi self-reward</h2></div>
          <div className="reward-balance"><Coins size={18}/><span>{stats.rewardBalance} XP tersedia</span><small>{stats.spentXp} XP sudah diredeem</small></div>
        </div>
        <form className="reward-form" onSubmit={addReward}>
          <input value={rewardName} onChange={e => setRewardName(e.target.value)} placeholder="Nama reward, mis. boba favorit" />
          <input value={rewardCost} onChange={e => setRewardCost(e.target.value)} placeholder="Biaya XP" type="number" min="1" />
          <button><Plus size={18}/> Tambah reward</button>
        </form>
        {rewardMessage && <p className="reward-message">{rewardMessage}</p>}
        <div className="reward-layout">
          <div className="reward-list">
            {(state.rewards || []).map(reward => <article className="reward-card" key={reward.id}>
              <div><strong>{reward.name}</strong><span>{reward.cost} XP</span></div>
              <button className="ghost" onClick={() => redeemReward(reward)} type="button">Redeem</button>
              <button className="icon-btn" onClick={() => editReward(reward)} title="Edit reward" type="button"><Pencil size={16}/></button>
              <button className="icon-btn danger" onClick={() => deleteReward(reward.id)} title="Hapus reward" type="button"><Trash2 size={16}/></button>
            </article>)}
          </div>
          <div className="redemption-history">
            <h3>Recent redemptions</h3>
            {(state.redemptions || []).length ? (state.redemptions || []).slice(0, 5).map(item => <div key={item.id}>
              <span>{item.name}</span><strong>-{item.cost} XP</strong><small>{new Date(item.redeemedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</small>
            </div>) : <p>Belum ada reward yang diredeem. Kumpulkan XP dulu, lalu manjakan diri dengan elegan.</p>}
          </div>
        </div>
      </section>

      <section className="panel achievement-panel">
        <p className="eyebrow">Achievement</p>
        <h2>Badge unlocked</h2>
        <div className="badges">
          {achievements.map(({ icon: Icon, label, done }) => <div className={`badge ${done ? 'unlocked' : ''}`} key={label}>
            <Icon size={20}/><span>{label}</span>
          </div>)}
        </div>
      </section>
    </main>
  );
}

function LoginScreen({ onLogin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  function submit(e) {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName || !cleanEmail.includes('@')) return;
    onLogin({ name: cleanName, email: cleanEmail, joinedAt: new Date().toISOString() });
  }
  return <main className="login-shell">
    <section className="login-card panel">
      <p className="eyebrow"><Sparkles size={16}/> Daily XP</p>
      <h1>Masuk dulu, lalu mulai naik level hari ini.</h1>
      <p className="subtitle">Daily XP menyimpan progress lokal di browser—cukup ringan untuk tracking XP, streak, dan level pribadimu.</p>
      <form onSubmit={submit} className="login-form">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nama panggilan" autoFocus />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" />
        <button>Mulai tracking</button>
      </form>
    </section>
  </main>;
}

function Stat({ icon: Icon, label, value }) {
  return <div className="stat panel"><Icon size={22}/><span>{label}</span><strong>{value}</strong></div>;
}

function QuestGroup({ title, subtitle, tier, quests, completions, onClaim }) {
  return <div className="quest-group">
    <div className="quest-group-head"><div><h3>{title}</h3><small>{subtitle}</small></div><strong>+{QUEST_BONUS_BY_TIER[tier]} XP/quest</strong></div>
    <div className="quest-list">
      {quests.map(quest => {
        const claimed = Boolean(completions[quest.id]);
        const percent = Math.min(100, Math.round((quest.progress / quest.target) * 100));
        return <article className={`quest-card ${quest.done ? 'ready' : ''} ${claimed ? 'claimed' : ''}`} key={quest.id}>
          <div className="quest-copy">
            <strong>{quest.title}</strong>
            <span>{quest.description}</span>
            <small>{quest.progress}/{quest.target} selesai</small>
          </div>
          <div className="quest-meter"><span style={{ width: `${percent}%` }} /></div>
          <button className="ghost" type="button" disabled={!quest.done || claimed} onClick={() => onClaim(tier, quest)}>
            {claimed ? 'XP claimed' : quest.done ? 'Claim XP' : 'In progress'}
          </button>
        </article>;
      })}
    </div>
  </div>;
}

function Report({ label, value }) {
  return <div className="report"><span>{label}</span><strong>{value}</strong></div>;
}

createRoot(document.getElementById('root')).render(<App />);
