-- STAP29 (24-10-2026, voorbereiding op live gaan; AVG): je eigen account verwijderen vanuit Settings → Account.
-- De app wist eerst je gegevens en bestanden (zoals "Reset account", reset_my_account + opslag); daarna verwijdert deze
-- functie het inlogaccount zelf. Alle tabellen met je gegevens hangen aan auth.users met "on delete cascade"; het
-- beheerlogboek houdt zijn regels (koppeling wordt leeg). Bevestigen met je eigen e-mailadres. Beheerders kunnen zichzelf
-- hier niet verwijderen (eerst de beheerrechten weghalen), zodat je niet per ongeluk zonder beheerder komt te zitten.
-- Wist niets bij het draaien. Veilig om opnieuw te draaien. Gaat via de workflow "Database migreren".
-- Verwacht: "STAP29 klaar", functie = true, anon_mag = false.

begin;

create or replace function public.delete_my_account(p_confirm_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  mail text;
begin
  if me is null then
    raise exception 'You need to be signed in' using errcode = '42501';
  end if;
  select u.email into mail from auth.users u where u.id = me;
  if mail is null or lower(btrim(coalesce(p_confirm_email, ''))) <> lower(mail) then
    raise exception 'Type your email address to confirm' using errcode = '22023';
  end if;
  if exists (select 1 from public.admins a where a.user_id = me) then
    raise exception 'Admins cannot delete their own account here' using errcode = '22023';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

commit;

notify pgrst, 'reload schema';

select 'STAP29 klaar' as resultaat,
       to_regprocedure('public.delete_my_account(text)') is not null as functie,
       has_function_privilege('anon', 'public.delete_my_account(text)', 'execute') as anon_mag;
