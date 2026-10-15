-- Kopieert sales + purchases naar cards. Verwijdert NIETS; oude tabellen blijven als back-up.
-- Draait alleen als cards nog leeg is (veilig om per ongeluk twee keer te starten).
-- Eén statement (geen tijdelijke tabel): de SQL Editor voert regels niet altijd in dezelfde sessie uit,
-- en één statement slaagt of faalt als geheel.
-- Uitvoeren in Supabase Dashboard → SQL Editor, ná 002_cards.sql.

-- Taal: "JAPAN"/"CHINA" in de naam, anders de taal van de koppeling, anders Engels (losse kaarten).
-- Sealed producten krijgen geen taal.
insert into public.cards (
  user_id, name, set_code, card_number, quantity, kind, tcgdex_id, status, language,
  purchase_price, purchase_channel, sale_price, sale_channel, sort_order
)
select
  src.user_id,
  btrim(regexp_replace(src.raw_name, '\s*\m(JAPAN|CHINA)\M\s*', ' ', 'gi')),
  src.set_code, src.card_number, src.quantity, src.kind, src.tcgdex_id, src.status,
  case
    when src.kind = 'sealed' then null
    when src.raw_name ~* '\mjapan\M' then 'ja'
    when src.raw_name ~* '\mchina\M' then 'zh-cn'
    when src.tcgdex_id is not null then split_part(src.tcgdex_id, '/', 1)
    else 'en'
  end,
  src.purchase_price, src.purchase_channel, src.sale_price, src.sale_channel, src.sort_order
from (
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
  from public.purchases
) as src
where not exists (select 1 from public.cards);

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
