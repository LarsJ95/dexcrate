-- Kopieert sales + purchases naar cards. Verwijdert NIETS; oude tabellen blijven als back-up.
-- Draait alleen als cards nog leeg is (veilig om per ongeluk twee keer te starten).
-- Uitvoeren in Supabase Dashboard → SQL Editor, ná 002_cards.sql.

begin;

-- Taal: "JAPAN"/"CHINA" in de naam, anders de taal van de koppeling, anders Engels (losse kaarten).
-- Sealed producten krijgen geen taal.
create temporary table _src on commit drop as
select
  user_id,
  name as raw_name,
  set_code, card_number, quantity, kind, tcgdex_id, sort_order,
  case when sold then 'sold' else 'for_sale' end as status,
  null::numeric as purchase_price, null::text as purchase_channel,
  unit_price as sale_price, channel as sale_channel
from public.sales
union all
select
  user_id, name, set_code, card_number, quantity, kind, tcgdex_id, 1000 + sort_order,
  'collection',
  unit_price, channel,
  null, null
from public.purchases;

insert into public.cards (
  user_id, name, set_code, card_number, quantity, kind, tcgdex_id, status, language,
  purchase_price, purchase_channel, sale_price, sale_channel, sort_order
)
select
  user_id,
  btrim(regexp_replace(raw_name, '\s*\m(JAPAN|CHINA)\M\s*', ' ', 'gi')),
  set_code, card_number, quantity, kind, tcgdex_id, status,
  case
    when kind = 'sealed' then null
    when raw_name ~* '\mjapan\M' then 'ja'
    when raw_name ~* '\mchina\M' then 'zh-cn'
    when tcgdex_id is not null then split_part(tcgdex_id, '/', 1)
    else 'en'
  end,
  purchase_price, purchase_channel, sale_price, sale_channel, sort_order
from _src
where not exists (select 1 from public.cards);

commit;

-- Controle: moet 93 regels geven, en dezelfde totalen als je Excel.
select
  count(*)                                                                as regels,
  sum(quantity * sale_price) filter (where status = 'sold')              as verkocht,
  sum(quantity) filter (where status = 'sold')                           as verkocht_aantal,
  sum(quantity * sale_price) filter (where status = 'for_sale')          as te_koop,
  sum(quantity) filter (where status = 'for_sale')                       as te_koop_aantal,
  sum(quantity * purchase_price) filter (where purchase_price is not null) as gekocht,
  sum(quantity) filter (where purchase_price is not null)                as gekocht_aantal
from public.cards;
