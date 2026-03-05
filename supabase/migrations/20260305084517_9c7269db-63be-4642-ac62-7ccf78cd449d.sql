
-- Tables already created by previous partial migration, so use IF NOT EXISTS
create table if not exists public.queue_merge_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  display_color text default '#ea580c',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.queue_merge_group_stages (
  id uuid primary key default gen_random_uuid(),
  merge_group_id uuid references public.queue_merge_groups(id) on delete cascade not null,
  production_stage_id uuid references public.production_stages(id) on delete cascade not null,
  unique (merge_group_id, production_stage_id)
);

-- RLS (may already be enabled)
alter table public.queue_merge_groups enable row level security;
alter table public.queue_merge_group_stages enable row level security;

-- Drop policies if they exist from partial migration, then recreate
drop policy if exists "Authenticated users can view merge groups" on public.queue_merge_groups;
drop policy if exists "Authenticated users can view merge group stages" on public.queue_merge_group_stages;
drop policy if exists "Admins can manage merge groups" on public.queue_merge_groups;
drop policy if exists "Admins can manage merge group stages" on public.queue_merge_group_stages;

-- SELECT for all authenticated
create policy "Authenticated users can view merge groups"
  on public.queue_merge_groups for select to authenticated using (true);

create policy "Authenticated users can view merge group stages"
  on public.queue_merge_group_stages for select to authenticated using (true);

-- Admin INSERT/UPDATE/DELETE using is_admin()
create policy "Admins can manage merge groups"
  on public.queue_merge_groups for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can manage merge group stages"
  on public.queue_merge_group_stages for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Seed: Create "Trimming" merge group with Book Cutting, Final Trimming, Pre Trim
do $$
declare
  v_group_id uuid;
  v_stage_id uuid;
begin
  -- Only seed if no groups exist yet
  if not exists (select 1 from public.queue_merge_groups where name = 'Trimming') then
    insert into public.queue_merge_groups (name, display_color)
    values ('Trimming', '#ea580c')
    returning id into v_group_id;

    for v_stage_id in
      select id from public.production_stages
      where lower(name) in ('book cutting', 'final trimming', 'pre trim')
    loop
      insert into public.queue_merge_group_stages (merge_group_id, production_stage_id)
      values (v_group_id, v_stage_id);
    end loop;
  end if;
end $$;

notify pgrst, 'reload schema';
