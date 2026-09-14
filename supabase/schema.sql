create extension if not exists pgcrypto;

create table if not exists profiles (
  user_id bigint primary key,
  username text,
  first_name text,
  last_name text,
  bio text,
  avatar_url text,
  photo_url text,
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  user_id bigint primary key references profiles(user_id) on delete cascade,
  subscription_start timestamptz,
  subscription_end timestamptz,
  lifetime boolean not null default false,
  is_active boolean not null default false,
  total_paid bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references profiles(user_id) on delete cascade,
  sender_id bigint not null,
  text text not null check (char_length(text) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  seen_at timestamptz,
  read_at timestamptz
);

create index if not exists messages_user_created_idx on messages(user_id, created_at);
create index if not exists profiles_username_idx on profiles(lower(username));

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references profiles(user_id) on delete cascade,
  amount bigint not null,
  currency text not null default 'XTR',
  telegram_payment_charge_id text unique,
  invoice_payload text,
  created_at timestamptz not null default now()
);

create table if not exists admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id bigint not null,
  target_user_id bigint,
  target_id bigint,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table subscriptions enable row level security;
alter table messages enable row level security;
alter table payments enable row level security;
alter table admin_actions enable row level security;

-- Direct browser access is intentionally denied.
-- All application reads/writes go through the Edge Function after Telegram initData validation.
create policy "deny direct profiles" on profiles for all using (false) with check (false);
create policy "deny direct subscriptions" on subscriptions for all using (false) with check (false);
create policy "deny direct messages" on messages for all using (false) with check (false);
create policy "deny direct payments" on payments for all using (false) with check (false);
create policy "deny direct admin_actions" on admin_actions for all using (false) with check (false);

-- Realtime publication.
do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null;
end $$;
