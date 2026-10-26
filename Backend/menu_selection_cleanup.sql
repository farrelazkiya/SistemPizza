-- Keep the original menu records for historical sales and reports,
-- but remove them from active menu selections.

begin;

alter table public.menu_items
    add column if not exists is_available boolean not null default true;

update public.menu_items
set is_available = false
where name in (
    'Pizza Margherita (Loyang Sedang)',
    'Pizza Meat Lover (Loyang Besar)',
    'Pizza Pepperoni (Loyang Sedang)'
)
and is_available;

notify pgrst, 'reload schema';

commit;
