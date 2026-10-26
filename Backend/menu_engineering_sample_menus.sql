-- Run after multi_payment.sql and batch_fifo.sql to add five example pizzas,
-- recipes, and normal cashier sales for Menu Engineering.
-- Food-cost group is designed from the current ingredient unit costs:
-- two low (<30%), one normal (30-35%), and two high (>35%).
-- Sample sales use 10, 2, 5, 8, and 1 portions respectively, producing
-- STAR, PUZZLE, NORMAL, PLOWHORSE, and DOG at the current ingredient costs.

begin;

create table if not exists public.menu_engineering_sample_sales (
    sample_key text primary key,
    sale_id bigint not null unique references public.sales(id) on delete cascade,
    created_at timestamptz not null default now()
);
alter table public.menu_engineering_sample_sales disable row level security;
revoke all on public.menu_engineering_sample_sales from anon, authenticated;

do $$
begin
    if exists (
        select required.name
        from (values
            ('Tepung Terigu Protein Tinggi'),
            ('Keju Mozzarella Shredded'),
            ('Saus Tomat Pizza Base'),
            ('Pepperoni Sapi Iris')
        ) as required(name)
        where not exists (
            select 1 from public.ingredients as ingredient
            where ingredient.name = required.name
        )
    ) then
        raise exception 'Contoh menu membutuhkan empat bahan yang tersedia di Backend/seed.sql.';
    end if;
end;
$$;

insert into public.menu_items (name, selling_price)
values
    ('Pizza Garden Margherita', 75000),
    ('Pizza Pepperoni Light', 110000),
    ('Pizza Pepperoni Classic', 120000),
    ('Pizza Double Cheese', 100000),
    ('Pizza Pepperoni Supreme', 195000)
on conflict (name)
do nothing;

insert into public.menu_recipes (menu_item_id, ingredient_id, qty_per_menu)
select menu.id, ingredient.id, recipe.qty_per_menu
from (values
    ('Pizza Garden Margherita', 'Tepung Terigu Protein Tinggi', 0.25::numeric),
    ('Pizza Garden Margherita', 'Keju Mozzarella Shredded', 0.12::numeric),
    ('Pizza Garden Margherita', 'Saus Tomat Pizza Base', 0.12::numeric),

    ('Pizza Pepperoni Light', 'Tepung Terigu Protein Tinggi', 0.25::numeric),
    ('Pizza Pepperoni Light', 'Keju Mozzarella Shredded', 0.12::numeric),
    ('Pizza Pepperoni Light', 'Saus Tomat Pizza Base', 0.12::numeric),
    ('Pizza Pepperoni Light', 'Pepperoni Sapi Iris', 0.08::numeric),

    ('Pizza Pepperoni Classic', 'Tepung Terigu Protein Tinggi', 0.30::numeric),
    ('Pizza Pepperoni Classic', 'Keju Mozzarella Shredded', 0.18::numeric),
    ('Pizza Pepperoni Classic', 'Saus Tomat Pizza Base', 0.15::numeric),
    ('Pizza Pepperoni Classic', 'Pepperoni Sapi Iris', 0.10::numeric),

    ('Pizza Double Cheese', 'Tepung Terigu Protein Tinggi', 0.30::numeric),
    ('Pizza Double Cheese', 'Keju Mozzarella Shredded', 0.30::numeric),
    ('Pizza Double Cheese', 'Saus Tomat Pizza Base', 0.15::numeric),

    ('Pizza Pepperoni Supreme', 'Tepung Terigu Protein Tinggi', 0.40::numeric),
    ('Pizza Pepperoni Supreme', 'Keju Mozzarella Shredded', 0.30::numeric),
    ('Pizza Pepperoni Supreme', 'Saus Tomat Pizza Base', 0.20::numeric),
    ('Pizza Pepperoni Supreme', 'Pepperoni Sapi Iris', 0.30::numeric)
) as recipe(menu_name, ingredient_name, qty_per_menu)
join public.menu_items as menu on menu.name = recipe.menu_name
join public.ingredients as ingredient on ingredient.name = recipe.ingredient_name
on conflict (menu_item_id, ingredient_id)
do nothing;

do $$
declare
    v_sample record;
    v_menu_id bigint;
    v_sale_id bigint;
begin
    for v_sample in
        select sample.sample_key, sample.menu_name, sample.quantity
        from (values
            ('garden-margherita', 'Pizza Garden Margherita', 10),
            ('pepperoni-light', 'Pizza Pepperoni Light', 1),
            ('pepperoni-classic', 'Pizza Pepperoni Classic', 5),
            ('double-cheese', 'Pizza Double Cheese', 8),
            ('pepperoni-supreme', 'Pizza Pepperoni Supreme', 1)
        ) as sample(sample_key, menu_name, quantity)
    loop
        if not exists (
            select 1 from public.menu_engineering_sample_sales
            where sample_key = v_sample.sample_key
        ) then
            select menu.id
            into strict v_menu_id
            from public.menu_items as menu
            where menu.name = v_sample.menu_name;

            v_sale_id := public.create_sale(
                jsonb_build_array(jsonb_build_object(
                    'menu_item_id', v_menu_id,
                    'quantity', v_sample.quantity
                )),
                'CASH'
            );

            insert into public.menu_engineering_sample_sales (sample_key, sale_id)
            values (v_sample.sample_key, v_sale_id);
        end if;
    end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
