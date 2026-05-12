import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Award,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  LogOut,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  UserCircle2,
  Zap,
} from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'daily-progress-lab:v2';
const LEGACY_STORAGE_KEY = 'daily-progress-lab:v1';
const PROFILE_KEY = 'daily-progress-lab:profile';
const dayMs = 24 * 60 * 60 * 1000;
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
    return { habits: parsed.habits, logs: parsed.logs, notes: parsed.notes || {} };
  }
  return { habits: defaultHabits, logs: {}, notes: {} };
}

function loadProfile() {
  const parsed = loadJson(PROFILE_KEY);
  if (parsed?.name && parsed?.email) return parsed;
  return null;
}

function habitXp(habits, id) {
  return habits.find(habit => habit.id === id)?.points || 0;
}

function logXp(log, habits) {
  return (log?.completed || []).reduce((sum, id) => sum + habitXp(habits, id), 0);
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
    if (!logs[key]?.completed?.length) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
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
  const activeDays = entries.filter(([, log]) => log.completed?.length).length;
  const perfectDays = entries.filter(([, log]) => logPercent(log, state.habits) === 100).length;
  const totalXp = entries.reduce((sum, [, log]) => sum + logXp(log, state.habits), 0);
  const possibleDays = new Date(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5)), 0).getDate();
  const consistency = Math.round((activeDays / possibleDays) * 100);
  const habitCounts = state.habits.map(habit => ({
    ...habit,
    count: entries.filter(([, log]) => log.completed?.includes(habit.id)).length,
  })).sort((a, b) => b.count - a.count);
  return { activeDays, perfectDays, totalXp, consistency, habitCounts };
}

function App() {
  const [profile, setProfile] = useState(loadProfile);
  const [state, setState] = useState(loadState);
  const [habitTitle, setHabitTitle] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [visibleMonth, setVisibleMonth] = useState(monthKey(new Date()));
  const [note, setNote] = useState(state.notes[todayKey()] || '');
  const today = state.logs[selectedDate] || { completed: [] };

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state]);
  useEffect(() => {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
  }, [profile]);
  useEffect(() => setNote(state.notes[selectedDate] || ''), [selectedDate, state.notes]);
  useEffect(() => {
    setState(prev => ({ ...prev, notes: { ...prev.notes, [selectedDate]: note } }));
  }, [note, selectedDate]);

  const stats = useMemo(() => {
    const totalXp = Object.values(state.logs).reduce((sum, log) => sum + logXp(log, state.habits), 0);
    const completedToday = today.completed.length;
    const totalToday = state.habits.length || 1;
    const dailyPercent = Math.round((completedToday / totalToday) * 100);
    const activeDays = Object.values(state.logs).filter(log => log.completed?.length).length;
    return { totalXp, completedToday, totalToday, dailyPercent, activeDays, streak: getStreak(state.logs), level: getLevel(totalXp) };
  }, [state, today.completed.length]);

  const monthReport = useMemo(() => getMonthReport(state, visibleMonth), [state, visibleMonth]);
  const monthDays = useMemo(() => getMonthDays(visibleMonth), [visibleMonth]);

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
      return { ...prev, logs: { ...prev.logs, [selectedDate]: { ...log, completed } } };
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
    const fresh = { habits: defaultHabits, logs: {}, notes: {} };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    setState(fresh);
    setSelectedDate(todayKey());
    setVisibleMonth(monthKey(new Date()));
    setNote('');
  }

  function changeMonth(offset) {
    const [year, month] = visibleMonth.split('-').map(Number);
    const next = new Date(year, month - 1 + offset, 1);
    setVisibleMonth(monthKey(next));
  }

  if (!profile) return <LoginScreen onLogin={setProfile} />;

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow"><Zap size={16}/> Life progress tracker</p>
          <h1>Ubah progress harianmu jadi game kecil yang bikin nagih.</h1>
          <p className="subtitle">Catat habit, kumpulkan XP, naik level, jaga streak, dan lihat hidupmu bergerak maju setiap hari.</p>
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
        <strong>Ide roadmap berikutnya:</strong>
        <span>cloud login Google</span><span>multi project tracker</span><span>export PDF bulanan</span><span>reminder WhatsApp</span><span>leaderboard privat</span>
      </section>

      <section className="grid stats-grid">
        <Stat icon={Target} label="Progress tanggal terpilih" value={`${stats.dailyPercent}%`} />
        <Stat icon={Flame} label="Streak" value={`${stats.streak} hari`} />
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
            <input value={habitTitle} onChange={e => setHabitTitle(e.target.value)} placeholder="Tambah progress/habit baru..." />
            <button><Plus size={18}/> Tambah</button>
          </form>
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
              return <button key={key} className={`calendar-cell ${key === selectedDate ? 'selected' : ''}`} onClick={() => setSelectedDate(key)}>
                <span>{day.getDate()}</span><i style={{ opacity: Math.max(.08, percent / 100), background: percent === 100 ? '#22c55e' : '#8b5cf6' }} />
              </button>;
            })}
          </div>
        </section>
      </section>

      <section className="grid lower-grid">
        <div className="panel">
          <p className="eyebrow">Refleksi</p>
          <h2>Catatan kemenangan kecil</h2>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Apa progress kecil yang kamu banggakan di tanggal ini?" />
        </div>
        <div className="panel">
          <p className="eyebrow"><BarChart3 size={16}/> Laporan bulanan</p>
          <h2>Ringkasan {visibleMonth}</h2>
          <div className="report-grid">
            <Report label="XP bulan ini" value={monthReport.totalXp} />
            <Report label="Hari aktif" value={monthReport.activeDays} />
            <Report label="Perfect days" value={monthReport.perfectDays} />
            <Report label="Konsistensi" value={`${monthReport.consistency}%`} />
          </div>
          <div className="habit-ranking">
            {monthReport.habitCounts.map(habit => <div key={habit.id}>
              <span><i style={{ background: habit.color }} />{habit.title}</span><strong>{habit.count}x</strong>
            </div>)}
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
      <p className="eyebrow"><Sparkles size={16}/> Daily Progress Lab</p>
      <h1>Masuk dulu, lalu jadikan harimu punya progress bar.</h1>
      <p className="subtitle">Login ini masih lokal di browser—cukup untuk personal tracking tanpa database.</p>
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

function Report({ label, value }) {
  return <div className="report"><span>{label}</span><strong>{value}</strong></div>;
}

createRoot(document.getElementById('root')).render(<App />);
