-- Run after point_of_sale.sql and before using the multi-payment cashier.

alter table sales
    add column if not exists payment_method text not null default 'CASH'
        check (payment_method in ('CASH', 'QRIS', 'GOFOOD', 'GRABFOOD')),
    add column if not exists platform_fee numeric(15,2) not null default 0
        check (platform_fee >= 0 and platform_fee <= total_amount);

drop function if exists public.create_sale(jsonb);
drop function if exists public.create_sale(jsonb, text);

create function public.create_sale(p_items jsonb, p_payment_method text)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_sale_id bigint;
    v_total numeric(15,2);
    v_platform_fee numeric(15,2);
    v_item record;
    v_recipe record;
    v_shortage record;
begin
    if p_payment_method is null or p_payment_method not in ('CASH', 'QRIS', 'GOFOOD', 'GRABFOOD') then
        raise exception 'Metode pembayaran tidak valid.';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' then
        raise exception 'Keranjang penjualan harus berupa daftar menu.';
    end if;
    if jsonb_array_length(p_items) = 0 then
        raise exception 'Keranjang penjualan tidak boleh kosong.';
    end if;

    if exists (
        select 1
        from jsonb_to_recordset(p_items) as item(menu_item_id bigint, quantity integer)
        where item.menu_item_id is null or item.quantity is null or item.quantity <= 0
    ) then
        raise exception 'Menu dan jumlah porsi harus valid.';
    end if;

    for v_item in
        select item.menu_item_id, item.quantity
        from jsonb_to_recordset(p_items) as item(menu_item_id bigint, quantity integer)
    loop
        if not exists (select 1 from menu_items where id = v_item.menu_item_id) then
            raise exception 'Menu dengan ID % tidak ditemukan.', v_item.menu_item_id;
        end if;
        if not exists (select 1 from menu_recipes where menu_item_id = v_item.menu_item_id) then
            raise exception 'Resep untuk menu ID % belum diatur.', v_item.menu_item_id;
        end if;
    end loop;

    perform ingredient.id
    from ingredients as ingredient
    join (
        select recipe.ingredient_id
        from jsonb_to_recordset(p_items) as item(menu_item_id bigint, quantity integer)
        join menu_recipes as recipe on recipe.menu_item_id = item.menu_item_id
        group by recipe.ingredient_id
    ) as required on required.ingredient_id = ingredient.id
    order by ingredient.id
    for update of ingredient;

    select ingredient.name,
           ingredient.stock_qty,
           sum(recipe.qty_per_menu * item.quantity) as required_qty
    into v_shortage
    from jsonb_to_recordset(p_items) as item(menu_item_id bigint, quantity integer)
    join menu_recipes as recipe on recipe.menu_item_id = item.menu_item_id
    join ingredients as ingredient on ingredient.id = recipe.ingredient_id
    group by ingredient.id, ingredient.name, ingredient.stock_qty
    having ingredient.stock_qty < sum(recipe.qty_per_menu * item.quantity)
    limit 1;

    if found then
        raise exception 'Stok bahan % tidak cukup (tersedia %, dibutuhkan %).',
            v_shortage.name, v_shortage.stock_qty, v_shortage.required_qty;
    end if;

    select coalesce(sum(menu.selling_price * item.quantity), 0)
    into v_total
    from jsonb_to_recordset(p_items) as item(menu_item_id bigint, quantity integer)
    join menu_items as menu on menu.id = item.menu_item_id;

    v_platform_fee := case
        when p_payment_method in ('GOFOOD', 'GRABFOOD') then round(v_total * 0.20, 2)
        else 0
    end;

    insert into sales (total_amount, payment_method, platform_fee)
    values (v_total, p_payment_method, v_platform_fee)
    returning id into v_sale_id;

    for v_item in
        select item.menu_item_id, item.quantity, menu.name, menu.selling_price
        from jsonb_to_recordset(p_items) as item(menu_item_id bigint, quantity integer)
        join menu_items as menu on menu.id = item.menu_item_id
    loop
        insert into sale_items (sale_id, menu_item_id, menu_name_at_time, quantity, unit_price)
        values (v_sale_id, v_item.menu_item_id, v_item.name, v_item.quantity, v_item.selling_price);

        for v_recipe in
            select recipe.ingredient_id,
                   recipe.qty_per_menu * v_item.quantity as used_qty,
                   ingredient.unit_price
            from menu_recipes as recipe
            join ingredients as ingredient on ingredient.id = recipe.ingredient_id
            where recipe.menu_item_id = v_item.menu_item_id
        loop
            insert into inventory_logs (
                ingredient_id, menu_item_id, type, qty, unit_price_at_time, notes
            )
            values (
                v_recipe.ingredient_id,
                v_item.menu_item_id,
                'OUT',
                v_recipe.used_qty,
                v_recipe.unit_price,
                'Penjualan #' || v_sale_id
            );
        end loop;
    end loop;

    update ingredients as ingredient
    set stock_qty = ingredient.stock_qty - required.required_qty
    from (
        select recipe.ingredient_id,
               sum(recipe.qty_per_menu * item.quantity) as required_qty
        from jsonb_to_recordset(p_items) as item(menu_item_id bigint, quantity integer)
        join menu_recipes as recipe on recipe.menu_item_id = item.menu_item_id
        group by recipe.ingredient_id
    ) as required
    where ingredient.id = required.ingredient_id;

    return v_sale_id;
end;
$$;

grant execute on function public.create_sale(jsonb, text) to anon, authenticated;
