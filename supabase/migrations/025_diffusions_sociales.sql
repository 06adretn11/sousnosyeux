-- =====================================================================
-- 025 — Journal de diffusion sociale (Buffer → X, Facebook, Instagram)
--
-- Additive et idempotente. Aucune instruction destructrice. Le code qui l'utilise se déploie AVANT elle et reste
-- DÉSACTIVÉ tant qu'elle n'est pas appliquée (scripts/diffuser-social.mjs vérifie la présence de la table : sans elle, il ne publie rien).
--
-- Une ligne = UNE diffusion d'UN événement sur UN canal. La clé primaire (event_key, canal) porte l'idempotence : la ligne est
-- RÉSERVÉE (etat = 'reserve') AVANT tout appel à Buffer ; un rejeu, un retry ou deux passages simultanés tombent sur la même ligne.
-- Buffer n'offre aucune clé d'idempotence : une ligne « reserve » sans buffer_post_id signifie « réponse incertaine » → on RÉCONCILIE
-- avec l'état distant avant toute nouvelle tentative (jamais de second createPost à l'aveugle).
--
-- États :  reserve (réservée, appel non confirmé) · soumis (Buffer a accepté, id reçu) · programme (en file chez Buffer)
--          envoye (Buffer annonce « sent ») · verifie (permalien distant relu) · annule (annulée avant envoi)
--          echec (refus ou erreur définitive, cause consignée) · retire_apres_envoi (déjà publiée, retrait demandé : action humaine)
-- Aucun contenu éditorial hors le texte publié (public par nature) ; jamais de jeton, jamais de clé d'API.
-- =====================================================================
create table if not exists diffusions_sociales (
  event_key     text        not null,
  canal         text        not null check (canal in ('x', 'facebook', 'instagram')),
  type_event    text        not null check (type_event in ('new_case', 'case_update')),
  case_id       text        not null,
  etat          text        not null check (etat in ('reserve', 'soumis', 'programme', 'envoye', 'verifie', 'annule', 'echec', 'retire_apres_envoi')),
  texte         text,
  buffer_post_id text,
  soumis_at     timestamptz,
  envoye_at     timestamptz,
  permalien     text,
  erreur        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (event_key, canal)
);
create index if not exists idx_diffusions_sociales_case on diffusions_sociales (case_id);
create index if not exists idx_diffusions_sociales_etat on diffusions_sociales (etat) where etat in ('reserve', 'soumis', 'programme', 'envoye');

comment on table diffusions_sociales is
  'Journal de diffusion sociale : une ligne par (événement, canal). Réservée AVANT l''appel Buffer (idempotence), l''état distant est relu avant toute répétition.';
