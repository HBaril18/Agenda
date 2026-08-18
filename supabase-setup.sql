create table if not exists public.login_security (
  email text primary key,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.login_security enable row level security;
revoke all on table public.login_security from anon, authenticated;

-- La fonction Edge utilise la service role, qui peut gérer cette table privée.
-- Aucun accès direct depuis le navigateur n'est accordé.
