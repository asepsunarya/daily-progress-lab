create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  display_name text,
  avatar_url text,
  freeze_count integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  name text not null,
  description text,
  color text,
  points integer not null default 10,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists daily_checkins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  habit_id uuid references habits(id) on delete cascade,
  checkin_date date not null,
  status text not null check (status in ('completed','missed','rest','frozen')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(profile_id, habit_id, checkin_date)
);

create table if not exists daily_notes (
  profile_id uuid references profiles(id) on delete cascade,
  note_date date not null,
  body text not null,
  updated_at timestamptz default now(),
  primary key (profile_id, note_date)
);

create table if not exists xp_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  amount int not null,
  reason text,
  event_date date default current_date,
  created_at timestamptz default now()
);

create table if not exists quests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  title text not null,
  quest_type text not null check (quest_type in ('daily','weekly')),
  target_count int not null default 1,
  progress_count int not null default 0,
  xp_reward int not null default 0,
  period_start date not null,
  period_end date not null,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists badges (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  icon text
);

create table if not exists user_badges (
  profile_id uuid references profiles(id) on delete cascade,
  badge_id uuid references badges(id) on delete cascade,
  unlocked_at timestamptz default now(),
  primary key (profile_id, badge_id)
);

create table if not exists rewards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  name text not null,
  cost int not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  reward_id uuid references rewards(id) on delete set null,
  cost int not null,
  redeemed_at timestamptz default now()
);
