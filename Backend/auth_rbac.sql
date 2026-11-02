-- Run after all existing Backend SQL scripts in the Supabase SQL Editor.
-- Existing operational rows are preserved; this migration only adds auth metadata and access policies.

revoke create on schema public from public, anon, authenticated;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text not null,
    role text not null default 'cashier'
        check (role in ('owner', 'admin', 'cashier')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select profile.role
    from public.profiles as profile
    where profile.id = (select auth.uid())
$$;

revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

drop policy if exists "profiles_select_self_or_owner" on public.profiles;
create policy "profiles_select_self_or_owner"
    on public.profiles
    for select
    to authenticated
    using (id = (select auth.uid()) or (select public.current_app_role()) = 'owner');

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, full_name, role)
    values (
        new.id,
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
            nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
            'Pengguna'
        ),
        'cashier'
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

insert into public.profiles (id, full_name, role)
select user_row.id,
       coalesce(
           nullif(trim(user_row.raw_user_meta_data ->> 'full_name'), ''),
           nullif(split_part(coalesce(user_row.email, ''), '@', 1), ''),
           'Pengguna'
       ),
       'cashier'
from auth.users as user_row
on conflict (id) do nothing;

do $$
declare
    table_name text;
    table_names text[] := array[
        'categories',
        'suppliers',
        'menu_items',
        'ingredients',
        'inventory_logs',
        'menu_recipes',
        'sales',
        'sale_items',
        'supplier_ingredients',
        'operating_expenses',
        'inventory_batches',
        'inventory_batch_consumptions'
    ];
    sequence_name text;
begin
    foreach table_name in array table_names loop
        if to_regclass(format('public.%I', table_name)) is null then
            continue;
        end if;

        execute format('alter table public.%I enable row level security', table_name);
        execute format('revoke all on public.%I from public, anon, authenticated', table_name);
        execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
        execute format('drop policy if exists "owner_admin_all" on public.%I', table_name);
        if table_name = 'inventory_logs' then
            execute format('drop policy if exists "owner_all_inventory_logs" on public.%I', table_name);
            execute format('drop policy if exists "staff_insert_inventory_logs" on public.%I', table_name);
            execute format(
                'create policy "owner_all_inventory_logs" on public.%I for all to authenticated using ((select public.current_app_role()) = ''owner'') with check ((select public.current_app_role()) = ''owner'')',
                table_name
            );
        elsif table_name = 'inventory_batch_consumptions' then
            execute format('drop policy if exists "owner_admin_all" on public.%I', table_name);
            execute format('drop policy if exists "owner_only_all" on public.%I', table_name);
            execute format(
                'create policy "owner_only_all" on public.%I for all to authenticated using ((select public.current_app_role()) = ''owner'') with check ((select public.current_app_role()) = ''owner'')',
                table_name
            );
        else
            execute format(
                'create policy "owner_admin_all" on public.%I for all to authenticated using ((select public.current_app_role()) in (''owner'', ''admin'')) with check ((select public.current_app_role()) in (''owner'', ''admin''))',
                table_name
            );
        end if;

        if table_name in ('menu_items', 'sales', 'sale_items') then
            execute format('drop policy if exists "cashier_read_pos" on public.%I', table_name);
            execute format(
                'create policy "cashier_read_pos" on public.%I for select to authenticated using ((select public.current_app_role()) = ''cashier'')',
                table_name
            );
        end if;

        sequence_name := null;
        if exists (
            select 1
            from pg_attribute
            where attrelid = to_regclass(format('public.%I', table_name))
              and attname = 'id'
              and attnum > 0
              and not attisdropped
        ) then
            sequence_name := pg_get_serial_sequence(format('public.%I', table_name), 'id');
        end if;
        if sequence_name is not null then
            execute format('grant usage, select on sequence %s to authenticated', sequence_name);
        end if;
    end loop;
end;
$$;

-- Cashiers can complete a sale only through the transaction that also checks and updates stock.
alter function public.create_sale(jsonb, text) security definer;
alter function public.create_sale(jsonb, text) set search_path = public, pg_temp;

do $$
begin
    if to_regprocedure('public.record_inventory_movement(bigint,text,numeric,bigint,bigint,text,text,text,date)') is not null
       and to_regprocedure('public.record_inventory_movement_internal(bigint,text,numeric,bigint,bigint,text,text,text,date)') is null then
        execute 'alter function public.record_inventory_movement(bigint,text,numeric,bigint,bigint,text,text,text,date) rename to record_inventory_movement_internal';
    end if;
    if to_regprocedure('public.record_food_waste(bigint,numeric,text)') is not null
       and to_regprocedure('public.record_food_waste_internal(bigint,numeric,text)') is null then
        execute 'alter function public.record_food_waste(bigint,numeric,text) rename to record_food_waste_internal';
    end if;
    if to_regprocedure('public.record_stocktake(jsonb)') is not null
       and to_regprocedure('public.record_stocktake_internal(jsonb)') is null then
        execute 'alter function public.record_stocktake(jsonb) rename to record_stocktake_internal';
    end if;
end;
$$;

create or replace function public.record_inventory_movement(
    p_ingredient_id bigint,
    p_type text,
    p_qty numeric,
    p_supplier_id bigint default null,
    p_menu_item_id bigint default null,
    p_payment_method text default null,
    p_reason text default null,
    p_batch_number text default null,
    p_expiry_date date default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
    if coalesce(public.current_app_role(), '') not in ('owner', 'admin') then
        raise exception 'Role akun tidak diizinkan mencatat mutasi stok.' using errcode = '42501';
    end if;
    return public.record_inventory_movement_internal(
        p_ingredient_id, p_type, p_qty, p_supplier_id, p_menu_item_id,
        p_payment_method, p_reason, p_batch_number, p_expiry_date
    );
end;
$$;

create or replace function public.record_food_waste(
    p_ingredient_id bigint,
    p_qty numeric,
    p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
    if coalesce(public.current_app_role(), '') not in ('owner', 'admin') then
        raise exception 'Role akun tidak diizinkan mencatat food waste.' using errcode = '42501';
    end if;
    return public.record_food_waste_internal(p_ingredient_id, p_qty, p_reason);
end;
$$;

create or replace function public.record_stocktake(p_counts jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
    if coalesce(public.current_app_role(), '') not in ('owner', 'admin') then
        raise exception 'Role akun tidak diizinkan melakukan stok opname.' using errcode = '42501';
    end if;
    return public.record_stocktake_internal(p_counts);
end;
$$;

revoke all on function public.record_inventory_movement_internal(
    bigint, text, numeric, bigint, bigint, text, text, text, date
) from public, anon, authenticated;
revoke all on function public.record_food_waste_internal(bigint, numeric, text)
    from public, anon, authenticated;
revoke all on function public.record_stocktake_internal(jsonb)
    from public, anon, authenticated;

do $$
declare
    function_row record;
begin
    for function_row in
        select proc.oid::regprocedure as signature
        from pg_proc as proc
        join pg_namespace as ns on ns.oid = proc.pronamespace
        where ns.nspname = 'public'
          and proc.proname in (
              'create_sale',
              'record_inventory_movement',
              'record_food_waste',
              'record_stocktake',
              'create_operating_expense',
              'settle_financial_payable'
          )
    loop
        execute format('revoke execute on function %s from public, anon', function_row.signature);
        execute format('grant execute on function %s to authenticated', function_row.signature);
    end loop;
end;
$$;

notify pgrst, 'reload schema';
