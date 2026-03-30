create extension if not exists pgcrypto;

create table if not exists carry_tickets (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  channel_id text not null unique,
  user_id text not null,
  game_key text not null,
  game_label text,
  ign text,
  request text,
  ticket_num int,
  msg_id text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by text,
  claimed_by text,
  claimed_at timestamptz,
  vouched boolean not null default false,
  first_helper_response_at timestamptz,
  reminder_sent_at timestamptz,
  vouch_requested_at timestamptz,
  vouch_dm_1h_at timestamptz,
  vouch_dm_3h_at timestamptz
);

alter table carry_tickets add column if not exists vouched boolean not null default false;
alter table carry_tickets add column if not exists game_label text;
alter table carry_tickets add column if not exists ign text;
alter table carry_tickets add column if not exists request text;
alter table carry_tickets add column if not exists ticket_num int;
alter table carry_tickets add column if not exists msg_id text;
alter table carry_tickets add column if not exists claimed_by text;
alter table carry_tickets add column if not exists claimed_at timestamptz;
alter table carry_tickets add column if not exists first_helper_response_at timestamptz;
alter table carry_tickets add column if not exists reminder_sent_at timestamptz;
alter table carry_tickets add column if not exists closed_at timestamptz;
alter table carry_tickets add column if not exists closed_by text;
alter table carry_tickets add column if not exists vouch_requested_at timestamptz;
alter table carry_tickets add column if not exists vouch_dm_1h_at timestamptz;
alter table carry_tickets add column if not exists vouch_dm_3h_at timestamptz;

create table if not exists vouches (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  user_id text not null,
  helper_user_id text not null,
  game_key text not null,
  rating int not null check (rating >= 1 and rating <= 5),
  message text not null,
  message_id text,
  channel_id text,
  created_at timestamptz not null default now()
);

create table if not exists daily_message_stats (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  user_id text not null,
  day_key date not null,
  message_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, user_id, day_key)
);

create table if not exists ticket_blacklist (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  user_id text not null,
  reason text,
  created_by text,
  created_at timestamptz not null default now(),
  unique (guild_id, user_id)
);

create index if not exists idx_carry_tickets_guild_user_status on carry_tickets (guild_id, user_id, status);
create index if not exists idx_carry_tickets_claim_followup on carry_tickets (status, claimed_at, reminder_sent_at);
create index if not exists idx_carry_tickets_vouch_followup on carry_tickets (status, vouched, closed_at, vouch_requested_at);
create index if not exists idx_vouches_guild_helper on vouches (guild_id, helper_user_id);
create index if not exists idx_daily_message_stats_lookup on daily_message_stats (guild_id, user_id, day_key);
create index if not exists idx_ticket_blacklist_lookup on ticket_blacklist (guild_id, user_id);
