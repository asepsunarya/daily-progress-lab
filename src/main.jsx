import React, { useEffect, useMemo, useState } from 'react';
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
const dayMs = 24 * 60 * 60 * 1000;
const DEFAULT_FREEZE_COUNT = 2;
const REST_DAY_XP = 5;
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

function loadProfile() {
  const parsed = loadJson(PROFILE_KEY);
  if (parsed?.name && parsed?.email) return parsed;
  return null;
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
    const activeDays = Object.values(state.logs).filter(isProtectedLog).length;
    const spentXp = redemptionSpent(state.redemptions || []);
    return { totalXp, spentXp, rewardBalance: Math.max(0, totalXp - spentXp), completedToday, totalToday, dailyPercent, activeDays, streak: getStreak(state.logs), level: getLevel(totalXp) };
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
              const log = state.logs[key];
              const stateClass = log?.frozen ? 'frozen' : log?.restDay ? 'rest' : percent > 0 ? 'done' : '';
              return <button key={key} className={`calendar-cell ${stateClass} ${key === selectedDate ? 'selected' : ''}`} onClick={() => setSelectedDate(key)}>
                <span>{day.getDate()}</span><small>{log?.frozen ? 'Freeze' : log?.restDay ? 'Rest' : percent ? `${percent}%` : '—'}</small><i style={{ opacity: Math.max(.08, percent / 100), background: log?.frozen ? '#38bdf8' : log?.restDay ? '#f59e0b' : percent === 100 ? '#22c55e' : '#8b5cf6' }} />
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
