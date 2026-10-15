-- STAP 5: aankopen en verkopen als transacties (lots, kosten, betaal-/verzendstatus, retour, aankoopbewijzen).
-- Pas draaien nadat STAP4 gelukt is.
-- Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
--
-- Veilig:
-- - Alles in één transactie: gaat er iets mis, dan verandert er niets.
-- - Alleen toevoegen. Je huidige aankoop- en verkoopprijzen worden per kaartregel overgezet naar transacties;
--   lege prijzen blijven leeg (onbekend), ze worden geen 0.
-- - Opnieuw draaien kan: niets wordt dubbel aangemaakt.

begin;

-- ---------------------------------------------------------------------------
-- 1. Herkomst van gesplitste regels (verkoop van 1 van 3 → nieuwe regel "split_from" de oude).
-- ---------------------------------------------------------------------------
alter table public.cards
  add column if not exists split_from uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cards_split_from_fk') then
    alter table public.cards add constraint cards_split_from_fk
      foreign key (split_from) references public.cards (id) on delete set null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Transacties en regels.
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('purchase', 'sale', 'trade', 'gift_in', 'gift_out')),
  occurred_on     date,
  channel         text check (char_length(channel) <= 50),
  counterparty    text check (char_length(counterparty) <= 100),
  -- Bedrag voor de kaarten zelf (aankoopprijs of verkoopopbrengst), zonder verzending. null = onbekend.
  amount          numeric(10, 2) check (amount >= 0),
  -- Aankoop: betaalde verzendkosten. Verkoop: ontvangen verzendbijdrage van de koper.
  shipping_amount numeric(10, 2) check (shipping_amount >= 0),
  -- Aankoop: overige kosten (bv. servicekosten). Verkoop: platform- en betaalkosten.
  fees_amount     numeric(10, 2) check (fees_amount >= 0),
  -- Verkoop: werkelijke verzend- en verpakkingskosten.
  shipping_cost   numeric(10, 2) check (shipping_cost >= 0),
  -- Terugbetaald aan de koper (gedeeltelijke terugbetaling of retour).
  refund_amount   numeric(10, 2) check (refund_amount >= 0),
  status          text not null default 'completed'
    check (status in ('open', 'paid', 'shipped', 'completed', 'cancelled', 'returned')),
  notes           text check (char_length(notes) <= 2000),
  -- Alleen voor de eenmalige overzetting uit cards (voorkomt dubbel overzetten).
  legacy_card_id  uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists transactions_user_idx on public.transactions (user_id);
create unique index if not exists transactions_legacy_idx on public.transactions (legacy_card_id, kind)
  where legacy_card_id is not null;

drop trigger if exists transactions_updated_at on public.transactions;
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

alter table public.transactions enable row level security;
drop policy if exists "transactions_own" on public.transactions;
create policy "transactions_own" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.transaction_lines (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  -- Kaartregel verwijderd → regel blijft (historie), zonder koppeling.
  card_id        uuid references public.cards (id) on delete set null,
  quantity       integer not null check (quantity between 1 and 9999),
  -- Bedrag per stuk; null = onderdeel van een lot zonder (bekende) verdeling.
  unit_amount    numeric(10, 2) check (unit_amount >= 0),
  created_at     timestamptz not null default now()
);

create index if not exists transaction_lines_tx_idx on public.transaction_lines (transaction_id);
create index if not exists transaction_lines_card_idx on public.transaction_lines (card_id) where card_id is not null;

alter table public.transaction_lines enable row level security;
drop policy if exists "transaction_lines_own" on public.transaction_lines;
create policy "transaction_lines_own" on public.transaction_lines
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. Aankoopbewijzen: privé, los van kaartfoto's.
-- ---------------------------------------------------------------------------
create table if not exists public.transaction_documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  path           text not null check (char_length(path) between 1 and 300),
  name           text check (char_length(name) <= 200),
  created_at     timestamptz not null default now()
);

create index if not exists transaction_documents_tx_idx on public.transaction_documents (transaction_id);

alter table public.transaction_documents enable row level security;
drop policy if exists "transaction_documents_own" on public.transaction_documents;
create policy "transaction_documents_own" on public.transaction_documents
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipts_select_own" on storage.objects;
create policy "receipts_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

drop policy if exists "receipts_insert_own" on storage.objects;
create policy "receipts_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

drop policy if exists "receipts_delete_own" on storage.objects;
create policy "receipts_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

-- ---------------------------------------------------------------------------
-- 4. Bestaande prijzen overzetten: per kaartregel één aankoop- en/of verkooptransactie.
--    (In de SQL Editor is er geen ingelogde gebruiker, dus user_id expliciet uit de kaart.)
-- ---------------------------------------------------------------------------
with ins as (
  insert into public.transactions (user_id, kind, occurred_on, channel, amount, status, legacy_card_id)
  select c.user_id, 'purchase', c.purchase_date, c.purchase_channel,
         c.quantity * c.purchase_price, 'completed', c.id
  from public.cards c
  where (c.purchase_price is not null or c.purchase_channel is not null or c.purchase_date is not null)
    -- Geen kaart die al in een aankoop staat (eerder overgezet of via de app vastgelegd).
    and not exists (
      select 1 from public.transaction_lines l join public.transactions t on t.id = l.transaction_id
      where l.card_id = c.id and t.kind = 'purchase'
    )
    and not exists (select 1 from public.transactions t where t.legacy_card_id = c.id and t.kind = 'purchase')
    -- Gesplitste regel: de aankoop hoort bij de oorspronkelijke regel.
    and c.split_from is null
  returning id, user_id, legacy_card_id
)
insert into public.transaction_lines (user_id, transaction_id, card_id, quantity, unit_amount)
select ins.user_id, ins.id, c.id, c.quantity, c.purchase_price
from ins join public.cards c on c.id = ins.legacy_card_id;

with ins as (
  insert into public.transactions (user_id, kind, occurred_on, channel, amount, status, legacy_card_id)
  select c.user_id, 'sale', c.sale_date, c.sale_channel,
         c.quantity * c.sale_price, 'completed', c.id
  from public.cards c
  where c.ownership = 'sold'
    -- Geen kaart die al in een verkoop staat (eerder overgezet of via de app vastgelegd).
    and not exists (
      select 1 from public.transaction_lines l join public.transactions t on t.id = l.transaction_id
      where l.card_id = c.id and t.kind = 'sale'
    )
    and not exists (select 1 from public.transactions t where t.legacy_card_id = c.id and t.kind = 'sale')
  returning id, user_id, legacy_card_id
)
insert into public.transaction_lines (user_id, transaction_id, card_id, quantity, unit_amount)
select ins.user_id, ins.id, c.id, c.quantity, c.sale_price
from ins join public.cards c on c.id = ins.legacy_card_id;

-- ---------------------------------------------------------------------------
-- 5. Verkoop vastleggen als één geheel: splitsen, status zetten en transactie + regels aanmaken.
--    Rechten van de aanroeper (RLS geldt), dus alleen je eigen kaarten.
--    p = { occurred_on, channel, counterparty, amount, shipping_amount, fees_amount, shipping_cost,
--          status, notes, lines: [{ card_id, quantity, unit_amount }] }
-- ---------------------------------------------------------------------------
create or replace function public.record_sale(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  tx_id      uuid;
  ln         jsonb;
  c          public.cards%rowtype;
  qty        integer;
  unit       numeric(10, 2);
  target     uuid;
  sale_state text := coalesce(nullif(p->>'status', ''), 'completed');
  sold_on    date := nullif(p->>'occurred_on', '')::date;
  chan       text := nullif(btrim(p->>'channel'), '');
begin
  if sale_state not in ('open', 'paid', 'shipped', 'completed') then
    raise exception 'Invalid sale status: %', sale_state;
  end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then
    raise exception 'Choose at least one card.';
  end if;

  insert into public.transactions (kind, occurred_on, channel, counterparty, amount, shipping_amount,
                                   fees_amount, shipping_cost, status, notes)
  values ('sale', sold_on, chan, nullif(btrim(p->>'counterparty'), ''),
          nullif(p->>'amount', '')::numeric, nullif(p->>'shipping_amount', '')::numeric,
          nullif(p->>'fees_amount', '')::numeric, nullif(p->>'shipping_cost', '')::numeric,
          sale_state, nullif(btrim(p->>'notes'), ''))
  returning id into tx_id;

  for ln in select value from jsonb_array_elements(p->'lines') loop
    qty := (ln->>'quantity')::integer;
    unit := nullif(ln->>'unit_amount', '')::numeric;
    select * into c from public.cards where id = (ln->>'card_id')::uuid for update;
    if not found then
      raise exception 'Card not found.';
    end if;
    if c.ownership <> 'owned' then
      raise exception '"%" is not in your possession.', c.name;
    end if;
    if qty is null or qty < 1 or qty > c.quantity then
      raise exception 'Invalid quantity for "%" (you have %).', c.name, c.quantity;
    end if;

    if qty < c.quantity then
      -- Deel verkopen: nieuwe regel voor de verkochte stuks; de rest blijft zoals hij was.
      insert into public.cards (
        user_id, name, set_code, card_number, quantity, kind, tcgdex_id, language, condition, variant,
        grading_company, grade, purchase_price, purchase_channel, purchase_date, sort_order,
        notes, cert_number, edition, link_status, cardmarket_id, split_from,
        ownership, availability, status, sale_price, sale_channel, sale_date
      ) values (
        c.user_id, c.name, c.set_code, c.card_number, qty, c.kind, c.tcgdex_id, c.language, c.condition, c.variant,
        c.grading_company, c.grade, c.purchase_price, c.purchase_channel, c.purchase_date, c.sort_order,
        c.notes, c.cert_number, c.edition, c.link_status, c.cardmarket_id, c.id,
        'sold', 'keep', 'sold', unit, chan, sold_on
      ) returning id into target;
      update public.cards set quantity = quantity - qty where id = c.id;
    else
      update public.cards
      set ownership = 'sold', availability = 'keep', sale_price = unit, sale_channel = chan, sale_date = sold_on
      where id = c.id;
      target := c.id;
    end if;

    insert into public.transaction_lines (user_id, transaction_id, card_id, quantity, unit_amount)
    values (c.user_id, tx_id, target, qty, unit);
  end loop;

  return tx_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Status van een verkoop wijzigen. Annuleren of retour zet de kaarten terug in bezit (te koop);
--    de transactie blijft bewaard (historie). Geannuleerd/retour is definitief.
-- ---------------------------------------------------------------------------
create or replace function public.set_sale_status(p_id uuid, p_status text, p_refund numeric default null)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  t public.transactions%rowtype;
begin
  select * into t from public.transactions where id = p_id for update;
  if not found or t.kind <> 'sale' then
    raise exception 'Sale not found.';
  end if;
  if t.status in ('cancelled', 'returned') then
    raise exception 'This sale is already %, that cannot be changed.', t.status;
  end if;
  if p_status not in ('open', 'paid', 'shipped', 'completed', 'cancelled', 'returned') then
    raise exception 'Invalid status: %', p_status;
  end if;

  if p_status in ('cancelled', 'returned') then
    update public.cards c
    set ownership = 'owned', availability = 'for_sale', sale_date = null
    from public.transaction_lines l
    where l.transaction_id = p_id and l.card_id = c.id and c.ownership = 'sold';
  end if;

  update public.transactions
  set status = p_status,
      refund_amount = case when p_refund is not null then p_refund else refund_amount end
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Aankoop vastleggen voor bestaande kaartregels (bv. eerst toegevoegd als "Incoming").
--    p = { occurred_on, channel, counterparty, amount, shipping_amount, fees_amount, status, notes,
--          received: bool, lines: [{ card_id, unit_amount }] }  (aantal = hele regel)
-- ---------------------------------------------------------------------------
create or replace function public.record_purchase(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  tx_id   uuid;
  ln      jsonb;
  c       public.cards%rowtype;
  unit    numeric(10, 2);
  bought  date := nullif(p->>'occurred_on', '')::date;
  chan    text := nullif(btrim(p->>'channel'), '');
  arrived boolean := coalesce((p->>'received')::boolean, false);
begin
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then
    raise exception 'Choose at least one card.';
  end if;

  insert into public.transactions (kind, occurred_on, channel, counterparty, amount, shipping_amount,
                                   fees_amount, status, notes)
  values ('purchase', bought, chan, nullif(btrim(p->>'counterparty'), ''),
          nullif(p->>'amount', '')::numeric, nullif(p->>'shipping_amount', '')::numeric,
          nullif(p->>'fees_amount', '')::numeric, coalesce(nullif(p->>'status', ''), 'completed'),
          nullif(btrim(p->>'notes'), ''))
  returning id into tx_id;

  for ln in select value from jsonb_array_elements(p->'lines') loop
    unit := nullif(ln->>'unit_amount', '')::numeric;
    select * into c from public.cards where id = (ln->>'card_id')::uuid for update;
    if not found then
      raise exception 'Card not found.';
    end if;
    update public.cards
    set purchase_price = coalesce(unit, purchase_price),
        purchase_date = coalesce(bought, purchase_date),
        purchase_channel = coalesce(chan, purchase_channel),
        ownership = case when arrived and ownership = 'incoming' then 'owned' else ownership end
    where id = c.id;
    insert into public.transaction_lines (user_id, transaction_id, card_id, quantity, unit_amount)
    values (c.user_id, tx_id, c.id, c.quantity, unit);
  end loop;

  return tx_id;
end;
$$;

grant execute on function public.record_sale(jsonb) to authenticated;
grant execute on function public.set_sale_status(uuid, text, numeric) to authenticated;
grant execute on function public.record_purchase(jsonb) to authenticated;

commit;

-- Controle: aantal overgezette transacties per soort, en kaarten/stuks die erbij horen.
select t.kind, count(distinct t.id) as transacties, sum(l.quantity) as stuks,
       count(*) filter (where l.unit_amount is null) as regels_zonder_bedrag
from public.transactions t
join public.transaction_lines l on l.transaction_id = t.id
group by t.kind
order by t.kind;
