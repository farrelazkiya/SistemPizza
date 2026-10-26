-- Run after point_of_sale.sql, financial_reports.sql, and suppliers_and_spoilage.sql.

alter table inventory_logs
    drop constraint if exists inventory_logs_movement_reason_check;

alter table inventory_logs
    add constraint inventory_logs_movement_reason_check
        check (
            movement_reason is null
            or movement_reason in (
                'SPOILED',
                'FOOD_WASTE_EXPIRED',
                'FOOD_WASTE_DROPPED',
                'FOOD_WASTE_DOUGH_FAILED',
                'STOCKTAKE_LOSS',
                'STOCKTAKE_GAIN'
            )
        );

create or replace function public.record_food_waste(
    p_ingredient_id bigint,
    p_qty numeric,
    p_reason text
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_stock_qty numeric(12,2);
    v_unit_price numeric(15,2);
    v_log_id bigint;
    v_reason_label text;
begin
    if p_qty is null or p_qty <= 0 or p_qty <> round(p_qty, 2) then
        raise exception 'Jumlah food waste harus lebih besar dari nol dan maksimal dua angka desimal.';
    end if;

    v_reason_label := case p_reason
        when 'FOOD_WASTE_EXPIRED' then 'Kedaluwarsa'
        when 'FOOD_WASTE_DROPPED' then 'Jatuh'
        when 'FOOD_WASTE_DOUGH_FAILED' then 'Adonan gagal'
        else null
    end;
    if v_reason_label is null then
        raise exception 'Alasan food waste tidak valid.';
    end if;

    select ingredient.stock_qty, ingredient.unit_price
    into v_stock_qty, v_unit_price
    from ingredients as ingredient
    where ingredient.id = p_ingredient_id
    for update;

    if not found then
        raise exception 'Bahan baku dengan ID % tidak ditemukan.', p_ingredient_id;
    end if;
    if p_qty > v_stock_qty then
        raise exception 'Stok tidak cukup (tersedia %, dibutuhkan %).', v_stock_qty, p_qty;
    end if;

    insert into inventory_logs (
        ingredient_id, type, qty, unit_price_at_time, notes, movement_reason
    )
    values (
        p_ingredient_id, 'OUT', p_qty, v_unit_price,
        'Food waste: ' || v_reason_label, p_reason
    )
    returning id into v_log_id;

    update ingredients
    set stock_qty = v_stock_qty - p_qty
    where id = p_ingredient_id;

    return v_log_id;
end;
$$;

create or replace function public.record_stocktake(p_counts jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_count record;
    v_adjustment_count integer := 0;
    v_delta numeric(12,2);
begin
    if p_counts is null or jsonb_typeof(p_counts) <> 'array'
       or jsonb_array_length(p_counts) = 0 then
        raise exception 'Hasil stok opname harus berupa daftar hitung fisik.';
    end if;

    if exists (
        select 1
        from jsonb_to_recordset(p_counts)
            as count_row(ingredient_id bigint, expected_stock_qty numeric, physical_qty numeric)
        where count_row.ingredient_id is null
           or count_row.expected_stock_qty is null
           or count_row.physical_qty is null
           or count_row.expected_stock_qty < 0
           or count_row.physical_qty < 0
           or count_row.expected_stock_qty <> round(count_row.expected_stock_qty, 2)
           or count_row.physical_qty <> round(count_row.physical_qty, 2)
    ) then
        raise exception 'ID bahan serta stok sistem dan stok fisik harus valid dan tidak negatif.';
    end if;

    if exists (
        select count_row.ingredient_id
        from jsonb_to_recordset(p_counts)
            as count_row(ingredient_id bigint, expected_stock_qty numeric, physical_qty numeric)
        group by count_row.ingredient_id
        having count(*) > 1
    ) then
        raise exception 'Bahan yang sama tidak boleh muncul lebih dari sekali dalam stok opname.';
    end if;

    if exists (
        select 1
        from jsonb_to_recordset(p_counts)
            as count_row(ingredient_id bigint, expected_stock_qty numeric, physical_qty numeric)
        left join ingredients as ingredient on ingredient.id = count_row.ingredient_id
        where ingredient.id is null
    ) then
        raise exception 'Stok opname memuat bahan baku yang tidak ditemukan.';
    end if;

    for v_count in
        select ingredient.id,
               ingredient.stock_qty,
               ingredient.unit_price,
               count_row.expected_stock_qty,
               count_row.physical_qty
        from jsonb_to_recordset(p_counts)
            as count_row(ingredient_id bigint, expected_stock_qty numeric, physical_qty numeric)
        join ingredients as ingredient on ingredient.id = count_row.ingredient_id
        order by ingredient.id
        for update of ingredient
    loop
        if v_count.stock_qty <> v_count.expected_stock_qty then
            raise exception 'Stok bahan ID % berubah setelah halaman dimuat. Muat ulang lalu lakukan stok opname kembali.',
                v_count.id;
        end if;

        v_delta := round(v_count.physical_qty - v_count.stock_qty, 2);
        if v_delta = 0 then
            continue;
        end if;

        insert into inventory_logs (
            ingredient_id, type, qty, unit_price_at_time, notes, movement_reason
        )
        values (
            v_count.id,
            case when v_delta > 0 then 'IN' else 'OUT' end,
            abs(v_delta),
            v_count.unit_price,
            'Penyesuaian stok opname: ' ||
                case when v_delta > 0 then 'selisih lebih' else 'selisih kurang' end,
            case when v_delta > 0 then 'STOCKTAKE_GAIN' else 'STOCKTAKE_LOSS' end
        );

        update ingredients
        set stock_qty = v_count.physical_qty
        where id = v_count.id;

        v_adjustment_count := v_adjustment_count + 1;
    end loop;

    return v_adjustment_count;
end;
$$;

grant execute on function public.record_food_waste(bigint, numeric, text) to anon, authenticated;
grant execute on function public.record_stocktake(jsonb) to anon, authenticated;
