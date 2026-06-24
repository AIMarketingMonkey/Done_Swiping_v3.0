-- Done Swiping v3.0 — data model.
-- Run ONCE in the Supabase SQL Editor (Step A of the runbook), before anything else.
-- Includes the auto-profile trigger so every user has a profile row from signup.

create extension if not exists vector;

-- One row per auth user, created automatically on signup.
-- Demographics are captured by the AGENT (via the webhook), not by a form.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  age_confirmed_at timestamptz,            -- the 18+ tick-box (legal self-attestation)
  age int,                                 -- actual age, captured in conversation
  gender text,
  height_cm int,
  location text,
  seeking text,
  relationship_goal text,
  summary text,                            -- the agent's one-paragraph read of them
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now()
);

-- One per voice conversation.
create table public.conversations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  el_conversation_id text unique,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  summary text,
  retention_expires_at timestamptz
);

-- Psychographic insights (values, communication style, dealbreakers, etc.).
-- PK is REQUIRED for the webhook's upsert (a prior bug was an upsert with no
-- matching unique constraint -> 500). Always define the constraint the upsert uses.
create table public.profile_facts (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,                      -- 'value' | 'trait' | 'preference' | 'dealbreaker' | ...
  key text not null,
  value text not null,
  confidence numeric,
  source_conversation_id bigint references public.conversations (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint profile_facts_pk primary key (user_id, kind, key)
);

-- Embeddings for compatibility matching (gte-small = 384 dims).
create table public.embeddings (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,                      -- 'summary' | 'values' | 'goals'
  content text,
  embedding vector(384)
);

create table public.matches (
  id bigint generated always as identity primary key,
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  score numeric,
  rationale text,
  status text not null default 'suggested',
  created_at timestamptz not null default now()
);

alter table public.profiles      enable row level security;
alter table public.conversations enable row level security;
alter table public.profile_facts enable row level security;
alter table public.embeddings     enable row level security;
alter table public.matches        enable row level security;

create policy own_profile  on public.profiles      for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_convos    on public.conversations for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_facts      on public.profile_facts for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_embeddings on public.embeddings    for select using (auth.uid() = user_id);
create policy match_parties  on public.matches        for select using (auth.uid() in (user_a, user_b));
-- Edge Functions use the service-role key and bypass RLS for writes.

-- Auto-create a profile on every signup (prevents "no profile row / 406").
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Helpful indexes (safe to run; speed up the webhook writes and matching) ──
create index if not exists conversations_user_idx on public.conversations (user_id);
create index if not exists profile_facts_user_idx on public.profile_facts (user_id);
create index if not exists embeddings_user_idx on public.embeddings (user_id);
-- Approximate-nearest-neighbour index for cosine similarity over embeddings.
-- (Build after you have some rows; lists can be tuned as the table grows.)
create index if not exists embeddings_vec_idx
  on public.embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);
