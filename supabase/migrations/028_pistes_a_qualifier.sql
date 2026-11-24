-- =====================================================================
-- 028 — Pistes à qualifier (veille des comptes Instagram suivis, PILOTE)
--
-- Additive et idempotente. Aucune instruction destructrice.
-- Le code qui l'utilise (maintenance-cycle --instagram-pilote ; telegram-v0 notifier-pistes) vérifie la présence de la table :
-- sans elle, il n'écrit et n'envoie rien.
--
-- Une ligne = UNE publication d'un compte suivi qui porte une action ou une déclaration PUBLIQUE CONCRÈTE à qualifier par un humain.
-- DÉLIBÉRÉMENT SANS case_id : une piste n'est rattachée à aucune affaire ; elle ne modifie aucune fiche, aucun statut.
-- DEUX PORTÉES DISTINCTES : le compte (acteur) et la publication. `territoire` est le territoire NOMMÉ DANS LE TEXTE de la publication, JAMAIS celui du compte :
-- il est donc NULLABLE (une piste thématique n'a aucun territoire). `destination` = destination proposée d'après le texte :
--   HUB (un territoire est nommé ; `hub_id` si un hub le couvre, sinon NULL) · THEMATIQUE (aucun territoire dans le texte).
-- Le texte conservé est un extrait court (≤ 300 caractères), jamais la légende entière ; il est VIDÉ (extrait = null) dès que la piste a été notifiée
-- (minimisation : il peut citer des tiers). Restent l'adresse de la publication, l'auteur, la date, le motif et le motif du classement.
-- =====================================================================
create table if not exists pistes_a_qualifier (
  piste_id     text        primary key,                 -- empreinte (adresse de la publication + état du texte)
  doc_key      text        not null,                    -- clé de la mémoire source_resolutions
  emetteur     text        not null,                    -- auteur : le compte
  compte_url   text,
  url          text        not null,                    -- adresse de la publication
  publie_le    date,
  motif        text        not null,                    -- code d'un vocabulaire fermé (voir lib/pistes-a-qualifier.mjs)
  destination  text        not null check (destination in ('HUB', 'THEMATIQUE')),
  territoire   text,                                    -- NOMMÉ DANS LE TEXTE de la publication ; NULL pour une piste thématique
  hub_id       text,                                    -- hub qui couvre ce territoire, sinon NULL
  classement   text,                                    -- motif du classement (lisible)
  extrait      text,
  decouvert_le date        not null default ((now() at time zone 'Europe/Paris')::date),
  envoyee_le   timestamptz,                             -- posée avec le message : une piste n'est notifiée qu'une fois
  message_id   bigint,
  created_at   timestamptz not null default now()
);

create index if not exists idx_pistes_a_qualifier_attente on pistes_a_qualifier (decouvert_le) where envoyee_le is null;

comment on table pistes_a_qualifier is
  'Actions et déclarations publiques concrètes de comptes suivis, à qualifier par un humain. Aucune affaire (pas de case_id), aucune fiche, aucun statut. Territoire = celui du TEXTE, pas celui du compte. Notification groupée.';

alter table pistes_a_qualifier enable row level security;
