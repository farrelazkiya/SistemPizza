-- Run after point_of_sale.sql and financial_reports.sql in the Supabase SQL Editor.

create table if not exists supplier_ingredients (
    ingredient_id bigint not null references ingredients(id) on delete cascade,
    supplier_id bigint not null references suppliers(id) on delete cascade,
    fixed_unit_price numeric(15,2) not null check (fixed_unit_price >= 0),
    primary key (ingredient_id, supplier_id)
);

alter table supplier_ingredients disable row level security;
revoke all on supplier_ingredients from anon, authenticated;
grant select on supplier_ingredients to anon, authenticated;

alter table inventory_logs
    add column if not exists movement_reason text
        check (movement_reason is null or movement_reason = 'SPOILED');

insert into suppliers (name)
values
    ('CV Bumbu & Saus Nusantara'),
    ('CV Pangan Makmur'),
    ('PT Bogasari Distributor Semarang'),
    ('PT Keju Indonesia'),
    ('UD Dairy Sejahtera'),
    ('PT Saus Prima'),
    ('CV Rempah Rasa'),
    ('CV Daging Segar'),
    ('PT Protein Pangan')
on conflict (name) do nothing;

insert into supplier_ingredients (ingredient_id, supplier_id, fixed_unit_price)
select ingredient.id, supplier.id, ingredient.unit_price
from ingredients as ingredient
join suppliers as supplier on supplier.name = case ingredient.name
    when 'Tepung Terigu Protein Tinggi' then 'PT Tepung Nusantara'
    when 'Keju Mozzarella Shredded' then 'CV Susu Segar (Dairy)'
    when 'Saus Tomat Pizza Base' then 'CV Bumbu & Saus Nusantara'
    when 'Pepperoni Sapi Iris' then 'Makmur Meat Supplier'
end
where ingredient.name in (
    'Tepung Terigu Protein Tinggi',
    'Keju Mozzarella Shredded',
    'Saus Tomat Pizza Base',
    'Pepperoni Sapi Iris'
)
on conflict (ingredient_id, supplier_id) do nothing;

insert into supplier_ingredients (ingredient_id, supplier_id, fixed_unit_price)
select ingredient.id, supplier.id, supplier_price.fixed_unit_price
from (values
    ('Tepung Terigu Protein Tinggi', 'CV Pangan Makmur', 12500::numeric),
    ('Tepung Terigu Protein Tinggi', 'PT Bogasari Distributor Semarang', 11800::numeric),
    ('Keju Mozzarella Shredded', 'PT Keju Indonesia', 98000::numeric),
    ('Keju Mozzarella Shredded', 'UD Dairy Sejahtera', 92500::numeric),
    ('Saus Tomat Pizza Base', 'PT Saus Prima', 37000::numeric),
    ('Saus Tomat Pizza Base', 'CV Rempah Rasa', 34000::numeric),
    ('Pepperoni Sapi Iris', 'CV Daging Segar', 150000::numeric),
    ('Pepperoni Sapi Iris', 'PT Protein Pangan', 142500::numeric)
) as supplier_price(ingredient_name, supplier_name, fixed_unit_price)
join ingredients as ingredient on ingredient.name = supplier_price.ingredient_name
join suppliers as supplier on supplier.name = supplier_price.supplier_name
on conflict (ingredient_id, supplier_id)
do update set fixed_unit_price = excluded.fixed_unit_price;

drop function if exists public.record_inventory_movement(bigint, text, numeric, bigint, bigint);
drop function if exists public.record_inventory_movement(bigint, text, numeric, bigint, bigint, text);
drop function if exists public.record_inventory_movement(bigint, text, numeric, bigint, bigint, text, numeric);
drop function if exists public.record_inventory_movement(bigint, text, numeric, bigint, bigint, text, text);

create function public.record_inventory_movement(
    p_ingredient_id bigint,
    p_type text,
    p_qty numeric,
    p_supplier_id bigint default null,
    p_menu_item_id bigint default null,
    p_payment_method text default null,
    p_reason text default null
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_stock_qty numeric(12,2);
    v_unit_price numeric(15,2);
    v_purchase_unit_price numeric(15,2);
    v_log_id bigint;
begin
    if p_type is null or p_type not in ('IN', 'OUT') then
        raise exception 'Jenis mutasi stok tidak valid.';
    end if;
    if p_qty is null or p_qty <= 0 then
        raise exception 'Kuantitas harus lebih besar dari nol.';
    end if;
    if p_type = 'IN' then
        if p_supplier_id is null then
            raise exception 'Supplier wajib dipilih untuk stok masuk.';
        end if;
        if p_payment_method is null or p_payment_method not in ('CASH', 'CREDIT') then
            raise exception 'Metode pembayaran pembelian harus dipilih.';
        end if;
        select catalog.fixed_unit_price
        into v_purchase_unit_price
        from supplier_ingredients as catalog
        where catalog.ingredient_id = p_ingredient_id
          and catalog.supplier_id = p_supplier_id;
        if not found then
            raise exception 'Supplier tersebut tidak terdaftar untuk bahan baku ini.';
        end if;
    else
        if p_supplier_id is not null or p_menu_item_id is not null then
            raise exception 'Pengurangan manual hanya boleh dicatat sebagai barang basi atau kedaluwarsa.';
        end if;
        if p_reason is null or length(trim(p_reason)) = 0 or length(trim(p_reason)) > 300 then
            raise exception 'Alasan barang basi atau kedaluwarsa wajib diisi (maksimal 300 karakter).';
        end if;
    end if;

    select ingredient.stock_qty, ingredient.unit_price
    into v_stock_qty, v_unit_price
    from ingredients as ingredient
    where ingredient.id = p_ingredient_id
    for update;

    if not found then
        raise exception 'Bahan baku dengan ID % tidak ditemukan.', p_ingredient_id;
    end if;
    if p_type = 'OUT' and v_stock_qty < p_qty then
        raise exception 'Stok tidak cukup (tersedia %, dibutuhkan %).', v_stock_qty, p_qty;
    end if;

    insert into inventory_logs (
        ingredient_id, supplier_id, menu_item_id, type, qty, unit_price_at_time,
        payment_method, paid_at, notes, movement_reason
    )
    values (
        p_ingredient_id,
        p_supplier_id,
        null,
        p_type,
        p_qty,
        case when p_type = 'IN' then v_purchase_unit_price else v_unit_price end,
        case when p_type = 'IN' then p_payment_method else null end,
        case when p_type = 'IN' and p_payment_method = 'CASH' then now() else null end,
        case when p_type = 'OUT' then trim(p_reason) else null end,
        case when p_type = 'OUT' then 'SPOILED' else null end
    )
    returning id into v_log_id;

    update ingredients
    set stock_qty = case when p_type = 'IN' then v_stock_qty + p_qty else v_stock_qty - p_qty end,
        unit_price = case
            when p_type = 'IN' then round(
                ((v_stock_qty * v_unit_price) + (p_qty * v_purchase_unit_price))
                / (v_stock_qty + p_qty),
                2
            )
            else v_unit_price
        end
    where id = p_ingredient_id;

    return v_log_id;
end;
$$;

grant execute on function public.record_inventory_movement(bigint, text, numeric, bigint, bigint, text, text)
    to anon, authenticated;
