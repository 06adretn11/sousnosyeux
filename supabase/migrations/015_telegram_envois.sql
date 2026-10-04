-- 015 — mémoire minimale des envois Telegram (AUTONOMOUS LOOP V1).
-- Une ligne = un message déjà envoyé. Sert uniquement à ne pas renvoyer le même
-- message à chaque cycle : (kind, cle) = (info|decision, proposal_id).
-- Additive et idempotente.
create table if not exists telegram_envois (
  kind        text        not null check (kind in ('info', 'decision')),
  cle         text        not null,
  message_id  bigint,
  sent_at     timestamptz not null default now(),
  primary key (kind, cle)
);
