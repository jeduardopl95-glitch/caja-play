# Caducidades

1. Reactiva o selecciona un proyecto de Supabase y aplica la migración de este directorio.
2. Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en el entorno de Vite. No uses una clave de servicio en el cliente.
3. Crea o invita las cuentas de los empleados en Authentication. El módulo no incluye registro público.
4. Asigna cada sucursal desde el editor SQL con el UUID real de la cuenta:

```sql
insert into public.caducidad_accesos (usuario, sucursal)
values ('UUID-DE-LA-CUENTA', 'CHETUMALITO')
on conflict do nothing;
```

Agrega una fila por sucursal autorizada. Comprueba con dos cuentas que cada una solo pueda leer y editar registros de sus sucursales y que una sesión anónima no tenga acceso.
