// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function json(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function configured() {
  return Boolean(supabaseUrl && supabaseKey);
}

function client() {
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase is not configured');
  return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
}

function normaliseState(input: any) {
  return {
    habits: Array.isArray(input?.habits) ? input.habits : [],
    logs: input?.logs && typeof input.logs === 'object' ? input.logs : {},
    notes: input?.notes && typeof input.notes === 'object' ? input.notes : {},
    freezeCount: Number.isFinite(input?.freezeCount) ? input.freezeCount : 0,
    rewards: Array.isArray(input?.rewards) ? input.rewards : [],
    redemptions: Array.isArray(input?.redemptions) ? input.redemptions : [],
  };
}

async function ensureProfile(db: ReturnType<typeof createClient>, profileId: string, profile: any = {}) {
  const displayName = profile?.name || profile?.email || 'Daily XP player';
  const { data, error } = await db
    .from('profiles')
    .upsert({ external_id: profileId, display_name: displayName }, { onConflict: 'external_id' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

async function readProgress(profileId: string) {
  const db = client();
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id, freeze_count')
    .eq('external_id', profileId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return { habits: [], logs: {}, notes: {}, rewards: [], redemptions: [], freezeCount: 0 };

  const [{ data: habits, error: habitsError }, { data: checkins, error: checkinsError }, { data: notes, error: notesError }] = await Promise.all([
    db.from('habits').select('id, name, points, color, is_active').eq('profile_id', profile.id).order('created_at'),
    db.from('daily_checkins').select('habit_id, checkin_date, status').eq('profile_id', profile.id),
    db.from('daily_notes').select('note_date, body').eq('profile_id', profile.id),
  ]);
  if (habitsError) throw habitsError;
  if (checkinsError) throw checkinsError;
  if (notesError) throw notesError;

  const logs: Record<string, any> = {};
  for (const item of checkins || []) {
    const key = item.checkin_date;
    logs[key] ||= { completed: [] };
    if (item.status === 'completed') logs[key].completed.push(item.habit_id);
    if (item.status === 'rest') logs[key].restDay = true;
    if (item.status === 'frozen') logs[key].frozen = true;
  }

  return {
    habits: (habits || []).map((habit: any) => ({ id: habit.id, title: habit.name, points: habit.points || 10, color: habit.color || '#7c3aed' })),
    logs,
    notes: Object.fromEntries((notes || []).map((note: any) => [note.note_date, note.body])),
    freezeCount: profile.freeze_count || 0,
    rewards: [],
    redemptions: [],
  };
}

async function saveProgress(profileId: string, profile: any, rawState: any) {
  const db = client();
  const state = normaliseState(rawState);
  const profileUuid = await ensureProfile(db, profileId, profile);

  await db.from('profiles').update({ freeze_count: state.freezeCount }).eq('id', profileUuid);

  if (state.habits.length) {
    const habits = state.habits.map((habit: any) => ({
      id: habit.id,
      profile_id: profileUuid,
      name: habit.title || 'Untitled habit',
      points: Number(habit.points) || 10,
      color: habit.color || '#7c3aed',
      is_active: true,
    }));
    const { error } = await db.from('habits').upsert(habits, { onConflict: 'id' });
    if (error) throw error;
  }

  const checkins = Object.entries(state.logs).flatMap(([date, log]: [string, any]) => {
    const completed = new Set(log?.completed || []);
    return state.habits.map((habit: any) => ({
      profile_id: profileUuid,
      habit_id: habit.id,
      checkin_date: date,
      status: log?.restDay ? 'rest' : log?.frozen ? 'frozen' : completed.has(habit.id) ? 'completed' : 'missed',
    }));
  });
  if (checkins.length) {
    const { error } = await db.from('daily_checkins').upsert(checkins, { onConflict: 'profile_id,habit_id,checkin_date' });
    if (error) throw error;
  }

  const notes = Object.entries(state.notes)
    .filter(([, body]) => String(body || '').trim())
    .map(([date, body]) => ({ profile_id: profileUuid, note_date: date, body: String(body) }));
  if (notes.length) {
    const { error } = await db.from('daily_notes').upsert(notes, { onConflict: 'profile_id,note_date' });
    if (error) throw error;
  }

  return { syncedAt: new Date().toISOString() };
}

export default async function handler(req: any, res: any) {
  if (!configured()) return json(res, 200, { configured: false, state: null });
  try {
    if (req.method === 'GET') {
      const profileId = String(req.query.profileId || 'browser:anonymous');
      const state = await readProgress(profileId);
      return json(res, 200, { configured: true, state, syncedAt: new Date().toISOString() });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const profileId = String(body?.profileId || 'browser:anonymous');
      const result = await saveProgress(profileId, body?.profile, body?.state);
      return json(res, 200, { configured: true, ...result });
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (error: any) {
    return json(res, 500, { configured: true, error: error.message || 'Daily progress API failed' });
  }
}
