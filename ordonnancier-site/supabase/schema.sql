-- Schéma de la base Supabase de l'Ordonnancier (appliqué sur le projet « ordonnancier », région Paris).
create extension if not exists unaccent with schema extensions;

-- Référentiel des médecins (annuaire santé, RPPS) : jamais lisible directement par l'API
create table public.rpps_medecins (
  rpps text primary key check (rpps ~ '^[0-9]{11}$'),
  nom text not null,
  prenom text not null
);
alter table public.rpps_medecins enable row level security;

-- Profil vérifié de chaque médecin inscrit
create table public.profils (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rpps text not null unique,
  nom text not null,
  prenom text not null,
  created_at timestamptz not null default now()
);
alter table public.profils enable row level security;
create policy "profil lisible par son titulaire" on public.profils for select to authenticated using (user_id = (select auth.uid()));

-- Données de l'application, séparées par médecin
create table public.documents (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  collection text not null check (collection in ('patients', 'meds', 'modeles', 'ordos')),
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, id)
);
alter table public.documents enable row level security;
create policy "documents du medecin" on public.documents for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.reglages (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.reglages enable row level security;
create policy "reglages du medecin" on public.reglages for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.norm_txt(t text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(lower(extensions.unaccent(coalesce(t, ''))), '[^a-z]', '', 'g')
$$;
create or replace function public.nom_correspond(ref text, saisi text) returns boolean
language sql immutable set search_path = '' as $$
  select public.norm_txt(saisi) <> '' and (
    public.norm_txt(ref) = public.norm_txt(saisi)
    or public.norm_txt(saisi) in (select public.norm_txt(w) from regexp_split_to_table(ref, '[^[:alpha:]]+') w)
  )
$$;

-- Vérification avant inscription : ok, format, inconnu, nom_different, deja_utilise
create or replace function public.verifier_rpps(p_rpps text, p_nom text, p_prenom text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare r public.rpps_medecins;
begin
  if coalesce(p_rpps, '') !~ '^[0-9]{11}$' then return 'format'; end if;
  select * into r from public.rpps_medecins where rpps = p_rpps;
  if not found then return 'inconnu'; end if;
  if exists (select 1 from public.profils where rpps = p_rpps) then return 'deja_utilise'; end if;
  if not public.nom_correspond(r.nom, p_nom)
     or not public.nom_correspond(r.prenom, split_part(trim(coalesce(p_prenom, '')), ' ', 1)) then
    return 'nom_different';
  end if;
  return 'ok';
end $$;
revoke all on function public.verifier_rpps(text, text, text) from public;
grant execute on function public.verifier_rpps(text, text, text) to anon, authenticated;

-- Contrôle imposé par le serveur à chaque création de compte
create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); v text; r public.rpps_medecins;
begin
  v := public.verifier_rpps(m->>'rpps', m->>'nom', m->>'prenom');
  if v <> 'ok' then raise exception 'Inscription refusée : RPPS %', v; end if;
  select * into r from public.rpps_medecins where rpps = m->>'rpps';
  insert into public.profils (user_id, rpps, nom, prenom) values (new.id, r.rpps, r.nom, r.prenom);
  return new;
end $$;
revoke all on function public.creer_profil() from public, anon, authenticated;
create trigger creer_profil_medecin after insert on auth.users for each row execute function public.creer_profil();

-- Administration de la plateforme
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mdp_a_changer boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- Un compte créé côté serveur avec app_metadata.ordo_role = 'admin' n'est pas un compte médecin
create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); v text; r public.rpps_medecins;
begin
  if coalesce(new.raw_app_meta_data->>'ordo_role', '') = 'admin' then return new; end if;
  v := public.verifier_rpps(m->>'rpps', m->>'nom', m->>'prenom');
  if v <> 'ok' then raise exception 'Inscription refusée : RPPS %', v; end if;
  select * into r from public.rpps_medecins where rpps = m->>'rpps';
  insert into public.profils (user_id, rpps, nom, prenom) values (new.id, r.rpps, r.nom, r.prenom);
  return new;
end $$;

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
$$;
create or replace function public.admin_etat() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('admin', true, 'mdp_a_changer', a.mdp_a_changer) from public.admins a where a.user_id = (select auth.uid())
$$;
create or replace function public.admin_mot_de_passe_change() returns void
language sql security definer set search_path = '' as $$
  update public.admins set mdp_a_changer = false where user_id = (select auth.uid())
$$;

-- Liste des médecins inscrits : identité, compte et volumes, sans aucune donnée patient
create or replace function public.admin_medecins()
returns table (user_id uuid, rpps text, nom text, prenom text, email text, inscrit_le timestamptz, email_confirme boolean,
  derniere_connexion timestamptz, suspendu boolean, specialite text, ville text, configure boolean, nb_patients bigint, nb_ordonnances bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'Accès réservé à l''administrateur';
  end if;
  return query
  select p.user_id, p.rpps, p.nom, p.prenom, u.email::text, u.created_at, u.email_confirmed_at is not null,
    u.last_sign_in_at, coalesce(u.banned_until > now(), false), r.data->>'specialite', r.data->>'ville',
    coalesce((r.data->>'configured')::boolean, false),
    (select count(*) from public.documents d where d.user_id = p.user_id and d.collection = 'patients'),
    (select count(*) from public.documents d where d.user_id = p.user_id and d.collection = 'ordos')
  from public.profils p
  join auth.users u on u.id = p.user_id
  left join public.reglages r on r.user_id = p.user_id
  order by u.created_at desc;
end $$;

-- Suspendre ou réactiver un compte médecin (bloque la connexion)
create or replace function public.admin_suspendre(p_user uuid, p_suspendre boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'Accès réservé à l''administrateur';
  end if;
  if not exists (select 1 from public.profils where user_id = p_user) then raise exception 'Médecin introuvable'; end if;
  update auth.users set banned_until = case when p_suspendre then '2999-12-31 00:00:00+00'::timestamptz else null end where id = p_user;
end $$;

revoke all on function public.creer_profil() from public, anon, authenticated;
revoke all on function public.est_admin() from public, anon;
revoke all on function public.admin_etat() from public, anon;
revoke all on function public.admin_mot_de_passe_change() from public, anon;
revoke all on function public.admin_medecins() from public, anon;
revoke all on function public.admin_suspendre(uuid, boolean) from public, anon;
grant execute on function public.est_admin() to authenticated;
grant execute on function public.admin_etat() to authenticated;
grant execute on function public.admin_mot_de_passe_change() to authenticated;
grant execute on function public.admin_medecins() to authenticated;
grant execute on function public.admin_suspendre(uuid, boolean) to authenticated;
