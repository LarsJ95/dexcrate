-- STAP 3: eigen kaartfoto's (voor kaarten zonder officiële afbeelding).
-- Kopieer ALLES in dit bestand (Ctrl+A, Ctrl+C), plak in Supabase → SQL Editor → nieuwe query → Run.
-- Veilig om opnieuw te draaien.

-- Pad van de eigen foto in de opslag (bv. "<user-id>/<kaart-id>-<tijd>.jpg").
alter table public.cards
  add column if not exists image_path text check (char_length(image_path) <= 300);

-- Privé-bucket: alleen bereikbaar met een tijdelijke, ondertekende link.
insert into storage.buckets (id, name, public)
values ('card-photos', 'card-photos', false)
on conflict (id) do nothing;

-- Elke gebruiker alleen in zijn eigen map (eerste mapnaam = user-id).
drop policy if exists "card_photos_select_own" on storage.objects;
create policy "card_photos_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

drop policy if exists "card_photos_insert_own" on storage.objects;
create policy "card_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'card-photos' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

drop policy if exists "card_photos_update_own" on storage.objects;
create policy "card_photos_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

drop policy if exists "card_photos_delete_own" on storage.objects;
create policy "card_photos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

select 'STAP3 klaar' as resultaat;
