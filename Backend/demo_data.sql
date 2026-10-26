-- Demo data for a development/test Supabase project only.
-- Run after the backend migrations and Backend/seed.sql.
-- This script adds records once; it never deletes or overwrites existing business data.

begin;

create table if not exists public.demo_seed_runs (
    seed_key text primary key,
    applied_at timestamptz not null default now()
);

create table if not exists public.demo_seed_sales (
    sale_id bigint primary key references public.sales(id) on delete cascade,
    seed_key text not null references public.demo_seed_runs(seed_key),
    created_at timestamptz not null
);

alter table public.demo_seed_runs disable row level security;
alter table public.demo_seed_sales disable row level security;
revoke all on public.demo_seed_runs, public.demo_seed_sales from anon, authenticated;

do $demo$
declare
    v_purchase record;
    v_menu record;
    v_recipe record;
    v_ingredient_id bigint;
    v_supplier_id bigint;
    v_menu_id bigint;
    v_sale_id bigint;
    v_sale_at timestamptz;
    v_sale_quantity integer;
    v_payment_method text;
    v_sale_total numeric(15,2);
    v_platform_fee numeric(15,2);
    v_stock_qty numeric(12,2);
    v_unit_price numeric(15,2);
    v_required_qty numeric(12,2);
    v_sale_count integer;
    v_index integer;
begin
    if exists (
        select 1 from public.demo_seed_runs where seed_key = 'pizza-craft-demo-v1'
    ) then
        raise notice 'Pizza Craft demo data v1 sudah pernah ditambahkan; tidak ada data yang diubah.';
        return;
    end if;

    if to_regclass('public.inventory_batches') is null
       or to_regclass('public.supplier_ingredients') is null
       or to_regclass('public.menu_recipes') is null
       or to_regclass('public.operating_expenses') is null
       or to_regclass('public.sale_items') is null then
        raise exception 'Migrasi belum lengkap. Jalankan migrasi backend sesuai urutan README sebelum demo_data.sql.';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'menu_items'
          and column_name = 'is_available'
    ) or not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'inventory_logs'
          and column_name = 'movement_reason'
    ) or to_regprocedure('public.apply_inventory_batch_tracking()') is null then
        raise exception 'Migrasi ketersediaan menu, food waste, dan batch FIFO harus dijalankan sebelum demo_data.sql.';
    end if;

    insert into public.demo_seed_runs (seed_key)
    values ('pizza-craft-demo-v1');

    insert into public.categories (name)
    values
        ('Adonan & Tepung'),
        ('Keju & Olahan Susu'),
        ('Saus & Bumbu'),
        ('Daging & Topping'),
        ('Sayur & Pelengkap')
    on conflict (name) do nothing;

    insert into public.suppliers (name, phone, address)
    values
        ('PT Bogasari Distributor Semarang', '081200000101', 'Semarang'),
        ('PT Keju Indonesia', '081200000102', 'Semarang'),
        ('PT Saus Prima', '081200000103', 'Kendal'),
        ('CV Daging Segar', '081200000104', 'Semarang'),
        ('CV Pangan Makmur', '081200000105', 'Ungaran')
    on conflict (name) do nothing;

    insert into public.ingredients (category_id, name, stock_qty, unit, min_stock, unit_price)
    select category.id, ingredient.name, 0, ingredient.unit, ingredient.min_stock, ingredient.unit_price
    from (values
        ('Daging & Topping', 'Daging Ayam Fillet', 'Kg', 4::numeric, 82000::numeric),
        ('Sayur & Pelengkap', 'Bawang Bombay', 'Kg', 2::numeric, 32000::numeric),
        ('Sayur & Pelengkap', 'Jamur Champignon', 'Kg', 1.5::numeric, 58000::numeric),
        ('Sayur & Pelengkap', 'Paprika Campur', 'Kg', 1::numeric, 65000::numeric),
        ('Daging & Topping', 'Sosis Sapi', 'Kg', 2::numeric, 76000::numeric),
        ('Daging & Topping', 'Tuna Kaleng', 'Kg', 1::numeric, 90000::numeric),
        ('Saus & Bumbu', 'Saus BBQ', 'Liter', 1::numeric, 42000::numeric),
        ('Sayur & Pelengkap', 'Daun Basil Segar', 'Kg', 1::numeric, 110000::numeric),
        ('Adonan & Tepung', 'Ragi Instan', 'Kg', 0.5::numeric, 85000::numeric),
        ('Saus & Bumbu', 'Cabai Bubuk', 'Kg', 0.5::numeric, 95000::numeric)
    ) as ingredient(category_name, name, unit, min_stock, unit_price)
    join public.categories as category on category.name = ingredient.category_name
    on conflict (name) do nothing;

    insert into public.menu_items (name, selling_price, is_available)
    values
        ('Pizza Ayam BBQ', 98000, true),
        ('Pizza Keju Jamur', 92000, true),
        ('Pizza Sosis Smoked Beef', 105000, true),
        ('Pizza Tuna Melt', 102000, true),
        ('Pizza Sambal Matah', 99000, true)
    on conflict (name) do nothing;

    insert into public.supplier_ingredients (ingredient_id, supplier_id, fixed_unit_price)
    select ingredient.id, supplier.id, catalog.fixed_unit_price
    from (values
        ('Tepung Terigu Protein Tinggi', 'PT Bogasari Distributor Semarang', 11800::numeric),
        ('Keju Mozzarella Shredded', 'PT Keju Indonesia', 98000::numeric),
        ('Saus Tomat Pizza Base', 'PT Saus Prima', 37000::numeric),
        ('Pepperoni Sapi Iris', 'CV Daging Segar', 150000::numeric),
        ('Daging Ayam Fillet', 'CV Pangan Makmur', 82000::numeric),
        ('Bawang Bombay', 'CV Pangan Makmur', 32000::numeric),
        ('Jamur Champignon', 'CV Pangan Makmur', 58000::numeric),
        ('Paprika Campur', 'CV Pangan Makmur', 65000::numeric),
        ('Sosis Sapi', 'CV Daging Segar', 76000::numeric),
        ('Tuna Kaleng', 'CV Pangan Makmur', 90000::numeric),
        ('Saus BBQ', 'PT Saus Prima', 42000::numeric),
        ('Daun Basil Segar', 'CV Pangan Makmur', 110000::numeric),
        ('Ragi Instan', 'PT Bogasari Distributor Semarang', 85000::numeric),
        ('Cabai Bubuk', 'PT Saus Prima', 95000::numeric)
    ) as catalog(ingredient_name, supplier_name, fixed_unit_price)
    join public.ingredients as ingredient on ingredient.name = catalog.ingredient_name
    join public.suppliers as supplier on supplier.name = catalog.supplier_name
    on conflict (ingredient_id, supplier_id) do nothing;

    insert into public.menu_recipes (menu_item_id, ingredient_id, qty_per_menu)
    select menu.id, ingredient.id, recipe.qty_per_menu
    from (values
        ('Pizza Ayam BBQ', 'Tepung Terigu Protein Tinggi', 0.25::numeric),
        ('Pizza Ayam BBQ', 'Keju Mozzarella Shredded', 0.12::numeric),
        ('Pizza Ayam BBQ', 'Saus Tomat Pizza Base', 0.10::numeric),
        ('Pizza Ayam BBQ', 'Daging Ayam Fillet', 0.10::numeric),
        ('Pizza Ayam BBQ', 'Saus BBQ', 0.06::numeric),
        ('Pizza Keju Jamur', 'Tepung Terigu Protein Tinggi', 0.28::numeric),
        ('Pizza Keju Jamur', 'Keju Mozzarella Shredded', 0.22::numeric),
        ('Pizza Keju Jamur', 'Saus Tomat Pizza Base', 0.10::numeric),
        ('Pizza Keju Jamur', 'Jamur Champignon', 0.08::numeric),
        ('Pizza Keju Jamur', 'Bawang Bombay', 0.03::numeric),
        ('Pizza Sosis Smoked Beef', 'Tepung Terigu Protein Tinggi', 0.30::numeric),
        ('Pizza Sosis Smoked Beef', 'Keju Mozzarella Shredded', 0.16::numeric),
        ('Pizza Sosis Smoked Beef', 'Saus Tomat Pizza Base', 0.12::numeric),
        ('Pizza Sosis Smoked Beef', 'Sosis Sapi', 0.10::numeric),
        ('Pizza Sosis Smoked Beef', 'Bawang Bombay', 0.03::numeric),
        ('Pizza Tuna Melt', 'Tepung Terigu Protein Tinggi', 0.28::numeric),
        ('Pizza Tuna Melt', 'Keju Mozzarella Shredded', 0.16::numeric),
        ('Pizza Tuna Melt', 'Saus Tomat Pizza Base', 0.10::numeric),
        ('Pizza Tuna Melt', 'Tuna Kaleng', 0.08::numeric),
        ('Pizza Tuna Melt', 'Bawang Bombay', 0.03::numeric),
        ('Pizza Sambal Matah', 'Tepung Terigu Protein Tinggi', 0.25::numeric),
        ('Pizza Sambal Matah', 'Keju Mozzarella Shredded', 0.12::numeric),
        ('Pizza Sambal Matah', 'Pepperoni Sapi Iris', 0.08::numeric),
        ('Pizza Sambal Matah', 'Bawang Bombay', 0.05::numeric),
        ('Pizza Sambal Matah', 'Paprika Campur', 0.03::numeric),
        ('Pizza Sambal Matah', 'Cabai Bubuk', 0.015::numeric)
    ) as recipe(menu_name, ingredient_name, qty_per_menu)
    join public.menu_items as menu on menu.name = recipe.menu_name
    join public.ingredients as ingredient on ingredient.name = recipe.ingredient_name
    on conflict (menu_item_id, ingredient_id) do nothing;

    select count(*)
    into v_sale_count
    from public.menu_items as menu
    where menu.is_available
      and exists (
          select 1 from public.menu_recipes as recipe
          where recipe.menu_item_id = menu.id
      );

    if v_sale_count < 2 then
        raise exception 'Minimal dua menu tersedia dengan resep diperlukan untuk membuat data penjualan demo.';
    end if;

    for v_purchase in
        select ingredient.id as ingredient_id,
               supplier.id as supplier_id,
               purchase.qty,
               item.unit_price,
               rounds.round_no,
               purchase.expiry_days,
               row_number() over (order by ingredient.id)::integer as ingredient_order
        from (values
            ('Tepung Terigu Protein Tinggi', 'PT Bogasari Distributor Semarang', 120::numeric, 11800::numeric),
            ('Keju Mozzarella Shredded', 'PT Keju Indonesia', 75::numeric, 98000::numeric),
            ('Saus Tomat Pizza Base', 'PT Saus Prima', 60::numeric, 37000::numeric),
            ('Pepperoni Sapi Iris', 'CV Daging Segar', 30::numeric, 150000::numeric),
            ('Daging Ayam Fillet', 'CV Pangan Makmur', 35::numeric, 82000::numeric),
            ('Bawang Bombay', 'CV Pangan Makmur', 20::numeric, 32000::numeric),
            ('Jamur Champignon', 'CV Pangan Makmur', 15::numeric, 58000::numeric),
            ('Paprika Campur', 'CV Pangan Makmur', 15::numeric, 65000::numeric),
            ('Sosis Sapi', 'CV Daging Segar', 25::numeric, 76000::numeric),
            ('Tuna Kaleng', 'CV Pangan Makmur', 12::numeric, 90000::numeric),
            ('Saus BBQ', 'PT Saus Prima', 20::numeric, 42000::numeric),
            ('Daun Basil Segar', 'CV Pangan Makmur', 0.6::numeric, 110000::numeric),
            ('Ragi Instan', 'PT Bogasari Distributor Semarang', 3::numeric, 85000::numeric),
            ('Cabai Bubuk', 'PT Saus Prima', 0.8::numeric, 95000::numeric)
        ) as item(ingredient_name, supplier_name, total_qty, unit_price)
        cross join generate_series(1, 3) as rounds(round_no)
        join public.ingredients as ingredient on ingredient.name = item.ingredient_name
        join public.suppliers as supplier on supplier.name = item.supplier_name
        cross join lateral (
            select case
                when item.ingredient_name = 'Daun Basil Segar' then
                    case rounds.round_no when 1 then 0.1::numeric when 2 then 0.1::numeric else 0.4::numeric end
                else round(item.total_qty / 3, 2)
            end as qty,
            case
                when item.ingredient_name = 'Daun Basil Segar' and rounds.round_no = 3 then 92
                else 180
            end as expiry_days
        ) as purchase
    loop
        insert into public.inventory_logs (
            ingredient_id, supplier_id, type, qty, unit_price_at_time,
            payment_method, paid_at, notes, created_at, batch_number, expiry_date, unit_cost
        )
        values (
            v_purchase.ingredient_id,
            v_purchase.supplier_id,
            'IN',
            v_purchase.qty,
            v_purchase.unit_price,
            case when (v_purchase.round_no + v_purchase.ingredient_order) % 3 = 0
                then 'CREDIT' else 'CASH' end,
            case
                when (v_purchase.round_no + v_purchase.ingredient_order) % 3 <> 0
                    then now() - make_interval(days => 120 - (v_purchase.round_no - 1) * 15)
                when (v_purchase.round_no + v_purchase.ingredient_order) % 4 = 0
                    then null
                else now() - make_interval(days => 110 - (v_purchase.round_no - 1) * 15)
            end,
            '[DEMO] Pembelian stok periode ' || v_purchase.round_no,
            now() - make_interval(days => 120 - (v_purchase.round_no - 1) * 15),
            'DEMO-' || v_purchase.ingredient_id || '-' || v_purchase.round_no,
            current_date - (120 - (v_purchase.round_no - 1) * 15) + v_purchase.expiry_days,
            v_purchase.unit_price
        );

        select ingredient.stock_qty, ingredient.unit_price
        into v_stock_qty, v_unit_price
        from public.ingredients as ingredient
        where ingredient.id = v_purchase.ingredient_id
        for update;

        update public.ingredients
        set stock_qty = v_stock_qty + v_purchase.qty,
            unit_price = case
                when v_stock_qty + v_purchase.qty = 0 then v_purchase.unit_price
                else round(
                    ((v_stock_qty * v_unit_price) + (v_purchase.qty * v_purchase.unit_price))
                    / (v_stock_qty + v_purchase.qty),
                    2
                )
            end
        where id = v_purchase.ingredient_id;
    end loop;

    for v_index in 0..89 loop
        select menu.id, menu.name, menu.selling_price
        into v_menu
        from public.menu_items as menu
        where menu.is_available
          and exists (
              select 1 from public.menu_recipes as recipe
              where recipe.menu_item_id = menu.id
          )
        order by menu.id
        offset (v_index % v_sale_count)
        limit 1;

        v_sale_quantity := 1 + (v_index % 3);
        v_payment_method := case v_index % 4
            when 0 then 'CASH'
            when 1 then 'QRIS'
            when 2 then 'GOFOOD'
            else 'GRABFOOD'
        end;
        v_sale_at := now() - make_interval(days => 89 - v_index, hours => v_index % 10);
        v_sale_total := v_menu.selling_price * v_sale_quantity;
        v_platform_fee := case
            when v_payment_method in ('GOFOOD', 'GRABFOOD') then round(v_sale_total * 0.20, 2)
            else 0
        end;

        insert into public.sales (total_amount, payment_method, platform_fee, created_at)
        values (v_sale_total, v_payment_method, v_platform_fee, v_sale_at)
        returning id into v_sale_id;

        insert into public.demo_seed_sales (sale_id, seed_key, created_at)
        values (v_sale_id, 'pizza-craft-demo-v1', v_sale_at);

        insert into public.sale_items (sale_id, menu_item_id, menu_name_at_time, quantity, unit_price)
        values (v_sale_id, v_menu.id, v_menu.name, v_sale_quantity, v_menu.selling_price);

        for v_recipe in
            select recipe.ingredient_id,
                   recipe.qty_per_menu * v_sale_quantity as required_qty,
                   ingredient.unit_price
            from public.menu_recipes as recipe
            join public.ingredients as ingredient on ingredient.id = recipe.ingredient_id
            where recipe.menu_item_id = v_menu.id
        loop
            insert into public.inventory_logs (
                ingredient_id, menu_item_id, type, qty, unit_price_at_time, notes, created_at
            )
            values (
                v_recipe.ingredient_id,
                v_menu.id,
                'OUT',
                v_recipe.required_qty,
                v_recipe.unit_price,
                '[DEMO] Penjualan #' || v_sale_id,
                v_sale_at
            );

            update public.ingredients
            set stock_qty = stock_qty - v_recipe.required_qty
            where id = v_recipe.ingredient_id
              and stock_qty >= v_recipe.required_qty;

            if not found then
                raise exception 'Stok demo tidak cukup untuk bahan ID %; transaksi dibatalkan.',
                    v_recipe.ingredient_id;
            end if;
        end loop;
    end loop;

    for v_index in 1..36 loop
        v_sale_at := now() - make_interval(days => (v_index * 11) % 120, hours => v_index % 8);
        v_payment_method := case when v_index % 4 = 0 then 'CREDIT' else 'CASH' end;
        insert into public.operating_expenses (
            description, category, amount, payment_method, paid_at, created_at
        )
        values (
            '[DEMO] ' || case v_index % 8
                when 0 then 'Tagihan listrik dapur'
                when 1 then 'Pembelian kemasan pizza'
                when 2 then 'Biaya promosi media sosial'
                when 3 then 'Transportasi pengiriman bahan'
                when 4 then 'Tagihan internet'
                when 5 then 'Perawatan oven'
                when 6 then 'Kebersihan area produksi'
                else 'Sewa ruang produksi'
            end,
            case v_index % 8
                when 0 then 'Listrik & Air'
                when 1 then 'Kemasan'
                when 2 then 'Pemasaran'
                when 3 then 'Transportasi'
                when 4 then 'Internet'
                when 5 then 'Perawatan'
                when 6 then 'Kebersihan'
                else 'Sewa'
            end,
            125000 + ((v_index * 47300) % 875000),
            v_payment_method,
            case
                when v_payment_method = 'CASH' then v_sale_at
                when v_index % 8 = 0 then null
                else v_sale_at + interval '5 days'
            end,
            v_sale_at
        );
    end loop;

    for v_purchase in
        select ingredient.id as ingredient_id, ingredient.unit_price,
               sample.qty, sample.reason, sample.days_ago
        from (values
            ('Daun Basil Segar', 0.05::numeric, 'FOOD_WASTE_EXPIRED', 2),
            ('Jamur Champignon', 0.15::numeric, 'FOOD_WASTE_EXPIRED', 5),
            ('Tepung Terigu Protein Tinggi', 0.25::numeric, 'FOOD_WASTE_DOUGH_FAILED', 8),
            ('Keju Mozzarella Shredded', 0.10::numeric, 'FOOD_WASTE_DROPPED', 12),
            ('Daging Ayam Fillet', 0.10::numeric, 'FOOD_WASTE_EXPIRED', 17),
            ('Sosis Sapi', 0.10::numeric, 'FOOD_WASTE_DROPPED', 22)
        ) as sample(ingredient_name, qty, reason, days_ago)
        join public.ingredients as ingredient on ingredient.name = sample.ingredient_name
    loop
        insert into public.inventory_logs (
            ingredient_id, type, qty, unit_price_at_time, notes, movement_reason, created_at
        )
        values (
            v_purchase.ingredient_id, 'OUT', v_purchase.qty, v_purchase.unit_price,
            '[DEMO] Simulasi pencatatan food waste',
            v_purchase.reason,
            now() - make_interval(days => v_purchase.days_ago)
        );

        update public.ingredients
        set stock_qty = stock_qty - v_purchase.qty
        where id = v_purchase.ingredient_id
          and stock_qty >= v_purchase.qty;

        if not found then
            raise exception 'Stok demo tidak cukup untuk simulasi food waste bahan ID %.',
                v_purchase.ingredient_id;
        end if;
    end loop;

    select ingredient.id, ingredient.unit_price, ingredient.stock_qty
    into v_ingredient_id, v_unit_price, v_stock_qty
    from public.ingredients as ingredient
    where ingredient.name = 'Daun Basil Segar'
    for update;

    insert into public.inventory_logs (
        ingredient_id, type, qty, unit_price_at_time, notes, movement_reason, created_at
    )
    values (
        v_ingredient_id, 'IN', 0.05, v_unit_price,
        '[DEMO] Simulasi stok opname: selisih lebih',
        'STOCKTAKE_GAIN',
        now() - interval '3 days'
    );

    update public.ingredients
    set stock_qty = v_stock_qty + 0.05
    where id = v_ingredient_id;

    select ingredient.id, ingredient.unit_price, ingredient.stock_qty
    into v_ingredient_id, v_unit_price, v_stock_qty
    from public.ingredients as ingredient
    where ingredient.name = 'Tepung Terigu Protein Tinggi'
    for update;

    v_required_qty := least(0.20, v_stock_qty);
    if v_required_qty > 0 then
        insert into public.inventory_logs (
            ingredient_id, type, qty, unit_price_at_time, notes, movement_reason, created_at
        )
        values (
            v_ingredient_id, 'OUT', v_required_qty, v_unit_price,
            '[DEMO] Simulasi stok opname: selisih kurang',
            'STOCKTAKE_LOSS',
            now() - interval '1 day'
        );

        update public.ingredients
        set stock_qty = stock_qty - v_required_qty
        where id = v_ingredient_id;
    end if;

    for v_purchase in
        select ingredient.id as ingredient_id,
               supplier.id as supplier_id,
               case
                   when item.ingredient_name = 'Daun Basil Segar' then 0.2::numeric
                   else round(item.total_qty * 0.12, 2)
               end as qty,
               item.unit_price,
               row_number() over (order by ingredient.id)::integer as ingredient_order,
               item.ingredient_name
        from (values
            ('Tepung Terigu Protein Tinggi', 'PT Bogasari Distributor Semarang', 120::numeric, 11800::numeric),
            ('Keju Mozzarella Shredded', 'PT Keju Indonesia', 75::numeric, 98000::numeric),
            ('Saus Tomat Pizza Base', 'PT Saus Prima', 60::numeric, 37000::numeric),
            ('Pepperoni Sapi Iris', 'CV Daging Segar', 30::numeric, 150000::numeric),
            ('Daging Ayam Fillet', 'CV Pangan Makmur', 35::numeric, 82000::numeric),
            ('Bawang Bombay', 'CV Pangan Makmur', 20::numeric, 32000::numeric),
            ('Jamur Champignon', 'CV Pangan Makmur', 15::numeric, 58000::numeric),
            ('Paprika Campur', 'CV Pangan Makmur', 15::numeric, 65000::numeric),
            ('Sosis Sapi', 'CV Daging Segar', 25::numeric, 76000::numeric),
            ('Tuna Kaleng', 'CV Pangan Makmur', 12::numeric, 90000::numeric),
            ('Saus BBQ', 'PT Saus Prima', 20::numeric, 42000::numeric),
            ('Daun Basil Segar', 'CV Pangan Makmur', 0.6::numeric, 110000::numeric),
            ('Ragi Instan', 'PT Bogasari Distributor Semarang', 3::numeric, 85000::numeric),
            ('Cabai Bubuk', 'PT Saus Prima', 0.8::numeric, 95000::numeric)
        ) as item(ingredient_name, supplier_name, total_qty, unit_price)
        join public.ingredients as ingredient on ingredient.name = item.ingredient_name
        join public.suppliers as supplier on supplier.name = item.supplier_name
    loop
        insert into public.inventory_logs (
            ingredient_id, supplier_id, type, qty, unit_price_at_time,
            payment_method, paid_at, notes, created_at, batch_number, expiry_date, unit_cost
        )
        values (
            v_purchase.ingredient_id,
            v_purchase.supplier_id,
            'IN',
            v_purchase.qty,
            v_purchase.unit_price,
            case when v_purchase.ingredient_order % 2 = 0 then 'CREDIT' else 'CASH' end,
            case
                when v_purchase.ingredient_order % 2 <> 0 then now()
                when v_purchase.ingredient_order % 4 = 0 then null
                else now()
            end,
            '[DEMO] Pembelian stok berjalan',
            now(),
            'DEMO-CURRENT-' || v_purchase.ingredient_id,
            current_date + case
                when v_purchase.ingredient_name = 'Daun Basil Segar' then 2 else 180
            end,
            v_purchase.unit_price
        );

        select ingredient.stock_qty, ingredient.unit_price
        into v_stock_qty, v_unit_price
        from public.ingredients as ingredient
        where ingredient.id = v_purchase.ingredient_id
        for update;

        update public.ingredients
        set stock_qty = v_stock_qty + v_purchase.qty,
            unit_price = round(
                ((v_stock_qty * v_unit_price) + (v_purchase.qty * v_purchase.unit_price))
                / (v_stock_qty + v_purchase.qty),
                2
            )
        where id = v_purchase.ingredient_id;
    end loop;
end;
$demo$;

notify pgrst, 'reload schema';

commit;
