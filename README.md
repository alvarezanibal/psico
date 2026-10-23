# Consultorio

Aplicación publicada: https://alvarezanibal.github.io/psico/
Repositorio: https://github.com/alvarezanibal/psico

Aplicación de consultorio con cuentas profesionales y un administrador de accesos: pacientes, agenda local, sesiones, deudas y pagos parciales o agrupados. Interfaz en español argentino con temas claro y oscuro. Google Calendar y facturación ARCA quedan para las siguientes etapas.

## Desarrollo local

Requisitos: Node.js 22.12 o superior (recomendado: 24), pnpm 11.9 y un proyecto Supabase PostgreSQL 15 o superior.

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

Completá en `.env.local` la URL de Supabase y su **clave pública publishable**. La clave `anon` pública heredada también funciona en ese campo. No uses `service_role`, una clave secret ni la contraseña de la base de datos.

Sin configuración, se muestra una guía de instalación; no se crean pacientes o pagos de ejemplo. La agenda y las cuentas usan datos reales de Supabase.

## Preparar Supabase

1. En el SQL Editor, ejecutá las migraciones en orden: primero `supabase/migrations/202610210001_core.sql` y después `supabase/migrations/202610220001_password_only_access.sql`. Si ya aplicaste la primera, ejecutá solo la segunda. Alternativamente, usá migraciones con Supabase CLI.
2. En Authentication, deshabilitá **Allow new users to sign up** y habilitá email/contraseña. Creá manualmente una usuaria con email confirmado y contraseña segura. Por pedido del usuario, TOTP no es requisito de acceso por ahora.
3. Copiá su UUID de Authentication → Users. Reemplazá `USER_UUID` en este SQL y ejecutalo como administrador en SQL Editor:

```sql
begin;
insert into private.app_owner(singleton, user_id)
values (true, 'USER_UUID'::uuid);
insert into public.profiles(user_id, display_name)
values ('USER_UUID'::uuid, 'Mi consultorio');
commit;
```

4. Configurá las URLs de acceso/recuperación según [docs/deployment.md](docs/deployment.md). En local usá siempre el mismo origen (`localhost` o `127.0.0.1`).
5. Ingresá con el email y contraseña de la cuenta creada. La segunda migración permite ese acceso manteniendo la autorización de la única propietaria y las políticas RLS. Si aparece “Actualizá el acceso”, falta aplicar esa migración.

La aplicación no ofrece registro público ni perfiles clínicos. El administrador crea y gestiona cuentas desde un panel separado. Cada profesional conserva sus propios datos.

Para activar el administrador aplicá la tercera migración, desplegá la función admin-users y creá la cuenta inicial siguiendo [docs/admin-users.md](docs/admin-users.md). No hace falta correo personal para las cuentas nuevas.

## Funciones incluidas

- Inicio: agenda del día, deuda total, pacientes deudores, sesiones pendientes y cobrado del mes.
- Pacientes: alta, edición, búsqueda, archivo/reactivación, honorario/duración habituales e historial.
- Calendario: día, semana y mes; alta/reprogramación de turnos y aviso de superposición.
- Sesiones: estados programada/realizada/cancelada/ausente, filtros y estado de cobro independiente.
- Cuentas: sesiones cobrables, pagos parciales o agrupados, distribución por antigüedad, historial y reversión con motivo.
- Configuración: nombre del consultorio, tema y cuenta privada.

Los cambios de tarifa no alteran sesiones existentes. Las sesiones futuras no generan deuda; cancelaciones y ausencias solo generan un cargo cuando se lo registra explícitamente. No se admiten anticipos/excedentes. La reversión corrige un pago mal registrado y recalcula el mes original; no representa una devolución de dinero.

## Verificación y estado

```powershell
pnpm typecheck
pnpm build
```

Por pedido del usuario, **no se escribieron ni ejecutaron tests**. El build incluye la comprobación de TypeScript del frontend y de la función administrativa. No hay framework, scripts ni dependencias de testing.

El código de las fases 1–2 está implementado. El usuario creó su proyecto Supabase y configuró `.env.local`. La actualización de acceso debe aplicarse manualmente en ese proyecto; las políticas RLS y transacciones no se verificaron desde este entorno. Tampoco se verificaron en vivo recuperación, backup/restauración ni flujos de cobro. El sitio está publicado en GitHub Pages.

Antes de usar datos reales, completá la configuración y las verificaciones de acceso, dinero y recuperación pendientes. Los criterios de aceptación que dependen de Supabase permanecen pendientes; compilar el frontend no los acredita.

## Documentación

- [Administrador y usuarios sin correo](docs/admin-users.md)
- [Arquitectura](docs/architecture.md)
- [Base de datos y reglas de dinero](docs/database.md)
- [Despliegue, recuperación y backups](docs/deployment.md)
- [Especificación](SPEC.md) y [plan/progreso](IMPLEMENTATION_PLAN_SOL_6_1.md)

El workflow de GitHub Pages se ejecuta manualmente desde Actions después de configurar el repositorio y las variables públicas. No aplica migraciones automáticamente.

Apple Calendar: [activación y suscripción](docs/apple-calendar.md).
