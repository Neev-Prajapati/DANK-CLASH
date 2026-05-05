-- Dank Clash backend schema.
-- Run this file in your Supabase SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.memes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_name text not null,
  title text not null,
  image_path text not null,
  image_url text not null,
  like_count integer not null default 0,
  post_day date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.memes add column if not exists post_day date not null default current_date;

update public.memes
set post_day = (created_at at time zone 'utc')::date;

with duplicate_posts as (
  select
    id,
    row_number() over (
      partition by user_id, post_day
      order by created_at
    ) as duplicate_rank
  from public.memes
)
update public.memes
set post_day = public.memes.post_day - (duplicate_posts.duplicate_rank - 1)::integer
from duplicate_posts
where public.memes.id = duplicate_posts.id
  and duplicate_posts.duplicate_rank > 1;

create table if not exists public.votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  meme_id uuid not null references public.memes(id) on delete cascade,
  vote_day date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.votes add column if not exists vote_day date not null default current_date;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'votes'
      and constraint_name = 'votes_pkey'
  ) then
    alter table public.votes drop constraint votes_pkey;
  end if;
end $$;

create unique index if not exists votes_one_per_user_per_day
on public.votes (user_id, vote_day);

create unique index if not exists memes_one_post_per_user_per_day
on public.memes (user_id, post_day);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.memes enable row level security;
alter table public.votes enable row level security;
alter table public.admins enable row level security;
alter table public.admin_requests enable row level security;

drop policy if exists "Profiles are public" on public.profiles;
create policy "Profiles are public" on public.profiles
for select using (true);

drop policy if exists "Users can manage their profile" on public.profiles;
create policy "Users can manage their profile" on public.profiles
for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Memes are public" on public.memes;
create policy "Memes are public" on public.memes
for select using (true);

drop policy if exists "Signed-in users can post memes" on public.memes;
create policy "Signed-in users can post memes" on public.memes
for insert with check (auth.uid() = user_id);

drop policy if exists "Admins can delete memes" on public.memes;
create policy "Admins can delete memes" on public.memes
for delete using (
  exists (
    select 1 from public.admins
    where admins.user_id = auth.uid()
  )
);

drop policy if exists "Users can see votes" on public.votes;
create policy "Users can see votes" on public.votes
for select using (true);

drop policy if exists "Users can manage own vote" on public.votes;
create policy "Users can manage own vote" on public.votes
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Admins can delete votes" on public.votes;
create policy "Admins can delete votes" on public.votes
for delete using (
  exists (
    select 1 from public.admins
    where admins.user_id = auth.uid()
  )
);

drop policy if exists "Admins can read admin list" on public.admins;
create policy "Admins can read admin list" on public.admins
for select using (auth.uid() = user_id);

drop policy if exists "Users can read own admin request" on public.admin_requests;
create policy "Users can read own admin request" on public.admin_requests
for select using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('memes', 'memes', true)
on conflict (id) do update set public = true;

drop policy if exists "Public meme images are readable" on storage.objects;
create policy "Public meme images are readable" on storage.objects
for select using (bucket_id = 'memes');

drop policy if exists "Signed-in users can upload meme images" on storage.objects;
create policy "Signed-in users can upload meme images" on storage.objects
for insert with check (
  bucket_id = 'memes'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Admins can delete meme images" on storage.objects;
create policy "Admins can delete meme images" on storage.objects
for delete using (
  bucket_id = 'memes'
  and exists (
    select 1 from public.admins
    where admins.user_id = auth.uid()
  )
);

create or replace function public.cast_meme_vote(p_meme_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  previous_meme_id uuid;
  meme_owner_id uuid;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to vote.';
  end if;

  select user_id into meme_owner_id
  from public.memes
  where id = p_meme_id;

  if meme_owner_id is null then
    raise exception 'Meme not found.';
  end if;

  if meme_owner_id = current_user_id then
    raise exception 'You cannot vote for your own meme.';
  end if;

  select meme_id into previous_meme_id
  from public.votes
  where user_id = current_user_id
    and vote_day = current_date;

  if previous_meme_id = p_meme_id then
    -- Votes are sticky. Clicking the same meme again keeps the vote placed.
    return;
  end if;

  if previous_meme_id is not null then
    update public.memes set like_count = greatest(0, like_count - 1)
    where id = previous_meme_id;
  end if;

  insert into public.votes (user_id, meme_id, vote_day)
  values (current_user_id, p_meme_id, current_date)
  on conflict (user_id, vote_day)
  do update set meme_id = excluded.meme_id, created_at = now();

  update public.memes set like_count = like_count + 1
  where id = p_meme_id;
end;
$$;

grant execute on function public.cast_meme_vote(uuid) to authenticated;

drop function if exists public.delete_meme_as_admin(uuid);

create or replace function public.request_admin_access(p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  current_name text;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to request admin access.';
  end if;

  if length(trim(p_reason)) < 12 then
    raise exception 'Tell us a little more about why you should be an admin.';
  end if;

  if exists (select 1 from public.admins where user_id = current_user_id) then
    raise exception 'You are already an admin.';
  end if;

  select email into current_email
  from auth.users
  where id = current_user_id;

  select display_name into current_name
  from public.profiles
  where id = current_user_id;

  insert into public.admin_requests (
    user_id,
    email,
    display_name,
    reason,
    status,
    reviewed_by,
    reviewed_at
  )
  values (
    current_user_id,
    coalesce(current_email, 'unknown'),
    current_name,
    trim(p_reason),
    'pending',
    null,
    null
  )
  on conflict (user_id)
  do update set
    email = excluded.email,
    display_name = excluded.display_name,
    reason = excluded.reason,
    status = 'pending',
    reviewed_by = null,
    reviewed_at = null,
    created_at = now();
end;
$$;

grant execute on function public.request_admin_access(text) to authenticated;

create or replace function public.list_admin_requests()
returns table (
  id uuid,
  user_id uuid,
  email text,
  display_name text,
  reason text,
  status text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1 from public.admins
    where admins.user_id = current_user_id
  ) then
    raise exception 'Admin access required.';
  end if;

  return query
  select
    admin_requests.id,
    admin_requests.user_id,
    admin_requests.email,
    admin_requests.display_name,
    admin_requests.reason,
    admin_requests.status,
    admin_requests.reviewed_by,
    admin_requests.reviewed_at,
    admin_requests.created_at
  from public.admin_requests
  order by
    case admin_requests.status when 'pending' then 0 else 1 end,
    admin_requests.created_at desc;
end;
$$;

grant execute on function public.list_admin_requests() to authenticated;

create or replace function public.review_admin_request(
  p_request_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_user_id uuid;
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  if not exists (
    select 1 from public.admins
    where admins.user_id = current_user_id
  ) then
    raise exception 'Admin access required.';
  end if;

  select user_id into target_user_id
  from public.admin_requests
  where id = p_request_id;

  if target_user_id is null then
    raise exception 'Request not found.';
  end if;

  update public.admin_requests
  set
    status = p_decision,
    reviewed_by = current_user_id,
    reviewed_at = now()
  where id = p_request_id;

  if p_decision = 'approved' then
    insert into public.admins (user_id)
    values (target_user_id)
    on conflict (user_id) do nothing;
  end if;
end;
$$;

grant execute on function public.review_admin_request(uuid, text) to authenticated;

drop trigger if exists grant_seed_admin_on_auth_user on auth.users;
drop function if exists public.grant_seed_admin();
