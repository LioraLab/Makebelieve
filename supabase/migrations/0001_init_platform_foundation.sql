-- 0001_init_platform_foundation.sql
-- Makebelieve Platform Foundation (Step 1)
-- Scope: schema + RLS for stories, uploads, jobs, assets, orders

create extension if not exists pgcrypto;

create type if not exists public.payment_status as enum (
  'payment_pending',
  'paid',
  'refunded',
  'chargeback',
  'disputed'
);

create type if not exists public.fulfillment_status as enum (
  'none',
  'preview_queued',
  'preview_generating',
  'preview_ready',
  'preview_failed',
  'full_queued',
  'full_generating',
  'full_ready',
  'full_failed',
  'delivery_locked'
);

create type if not exists public.job_type as enum ('preview', 'full', 'pdf');

create type if not exists public.job_status as enum (
  'queued',
  'running',
  'ready',
  'failed',
  'dlq'
);

create type if not exists public.order_status as enum (
  'created',
  'paid',
  'failed',
  'refunded',
  'disputed',
  'chargeback'
);

create type if not exists public.asset_kind as enum (
  'photo',
  'preview',
  'full',
  'pdf',
  'other'
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  guest_session_id text,

  child_name text not null,
  age_band text,
  theme text not null,
  tone text,
  language text not null default 'en',
  request_payload jsonb not null default '{}'::jsonb,

  payment_status public.payment_status not null default 'payment_pending',
  fulfillment_status public.fulfillment_status not null default 'none',
  status text generated always as (
    case
      when fulfillment_status = 'full_ready' then 'complete'
      when payment_status in ('refunded', 'chargeback', 'disputed') then 'restricted'
      when fulfillment_status in ('preview_generating', 'full_generating') then 'processing'
      when fulfillment_status in ('preview_ready', 'full_queued') then 'ready'
      when fulfillment_status in ('preview_failed', 'full_failed', 'dlq') then 'failed'
      else 'draft'
    end
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.children_profiles (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  child_name text not null,
  age_band text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  kind public.asset_kind not null,
  storage_bucket text not null,
  storage_path text not null,
  content_type text,
  file_name text,
  file_size_bytes bigint,
  is_preview boolean not null default false,
  is_locked boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists assets_story_kind_unique on public.assets (story_id, kind, storage_path);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  type public.job_type not null,
  status public.job_status not null default 'queued',
  attempt_seq int not null default 1,
  max_attempts int not null default 3,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_code text,
  error_message text,
  next_retry_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  compensation_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists jobs_inflight_unique_idx on public.jobs (story_id, type) where status in ('queued','running');
create index if not exists jobs_status_idx on public.jobs (status, next_retry_at);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  paddle_event_id text unique,
  checkout_session_id text,
  plan_code text,
  status public.order_status not null default 'created',
  amount_cents int not null default 0,
  currency text not null default 'USD',
  provider text not null default 'paddle',
  is_active_paid boolean not null default false,
  webhook_raw jsonb,
  webhook_processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists orders_active_paid_idx
  on public.orders (story_id)
  where status = 'paid' and is_active_paid is true;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.stories(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  actor_id uuid,
  event_code text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Optional: prevent obvious invalid fulfillment transition.
create or replace function public.ensure_paid_for_full_enqueue()
returns trigger
language plpgsql
as $$
begin
  if new.type in ('full', 'pdf') and new.status = 'queued' then
    if (select payment_status from public.stories where id = new.story_id) <> 'paid' then
      raise exception 'full/pdf jobs require payment_status = paid';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_before_insert on public.jobs;
create trigger jobs_before_insert
before insert on public.jobs
for each row
  execute function public.ensure_paid_for_full_enqueue();

-- RLS: enable policies
alter table public.stories enable row level security;
alter table public.children_profiles enable row level security;
alter table public.assets enable row level security;
alter table public.jobs enable row level security;
alter table public.orders enable row level security;
alter table public.audit_events enable row level security;

-- Helper used by policies for guest session support.
create or replace function public.current_guest_session_id()
returns text
language sql
stable
security definer
as $$
  select coalesce((
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'guest_session_id'
  ), '');
$$;

create policy stories_select_owner_or_guest
  on public.stories
  for select
  using (
    user_id = auth.uid()
    or (
      user_id is null
      and guest_session_id is not null
      and guest_session_id = public.current_guest_session_id()
    )
    or auth.role() = 'service_role'
  );

create policy stories_insert_owner_or_guest
  on public.stories
  for insert
  with check (
    (user_id = auth.uid())
    or (user_id is null and guest_session_id is not null)
    or auth.role() = 'service_role'
  );

create policy stories_update_owner_or_worker
  on public.stories
  for update
  using (
    user_id = auth.uid()
    or (user_id is null and guest_session_id = public.current_guest_session_id())
    or auth.role() = 'service_role'
  )
  with check (
    user_id = auth.uid()
    or (user_id is null and guest_session_id = public.current_guest_session_id())
    or auth.role() = 'service_role'
  );

create policy children_profiles_select_owner_or_guest
  on public.children_profiles
  for select
  using (
    exists (
      select 1
      from public.stories s
      where s.id = children_profiles.story_id
        and (
          s.user_id = auth.uid()
          or (s.user_id is null and s.guest_session_id = public.current_guest_session_id())
          or auth.role() = 'service_role'
        )
    )
  );

create policy children_profiles_modify_owner_or_worker
  on public.children_profiles
  for all
  using (
    exists (
      select 1
      from public.stories s
      where s.id = children_profiles.story_id
        and (
          s.user_id = auth.uid()
          or (s.user_id is null and s.guest_session_id = public.current_guest_session_id())
          or auth.role() = 'service_role'
        )
    )
  )
  with check (
    exists (
      select 1
      from public.stories s
      where s.id = children_profiles.story_id
        and (
          s.user_id = auth.uid()
          or (s.user_id is null and s.guest_session_id = public.current_guest_session_id())
          or auth.role() = 'service_role'
        )
    )
  );

create policy assets_owner_or_service
  on public.assets
  for all
  using (
    exists (
      select 1
      from public.stories s
      where s.id = assets.story_id
        and (s.user_id = auth.uid() or (s.user_id is null and s.guest_session_id = public.current_guest_session_id()) or auth.role() = 'service_role')
    )
  )
  with check (
    exists (
      select 1
      from public.stories s
      where s.id = assets.story_id
        and (s.user_id = auth.uid() or (s.user_id is null and s.guest_session_id = public.current_guest_session_id()) or auth.role() = 'service_role')
    )
  );

create policy jobs_worker_only
  on public.jobs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy orders_owner_or_service
  on public.orders
  for all
  using (
    exists (
      select 1
      from public.stories s
      where s.id = orders.story_id
        and (s.user_id = auth.uid() or (s.user_id is null and s.guest_session_id = public.current_guest_session_id()) or auth.role() = 'service_role')
    )
  )
  with check (
    exists (
      select 1
      from public.stories s
      where s.id = orders.story_id
        and (s.user_id = auth.uid() or (s.user_id is null and s.guest_session_id = public.current_guest_session_id()) or auth.role() = 'service_role')
    )
  );

create policy audit_owner
  on public.audit_events
  for select
  using (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.stories s
      where s.id = audit_events.story_id
        and (s.user_id = auth.uid() or (s.user_id is null and s.guest_session_id = public.current_guest_session_id()))
    )
  );

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row
  execute function public.touch_updated_at();

drop trigger if exists stories_touch on public.stories;
create trigger stories_touch
  before update on public.stories
  for each row
  execute function public.touch_updated_at();

drop trigger if exists children_profiles_touch on public.children_profiles;
create trigger children_profiles_touch
  before update on public.children_profiles
  for each row
  execute function public.touch_updated_at();

drop trigger if exists assets_touch on public.assets;
create trigger assets_touch
  before update on public.assets
  for each row
  execute function public.touch_updated_at();

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch
  before update on public.jobs
  for each row
  execute function public.touch_updated_at();

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch
  before update on public.orders
  for each row
  execute function public.touch_updated_at();
