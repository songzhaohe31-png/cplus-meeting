-- 在 Supabase → SQL Editor 里整段粘贴执行（Run）

create table if not exists public.bookings (
  id text primary key,
  room_id text not null,
  date text not null,
  start_time text not null,
  end_time text not null,
  attendees int not null default 1,
  created_at bigint
);

alter table public.bookings enable row level security;

-- 允许扫码用户读写预约（anon key）
drop policy if exists "bookings_select" on public.bookings;
drop policy if exists "bookings_insert" on public.bookings;
drop policy if exists "bookings_update" on public.bookings;
drop policy if exists "bookings_delete" on public.bookings;

create policy "bookings_select" on public.bookings for select using (true);
create policy "bookings_insert" on public.bookings for insert with check (true);
create policy "bookings_update" on public.bookings for update using (true);
create policy "bookings_delete" on public.bookings for delete using (true);
