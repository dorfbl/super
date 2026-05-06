-- Run this once in the Supabase SQL editor.

create table if not exists users (
  phone text primary key,
  name text,
  created_at timestamptz default now()
);

create table if not exists items (
  id bigserial primary key,
  canonical_he text unique not null,
  canonical_en text,
  category text not null,
  aliases text[] not null default '{}',
  created_at timestamptz default now()
);
create index if not exists items_aliases_gin on items using gin (aliases);

create table if not exists lists (
  id bigserial primary key,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz default now(),
  archived_at timestamptz
);
-- At most one active list at a time.
create unique index if not exists lists_one_active on lists(status) where status = 'active';

create table if not exists list_items (
  id bigserial primary key,
  list_id bigint not null references lists(id) on delete cascade,
  item_id bigint not null references items(id),
  raw_text text not null,
  note text,
  added_by text references users(phone),
  bought boolean not null default false,
  added_at timestamptz default now(),
  bought_at timestamptz
);
create index if not exists list_items_list_idx on list_items(list_id);
create index if not exists list_items_item_idx on list_items(item_id);

create table if not exists purchases (
  id bigserial primary key,
  item_id bigint not null references items(id),
  list_id bigint references lists(id),
  purchased_at timestamptz default now()
);
create index if not exists purchases_item_idx on purchases(item_id);
create index if not exists purchases_at_idx on purchases(purchased_at);

create table if not exists settings (
  key text primary key,
  value text
);

create table if not exists snoozes (
  item_id bigint primary key references items(id) on delete cascade,
  until timestamptz not null
);
