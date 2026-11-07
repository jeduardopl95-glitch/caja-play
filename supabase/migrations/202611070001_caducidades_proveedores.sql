alter table public.caducidades
  add column departamento text,
  add column proveedor text;

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('catalogo', 'catalogo', true, array['text/csv', 'application/vnd.ms-excel'])
on conflict (id) do nothing;
