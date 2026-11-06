create table public.caducidad_accesos (
  usuario uuid not null references auth.users(id) on delete cascade,
  sucursal text not null check (sucursal in ('CHETUMALITO', 'JUNIOR')),
  primary key (usuario, sucursal)
);

create table public.caducidades (
  id uuid primary key default gen_random_uuid(),
  sucursal text not null check (sucursal in ('CHETUMALITO', 'JUNIOR')),
  producto text not null check (length(btrim(producto)) between 1 and 200),
  codigo text,
  fecha date not null,
  cantidad integer not null check (cantidad > 0),
  resuelto boolean not null default false
);

alter table public.caducidad_accesos enable row level security;
alter table public.caducidades enable row level security;

revoke all on public.caducidad_accesos, public.caducidades from anon, authenticated;
grant select on public.caducidad_accesos to authenticated;
grant select, insert on public.caducidades to authenticated;
grant update (resuelto) on public.caducidades to authenticated;

create policy "Consultar sucursales propias" on public.caducidad_accesos
  for select to authenticated using (usuario = (select auth.uid()));

create policy "Gestionar caducidades de sucursales asignadas" on public.caducidades
  for all to authenticated
  using (sucursal in (select sucursal from public.caducidad_accesos where usuario = (select auth.uid())))
  with check (sucursal in (select sucursal from public.caducidad_accesos where usuario = (select auth.uid())));

create index caducidades_sucursal_fecha_idx on public.caducidades (sucursal, fecha);
