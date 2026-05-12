import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Award, CalendarDays, CheckCircle2, Flame, Plus, RotateCcw, Sparkles, Target, Trophy, Zap } from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'daily-progress-lab:v1';
const todayKey = () => new Date().toISOString().slice(0, 10);
const defaultHabits = [
  { id: crypto.randomUUID(), title: 'Deep work / belajar', points: 25, color: '#7c3aed' },
  { id: crypto.randomUUID(), title: 'Olahraga / jalan kaki', points: 20, color: '#059669' },
  { id: crypto.randomUUID(), title: 'Jurnal progress', points: 15, color: '#ea580c' },
];

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed?.habits && parsed?.logs) return parsed;
  } catch {}
  return { habits: defaultHabits, logs: {}, notes: {} };
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
    const key = cursor.toISOString().slice(0, 10);
    if (!logs[key]?.completed?.length) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function App() {
  const [state, setState] = useState(loadState);
  const [habitTitle, setHabitTitle] = useState('');
  const [note, setNote] = useState(state.notes[todayKey()] || '');
  const date = todayKey();
  const today = state.logs[date] || { completed: [] };

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state]);
  useEffect(() => {
    setState(prev => ({ ...prev, notes: { ...prev.notes, [date]: note } }));
  }, [note]);

  const stats = useMemo(() => {
    const totalXp = Object.entries(state.logs).reduce((sum, [, log]) => {
      return sum + (log.completed || []).reduce((inner, id) => inner + (state.habits.find(h => h.id === id)?.points || 0), 0);
    }, 0);
    const completedToday = today.completed.length;
    const totalToday = state.habits.length || 1;
    const dailyPercent = Math.round((completedToday / totalToday) * 100);
    const activeDays = Object.values(state.logs).filter(log => log.completed?.length).length;
    return { totalXp, completedToday, totalToday, dailyPercent, activeDays, streak: getStreak(state.logs), level: getLevel(totalXp) };
  }, [state, today.completed.length]);

  const achievements = [
    { icon: Flame, label: 'Streak 3 hari', done: stats.streak >= 3 },
    { icon: Trophy, label: 'Level 3', done: stats.level.level >= 3 },
    { icon: Award, label: '7 hari aktif', done: stats.activeDays >= 7 },
    { icon: Sparkles, label: '100% hari ini', done: stats.dailyPercent === 100 },
  ];

  function toggleHabit(id) {
    setState(prev => {
      const log = prev.logs[date] || { completed: [] };
      const completed = log.completed.includes(id) ? log.completed.filter(item => item !== id) : [...log.completed, id];
      return { ...prev, logs: { ...prev.logs, [date]: { ...log, completed } } };
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
    setNote('');
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow"><Zap size={16}/> Life progress tracker</p>
          <h1>Ubah progress harianmu jadi game kecil yang bikin nagih.</h1>
          <p className="subtitle">Catat habit, kumpulkan XP, naik level, jaga streak, dan lihat hidupmu bergerak maju setiap hari.</p>
        </div>
        <div className="level-card">
          <div className="level-ring">Lv {stats.level.level}</div>
          <div>
            <strong>{stats.level.current}/{stats.level.required} XP</strong>
            <div className="bar"><span style={{ width: `${stats.level.percent}%` }} /></div>
            <small>{stats.level.percent}% menuju level berikutnya</small>
          </div>
        </div>
      </section>

      <section className="grid stats-grid">
        <Stat icon={Target} label="Progress hari ini" value={`${stats.dailyPercent}%`} />
        <Stat icon={Flame} label="Streak" value={`${stats.streak} hari`} />
        <Stat icon={Sparkles} label="Total XP" value={stats.totalXp} />
        <Stat icon={CalendarDays} label="Hari aktif" value={stats.activeDays} />
      </section>

      <section className="panel today-panel">
        <div className="section-head">
          <div><p className="eyebrow">Hari ini</p><h2>Checklist progress</h2></div>
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

      <section className="grid lower-grid">
        <div className="panel">
          <p className="eyebrow">Refleksi</p>
          <h2>Catatan kemenangan kecil</h2>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Apa progress kecil yang kamu banggakan hari ini?" />
        </div>
        <div className="panel">
          <p className="eyebrow">Achievement</p>
          <h2>Badge unlocked</h2>
          <div className="badges">
            {achievements.map(({ icon: Icon, label, done }) => <div className={`badge ${done ? 'unlocked' : ''}`} key={label}>
              <Icon size={20}/><span>{label}</span>
            </div>)}
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ icon: Icon, label, value }) {
  return <div className="stat panel"><Icon size={22}/><span>{label}</span><strong>{value}</strong></div>;
}

createRoot(document.getElementById('root')).render(<App />);
