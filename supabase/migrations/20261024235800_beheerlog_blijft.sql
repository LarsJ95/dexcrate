-- STAP31 (24-10-2026): het beheerlogboek houdt zijn regels als een account verdwijnt. STAP29 beloofde dat al, maar
-- admin_actions.target_user had sinds STAP21 "on delete cascade": wie zijn account verwijderde (of door een beheerder
-- werd verwijderd), nam zijn regels (punten, scanlimiet, blokkeren) mee uit het logboek. Nu "on delete set null": de
-- regel blijft, zonder koppeling naar de gebruiker (de beheerpagina toont dan "(deleted user)"). admin_id deed dit al.
-- Wist niets. Veilig om opnieuw te draaien. Via "Database migreren".
-- Verwacht: "STAP31 klaar", bij_verwijderen = 'set null'.

begin;

do $$
declare
  fk text;
begin
  -- Huidige verwijzing van target_user naar auth.users opzoeken (naam niet aannemen).
  for fk in
    select c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.conrelid = 'public.admin_actions'::regclass
       and c.contype = 'f'
       and a.attname = 'target_user'
  loop
    execute format('alter table public.admin_actions drop constraint %I', fk);
  end loop;
end;
$$;

alter table public.admin_actions
  add constraint admin_actions_target_user_fkey
  foreign key (target_user) references auth.users (id) on delete set null;

commit;

notify pgrst, 'reload schema';

select 'STAP31 klaar' as resultaat,
       (select case c.confdeltype when 'n' then 'set null' when 'c' then 'cascade' else c.confdeltype::text end
          from pg_constraint c
         where c.conrelid = 'public.admin_actions'::regclass and c.conname = 'admin_actions_target_user_fkey') as bij_verwijderen;
