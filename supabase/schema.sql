-- Iron Ridge Hauling Services — Supabase setup
-- Run this whole file once in Supabase: SQL Editor > New query > paste > Run.

-- 1. Main table: every quote request, which later becomes a job
create table if not exists public.requests (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),

  -- filled in by the customer on the quote form
  name             text not null check (char_length(name) between 1 and 120),
  phone            text not null check (char_length(phone) between 7 and 30),
  email            text check (email is null or char_length(email) <= 200),
  service          text not null check (service in ('junk_removal','moving','both')),
  area             text not null check (area in ('nova','blacksburg')),
  preferred_date   date,
  pickup_address   text not null check (char_length(pickup_address) <= 300),
  dropoff_address  text check (dropoff_address is null or char_length(dropoff_address) <= 300),
  items            text not null check (char_length(items) <= 3000),
  access_notes     text check (access_notes is null or char_length(access_notes) <= 2000),
  referral_source  text,
  referral_code    text check (referral_code is null or char_length(referral_code) <= 50),
  photo_paths      text[] not null default '{}' check (cardinality(photo_paths) <= 6),

  -- filled in by Tommy on the admin side
  status           text not null default 'new' check (status in ('new','quoted','booked','completed','lost')),
  quote_amount     numeric(10,2),
  final_price      numeric(10,2),
  expenses         numeric(10,2),
  job_date         date,
  on_time          boolean,
  paid             boolean not null default false,
  feedback_score   smallint check (feedback_score between 1 and 5),
  notes            text
);

-- 2. Who counts as an admin (Tommy). Add his user id after he signs up.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 3. Row Level Security: the public can ONLY create requests. Only admins can read or edit.
alter table public.requests enable row level security;
alter table public.admins   enable row level security;

drop policy if exists "public can submit requests" on public.requests;
create policy "public can submit requests" on public.requests
  for insert to anon, authenticated
  with check (status = 'new' and quote_amount is null and final_price is null and paid = false);

drop policy if exists "admins read requests" on public.requests;
create policy "admins read requests" on public.requests
  for select to authenticated using (public.is_admin());

drop policy if exists "admins update requests" on public.requests;
create policy "admins update requests" on public.requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete requests" on public.requests;
create policy "admins delete requests" on public.requests
  for delete to authenticated using (public.is_admin());

drop policy if exists "admins see admins" on public.admins;
create policy "admins see admins" on public.admins
  for select to authenticated using (public.is_admin());

-- 4. Photo storage: private bucket. Public can upload, only admins can view.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-photos', 'quote-photos', false, 8388608, array['image/jpeg','image/png','image/webp','image/heic','image/gif'])
on conflict (id) do nothing;

drop policy if exists "public can upload quote photos" on storage.objects;
create policy "public can upload quote photos" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'quote-photos');

drop policy if exists "admins can view quote photos" on storage.objects;
create policy "admins can view quote photos" on storage.objects
  for select to authenticated using (bucket_id = 'quote-photos' and public.is_admin());

-- 5. After Tommy's account exists (Authentication > Users > Add user), run:
-- insert into public.admins (user_id)
-- select id from auth.users where email = '[TOMMY_ADMIN_EMAIL]';
