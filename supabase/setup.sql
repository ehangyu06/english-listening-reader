-- English Listening Reader — Supabase 초기 설정
-- supabase.com → 프로젝트 → SQL Editor → New query → 이 파일 전체 붙여넣기 → Run

create table if not exists listening_lessons (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists listening_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists listening_files (
  kind text not null check (kind in ('images', 'audio')),
  id text not null,
  mime_type text,
  file_name text,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);

alter table listening_lessons enable row level security;
alter table listening_settings enable row level security;
alter table listening_files enable row level security;

drop policy if exists "listening lessons anon all" on listening_lessons;
create policy "listening lessons anon all"
  on listening_lessons for all
  to anon, authenticated
  using (true) with check (true);

drop policy if exists "listening settings anon all" on listening_settings;
create policy "listening settings anon all"
  on listening_settings for all
  to anon, authenticated
  using (true) with check (true);

drop policy if exists "listening files anon all" on listening_files;
create policy "listening files anon all"
  on listening_files for all
  to anon, authenticated
  using (true) with check (true);

grant all on listening_lessons to anon, authenticated;
grant all on listening_settings to anon, authenticated;
grant all on listening_files to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('listening-media', 'listening-media', false, 52428800)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit;

drop policy if exists "listening media anon read" on storage.objects;
drop policy if exists "listening media anon write" on storage.objects;
drop policy if exists "listening media anon update" on storage.objects;
drop policy if exists "listening media anon delete" on storage.objects;
drop policy if exists "listening media anon all" on storage.objects;

create policy "listening media anon read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'listening-media');

create policy "listening media anon write"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'listening-media');

create policy "listening media anon update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'listening-media')
  with check (bucket_id = 'listening-media');

create policy "listening media anon delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'listening-media');
