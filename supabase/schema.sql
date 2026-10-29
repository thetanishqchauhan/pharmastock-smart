-- PharmaStock Smart — Supabase / PostgreSQL schema
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

create extension if not exists pgcrypto;

-- ---------- Tenancy ----------
create table if not exists pharmacies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists pharmacy_members (
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (pharmacy_id, user_id)
);

create table if not exists settings (
  pharmacy_id uuid primary key references pharmacies(id) on delete cascade,
  expiry_window_days int not null default 90 check (expiry_window_days between 1 and 730),
  lookback_days int not null default 30 check (lookback_days between 1 and 365),
  cover_days int not null default 15 check (cover_days between 0 and 180),
  default_lead_time_days int not null default 3 check (default_lead_time_days between 0 and 90)
);

-- ---------- Inventory ----------
create table if not exists medicines (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  strength text,
  dosage_form text,
  manufacturer text,
  unit text not null default 'unit',
  min_stock int not null default 0 check (min_stock >= 0),
  safety_stock int not null default 0 check (safety_stock >= 0),
  lead_time_days int check (lead_time_days >= 0),
  created_at timestamptz not null default now(),
  unique (id, pharmacy_id)
);
create unique index if not exists medicines_unique_name
  on medicines (pharmacy_id, lower(trim(name)), lower(coalesce(trim(strength), '')));

create table if not exists batches (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  medicine_id uuid not null,
  batch_number text not null check (length(trim(batch_number)) > 0),
  expiry_date date not null,
  purchase_price numeric(12, 2) check (purchase_price >= 0),
  mrp numeric(12, 2) check (mrp >= 0),
  created_at timestamptz not null default now(),
  unique (id, pharmacy_id),
  unique (medicine_id, batch_number),
  foreign key (medicine_id, pharmacy_id) references medicines(id, pharmacy_id) on delete restrict
);

-- Append-only ledger: stock balance = sum(quantity) per batch.
create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  batch_id uuid not null,
  type text not null check (type in (
    'opening', 'purchase', 'customer_return', 'sale', 'supplier_return',
    'expired_removal', 'damage', 'adjustment', 'snapshot')),
  quantity int not null check (quantity <> 0),
  reason text,
  reference text,
  occurred_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (batch_id, pharmacy_id) references batches(id, pharmacy_id) on delete restrict,
  check (
    (type in ('opening', 'purchase', 'customer_return') and quantity > 0) or
    (type in ('sale', 'supplier_return', 'expired_removal', 'damage') and quantity < 0) or
    (type in ('adjustment', 'snapshot') and coalesce(length(trim(reason)), 0) > 0)
  )
);
create index if not exists stock_movements_batch_idx on stock_movements (batch_id);
create index if not exists stock_movements_pharmacy_time_idx on stock_movements (pharmacy_id, occurred_at);

create or replace view batch_stock with (security_invoker = true) as
  select b.*, coalesce(sum(m.quantity), 0)::int as quantity
  from batches b left join stock_movements m on m.batch_id = b.id
  group by b.id;

-- Guard: no negative batch balances, no sales from expired batches.
create or replace function check_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_balance int;
  v_expiry date;
begin
  select expiry_date into v_expiry from batches where id = new.batch_id for update;
  select coalesce(sum(quantity), 0) into v_balance from stock_movements where batch_id = new.batch_id;
  if v_balance + new.quantity < 0 then
    raise exception 'Stock for this batch would become negative (current %, change %)', v_balance, new.quantity;
  end if;
  if new.type = 'sale' and v_expiry < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Cannot record a sale from an expired batch';
  end if;
  return new;
end $$;

drop trigger if exists stock_movement_guard on stock_movements;
create trigger stock_movement_guard before insert on stock_movements
  for each row execute function check_stock_movement();

-- ---------- Security (Row Level Security) ----------
create or replace function is_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pharmacy_members where pharmacy_id = p and user_id = auth.uid());
$$;

create or replace function create_pharmacy(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into pharmacies (name) values (p_name) returning id into v_id;
  insert into pharmacy_members (pharmacy_id, user_id, role) values (v_id, auth.uid(), 'owner');
  insert into settings (pharmacy_id) values (v_id);
  return v_id;
end $$;
revoke all on function create_pharmacy(text) from public, anon;
grant execute on function create_pharmacy(text) to authenticated;

alter table pharmacies enable row level security;
alter table pharmacy_members enable row level security;
alter table settings enable row level security;
alter table medicines enable row level security;
alter table batches enable row level security;
alter table stock_movements enable row level security;

drop policy if exists "members read pharmacy" on pharmacies;
create policy "members read pharmacy" on pharmacies for select using (is_member(id));

drop policy if exists "read own memberships" on pharmacy_members;
create policy "read own memberships" on pharmacy_members for select using (user_id = auth.uid());

drop policy if exists "members manage settings" on settings;
create policy "members manage settings" on settings for all using (is_member(pharmacy_id)) with check (is_member(pharmacy_id));

drop policy if exists "members read medicines" on medicines;
create policy "members read medicines" on medicines for select using (is_member(pharmacy_id));
drop policy if exists "members add medicines" on medicines;
create policy "members add medicines" on medicines for insert with check (is_member(pharmacy_id));
drop policy if exists "members edit medicines" on medicines;
create policy "members edit medicines" on medicines for update using (is_member(pharmacy_id)) with check (is_member(pharmacy_id));

drop policy if exists "members read batches" on batches;
create policy "members read batches" on batches for select using (is_member(pharmacy_id));
drop policy if exists "members add batches" on batches;
create policy "members add batches" on batches for insert with check (is_member(pharmacy_id));

-- Movements are append-only: no update or delete policies.
drop policy if exists "members read movements" on stock_movements;
create policy "members read movements" on stock_movements for select using (is_member(pharmacy_id));
drop policy if exists "members add movements" on stock_movements;
create policy "members add movements" on stock_movements for insert
  with check (is_member(pharmacy_id) and (created_by is null or created_by = auth.uid()));
