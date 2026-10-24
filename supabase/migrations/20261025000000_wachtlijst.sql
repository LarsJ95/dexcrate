-- STAP32 (25-10-2026, op verzoek: Register-knop op de landingspagina): wachtlijst. Bezoekers laten hun e-mailadres achter
-- (met toestemming, optioneel "wat verzamel je"); de beheerder nodigt ze later uit via Admin. Aanmelden kan zonder account
-- via waitlist_join (anon); het antwoord is altijd 'ok', zodat niemand kan nagaan welke adressen er al op staan.
-- Tegen spam: onzichtbaar veld (bots), e-mailcontrole en een totaalgrens (20 per 10 minuten, 300 per dag).
-- Bewaren: na de uitnodiging nog 30 dagen, anders hoogstens 12 maanden (opgeruimd bij elke aanmelding en in Admin).
-- Nieuwe tabel met expliciete rechten. Wist niets. Veilig om opnieuw te draaien. Via "Database migreren".
-- Verwacht: "STAP32 klaar", anon_mag_aanmelden = true, anon_mag_lezen = false.

begin;

create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (char_length(email) between 6 and 254),
  collects    text check (collects is null or char_length(collects) <= 200),
  consent_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  invited_at  timestamptz
);

create unique index if not exists waitlist_email_key on public.waitlist (lower(email));
create index if not exists waitlist_created_idx on public.waitlist (created_at);

alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;
grant select, insert, update, delete on public.waitlist to service_role;

-- Oude regels weg: uitgenodigd en 30 dagen verder, of nooit uitgenodigd en 12 maanden oud.
create or replace function public.waitlist_cleanup()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.waitlist w
   where (w.invited_at is not null and w.invited_at < now() - interval '30 days')
      or w.created_at < now() - interval '12 months';
$$;

revoke execute on function public.waitlist_cleanup() from public, anon, authenticated;
grant execute on function public.waitlist_cleanup() to service_role;

-- Aanmelden (landingspagina, zonder account).
create or replace function public.waitlist_join(p_email text, p_collects text default null, p_consent boolean default false, p_trap text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  mail text := lower(btrim(coalesce(p_email, '')));
  note text := nullif(btrim(coalesce(p_collects, '')), '');
  recent integer;
  today integer;
begin
  -- Onzichtbaar veld ingevuld = een bot: doen alsof het gelukt is.
  if btrim(coalesce(p_trap, '')) <> '' then
    return 'ok';
  end if;
  if char_length(mail) > 254 or mail !~ '^[^[:space:]@]{1,64}@[^[:space:]@]{1,190}\.[^[:space:]@]{2,63}$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  if coalesce(p_consent, false) is not true then
    raise exception 'Please agree to the privacy statement' using errcode = '22023';
  end if;
  note := left(note, 200);
  -- Aanmeldingen na elkaar tellen, zodat de grens ook bij veel tegelijk klopt.
  perform pg_advisory_xact_lock(hashtextextended('waitlist_join', 0));
  perform public.waitlist_cleanup();
  if exists (select 1 from public.waitlist w where lower(w.email) = mail) then
    return 'ok';
  end if;
  select count(*) filter (where w.created_at > now() - interval '10 minutes'), count(*)
    into recent, today
    from public.waitlist w
   where w.created_at > now() - interval '1 day';
  if recent >= 20 or today >= 300 then
    raise exception 'Lots of people are signing up right now. Please try again in a few minutes.' using errcode = '54000';
  end if;
  insert into public.waitlist (email, collects) values (mail, note);
  return 'ok';
end;
$$;

revoke execute on function public.waitlist_join(text, text, boolean, text) from public;
grant execute on function public.waitlist_join(text, text, boolean, text) to anon, authenticated;

-- Admin: de lijst, oudste aanmelding eerst.
create or replace function public.admin_waitlist()
returns table (id uuid, email text, collects text, created_at timestamptz, invited_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform public.waitlist_cleanup();
  return query
    select w.id, w.email, w.collects, w.created_at, w.invited_at
      from public.waitlist w
     order by w.created_at, w.id;
end;
$$;

revoke execute on function public.admin_waitlist() from public, anon;
grant execute on function public.admin_waitlist() to authenticated;

-- Admin: als uitgenodigd markeren (de uitnodiging zelf gaat via de functie admin-users).
create or replace function public.admin_waitlist_invited(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.waitlist w set invited_at = now() where w.id = p_id;
end;
$$;

revoke execute on function public.admin_waitlist_invited(uuid) from public, anon;
grant execute on function public.admin_waitlist_invited(uuid) to authenticated;

-- Admin: van de lijst halen (bv. op verzoek).
create or replace function public.admin_waitlist_remove(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  delete from public.waitlist w where w.id = p_id;
end;
$$;

revoke execute on function public.admin_waitlist_remove(uuid) from public, anon;
grant execute on function public.admin_waitlist_remove(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

select 'STAP32 klaar' as resultaat,
       has_function_privilege('anon', 'public.waitlist_join(text, text, boolean, text)', 'execute') as anon_mag_aanmelden,
       has_table_privilege('anon', 'public.waitlist', 'select') as anon_mag_lezen;
