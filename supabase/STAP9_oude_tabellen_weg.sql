-- STAP9: oude tabellen sales en purchases verwijderen (akkoord gebruiker 16-10-2026).
-- Alle gegevens staan sinds de migratie (003 / STAP1) in cards; de app gebruikt sales en purchases niet meer.
-- LET OP: verwijderen kan niet ongedaan worden gemaakt.
--
-- Eén blok: het slaagt helemaal of er verandert niets.
-- Veiligheid: stopt als cards leeg is, en verwijdert zonder CASCADE: hangt er nog iets aan deze tabellen
-- (een view of verwijzing), dan faalt het met een melding en blijft alles staan.
-- Uitvoeren in Supabase Dashboard → SQL Editor: alles plakken en één keer Run.

do $$
declare
  n_cards int;
  n_sales int := 0;
  n_purchases int := 0;
begin
  select count(*) into n_cards from public.cards;
  if n_cards = 0 then
    raise exception 'cards is leeg: niets verwijderd. De gegevens staan nog alleen in sales/purchases.';
  end if;
  if to_regclass('public.sales') is not null then
    execute 'select count(*) from public.sales' into n_sales;
  end if;
  if to_regclass('public.purchases') is not null then
    execute 'select count(*) from public.purchases' into n_purchases;
  end if;
  drop table if exists public.sales restrict;
  drop table if exists public.purchases restrict;
  raise notice 'Verwijderd: sales (% regels), purchases (% regels). In cards: % regels.', n_sales, n_purchases, n_cards;
end $$;

-- Controle: moet "STAP9 klaar" geven met twee keer true.
select
  'STAP9 klaar' as status,
  to_regclass('public.sales') is null as sales_weg,
  to_regclass('public.purchases') is null as purchases_weg,
  (select count(*) from public.cards) as regels_in_cards;
