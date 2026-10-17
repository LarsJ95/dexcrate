-- STAP 13: Wens bij een vallende ster. Tik op een vallende ster in de achtergrond: één keer per dag +5 Crate points.
-- Vereist STAP11. Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
-- Veilig: één transactie, opnieuw draaien kan. Raakt je echte kaarten niet aan.

begin;

-- 1. Nieuwe soort boeking 'wish' toestaan (de lijst met soorten staat als controle op crate_ledger).
alter table public.crate_ledger drop constraint if exists crate_ledger_kind_check;
alter table public.crate_ledger
  add constraint crate_ledger_kind_check
  check (kind in ('card', 'sale', 'purchase', 'dex', 'set', 'daily', 'pack', 'trade', 'wish'));

-- 2. Wens doen: +5 punten, één keer per dag (via crate_book: elke dag telt één keer).
create or replace function public.crate_wish()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  gained integer;
  w public.crate_wallet;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  insert into public.crate_wallet (user_id) values (me) on conflict (user_id) do nothing;
  gained := public.crate_book(me, 'wish', current_date::text, 5);
  select * into w from public.crate_wallet where user_id = me;
  return jsonb_build_object('points', w.points, 'gained', gained);
end;
$$;

revoke execute on function public.crate_wish() from public, anon;
grant execute on function public.crate_wish() to authenticated;

commit;

notify pgrst, 'reload schema';

select 'STAP13 klaar' as resultaat,
       to_regprocedure('public.crate_wish()') is not null as wens;
