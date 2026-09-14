-- Execute only after the new Supabase login has been tested.
begin;

-- Abort if the confirmed administrator memberships are missing.
do $$
begin
  if (select count(*) from public.dashboard_memberships
      where user_id = '57f03c48-5b43-4b2b-8ec6-0eb1fc1aa4ee'
        and role = 'admin'
        and department in ('supermercado', 'agropecuaria')) <> 2 then
    raise exception 'As duas permissoes do administrador precisam existir antes da ativacao.';
  end if;
end $$;

alter table public.indicators enable row level security;
alter table public.kv_store_bc8e9323 enable row level security;

revoke all on public.indicators, public.kv_store_bc8e9323 from anon;
grant select, insert, update on public.indicators, public.kv_store_bc8e9323 to authenticated;

-- Restrictive policies also constrain the pre-existing permissive policies.
-- Legacy user/password records are deliberately not accessible through this API.
create policy dashboard_kv_read_guard on public.kv_store_bc8e9323
as restrictive for select to public
using (exists (
  select 1 from public.dashboard_memberships m
  where m.user_id = (select auth.uid())
    and m.department = case key
      when 'painel_appdata' then 'supermercado'
      when 'painel_appdata_agro' then 'agropecuaria'
      else null end
));

create policy dashboard_kv_insert_guard on public.kv_store_bc8e9323
as restrictive for insert to public
with check (exists (
  select 1 from public.dashboard_memberships m
  where m.user_id = (select auth.uid()) and m.role in ('admin', 'editor')
    and m.department = case key
      when 'painel_appdata' then 'supermercado'
      when 'painel_appdata_agro' then 'agropecuaria'
      else null end
));

create policy dashboard_kv_update_guard on public.kv_store_bc8e9323
as restrictive for update to public
using (exists (
  select 1 from public.dashboard_memberships m
  where m.user_id = (select auth.uid()) and m.role in ('admin', 'editor')
    and m.department = case key
      when 'painel_appdata' then 'supermercado'
      when 'painel_appdata_agro' then 'agropecuaria'
      else null end
))
with check (exists (
  select 1 from public.dashboard_memberships m
  where m.user_id = (select auth.uid()) and m.role in ('admin', 'editor')
    and m.department = case key
      when 'painel_appdata' then 'supermercado'
      when 'painel_appdata_agro' then 'agropecuaria'
      else null end
));

create policy dashboard_indicators_read_guard on public.indicators
as restrictive for select to public
using (exists (
  select 1 from public.dashboard_memberships m
  where m.user_id = (select auth.uid())
    and m.department = case
      when store_id in ('L1', 'L2', 'L3') then 'supermercado'
      when store_id in ('AGRO_L1', 'AGRO_L2', 'AGRO_L3') then 'agropecuaria'
      else null end
));

create policy dashboard_indicators_insert_guard on public.indicators
as restrictive for insert to public
with check (exists (
  select 1 from public.dashboard_memberships m
  where m.user_id = (select auth.uid()) and m.role in ('admin', 'editor')
    and m.department = case
      when store_id in ('L1', 'L2', 'L3') then 'supermercado'
      when store_id in ('AGRO_L1', 'AGRO_L2', 'AGRO_L3') then 'agropecuaria'
      else null end
));

create policy dashboard_indicators_update_guard on public.indicators
as restrictive for update to public
using (exists (
  select 1 from public.dashboard_memberships m
  where m.user_id = (select auth.uid()) and m.role in ('admin', 'editor')
    and m.department = case
      when store_id in ('L1', 'L2', 'L3') then 'supermercado'
      when store_id in ('AGRO_L1', 'AGRO_L2', 'AGRO_L3') then 'agropecuaria'
      else null end
))
with check (exists (
  select 1 from public.dashboard_memberships m
  where m.user_id = (select auth.uid()) and m.role in ('admin', 'editor')
    and m.department = case
      when store_id in ('L1', 'L2', 'L3') then 'supermercado'
      when store_id in ('AGRO_L1', 'AGRO_L2', 'AGRO_L3') then 'agropecuaria'
      else null end
));

create policy dashboard_kv_no_delete on public.kv_store_bc8e9323
as restrictive for delete to public using (false);
create policy dashboard_indicators_no_delete on public.indicators
as restrictive for delete to public using (false);

commit;