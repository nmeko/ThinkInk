-- ThinkInk shared hubs. Run once in Supabase: SQL Editor → New query → paste → Run.
-- Notes are encrypted in the browser before upload; the key lives only in invite links
-- (after the #, which browsers never send to a server), so Supabase stores only ciphertext.

create table if not exists public.hubs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  locked boolean not null default false,          -- owner can stop new members joining
  created_at timestamptz not null default now()
);

create table if not exists public.hub_members (
  hub_id uuid not null references public.hubs on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (hub_id, user_id)
);

create table if not exists public.hub_posts (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references public.hubs on delete cascade,
  author uuid not null default auth.uid() references auth.users on delete cascade,
  iv text not null check (length(iv) <= 32),
  body text not null check (length(body) <= 1500000), -- encrypted note, about 1 MB max
  created_at timestamptz not null default now()
);
create index if not exists hub_posts_hub_time on public.hub_posts (hub_id, created_at);

-- Helpers run as the table owner so policies can check membership without recursion.
create or replace function public.is_hub_member(h uuid) returns boolean
  language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.hub_members where hub_id = h and user_id = auth.uid()) $$;

create or replace function public.hub_open(h uuid) returns boolean
  language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.hubs where id = h and not locked) $$;

create or replace function public.is_hub_owner(h uuid) returns boolean
  language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.hubs where id = h and owner = auth.uid()) $$;

revoke execute on function public.is_hub_member(uuid), public.hub_open(uuid), public.is_hub_owner(uuid) from public, anon;
grant execute on function public.is_hub_member(uuid), public.hub_open(uuid), public.is_hub_owner(uuid) to authenticated;

-- New tables aren't exposed automatically: only signed-in (anonymous-account) members get table access,
-- and the row-level policies below decide which rows. Visitors who aren't signed in get nothing.
revoke all on public.hubs, public.hub_members, public.hub_posts from anon;
grant select, insert, update, delete on public.hubs to authenticated;
grant select, insert, delete on public.hub_members to authenticated;
grant select, insert, delete on public.hub_posts to authenticated;

alter table public.hubs enable row level security;
alter table public.hub_members enable row level security;
alter table public.hub_posts enable row level security;

drop policy if exists "create own hub" on public.hubs;
create policy "create own hub" on public.hubs for insert to authenticated with check (owner = auth.uid());
drop policy if exists "members see hub" on public.hubs;
create policy "members see hub" on public.hubs for select to authenticated using (owner = auth.uid() or public.is_hub_member(id));
drop policy if exists "owner updates hub" on public.hubs;
create policy "owner updates hub" on public.hubs for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "owner deletes hub" on public.hubs;
create policy "owner deletes hub" on public.hubs for delete to authenticated using (owner = auth.uid());

drop policy if exists "join open hub" on public.hub_members;
create policy "join open hub" on public.hub_members for insert to authenticated
  with check (user_id = auth.uid() and (public.hub_open(hub_id) or public.is_hub_owner(hub_id)));
drop policy if exists "members see members" on public.hub_members;
-- Your own membership row is always visible, so a join can confirm itself in the same request.
create policy "members see members" on public.hub_members for select to authenticated using (user_id = auth.uid() or public.is_hub_member(hub_id));
drop policy if exists "leave or remove" on public.hub_members;
create policy "leave or remove" on public.hub_members for delete to authenticated
  using (user_id = auth.uid() or public.is_hub_owner(hub_id));

drop policy if exists "members read posts" on public.hub_posts;
create policy "members read posts" on public.hub_posts for select to authenticated using (public.is_hub_member(hub_id));
drop policy if exists "members post" on public.hub_posts;
create policy "members post" on public.hub_posts for insert to authenticated
  with check (author = auth.uid() and public.is_hub_member(hub_id));
drop policy if exists "authors or owner delete posts" on public.hub_posts;
create policy "authors or owner delete posts" on public.hub_posts for delete to authenticated
  using (author = auth.uid() or public.is_hub_owner(hub_id));

-- Live updates for new posts (still filtered by the policies above).
do $$ begin
  alter publication supabase_realtime add table public.hub_posts;
exception when duplicate_object then null; end $$;
