-- Brain – Datenbank für den Abgleich zwischen Geräten.
-- Eine Tabelle für alles: To-dos, Kategorien, Personen, Projekte.
-- Jede Zeile gehört genau einem Konto; niemand sieht fremde Zeilen (Row Level Security).

create table if not exists public.items (
  id          uuid        not null,
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text        not null check (kind in ('todos', 'cats', 'people', 'projects')),
  data        jsonb       not null default '{}'::jsonb,
  updated_at  bigint      not null,                      -- Zeitstempel des Geräts (ms)
  deleted     boolean     not null default false,        -- Löschmarke statt echtem Löschen
  synced_at   timestamptz not null default now(),        -- Servermarke: was ist neu für andere Geräte
  primary key (user_id, id)                             -- je Konto ein eigener Nummernkreis
);

-- Nachtrag für bestehende Projekte: Primärschlüssel auf (user_id, id) umstellen
alter table public.items drop constraint if exists items_pkey;
alter table public.items add primary key (user_id, id);

alter table public.items enable row level security;

drop policy if exists items_select on public.items;
drop policy if exists items_insert on public.items;
drop policy if exists items_update on public.items;
create policy items_select on public.items for select using (auth.uid() = user_id);
create policy items_insert on public.items for insert with check (auth.uid() = user_id);
create policy items_update on public.items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists items_user_sync_idx on public.items (user_id, synced_at);

-- Der jüngere Stand gewinnt: ältere Uploads werden still verworfen.
create or replace function public.items_lww() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.synced_at := now();
  return new;
end $$;

drop trigger if exists items_lww_trg on public.items;
create trigger items_lww_trg before insert or update on public.items
  for each row execute function public.items_lww();
