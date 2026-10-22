# Administrador de usuarios

El administrador tiene un panel de Usuarios. Puede crear cuentas, restablecer sus contraseñas y habilitar o bloquear accesos. Cada profesional usa sus propios pacientes, sesiones y cobros. El administrador no accede a esas tablas ni puede crear otros administradores desde la app.

Las cuentas nuevas ingresan con **usuario y contraseña**, sin correo personal ni invitación. Para conservar Supabase Auth, se utiliza un identificador interno como `maria@accounts.consultorio.invalid`; no es un buzón y no se envían confirmaciones. La app nunca crea usuarios desde el navegador con una clave privilegiada.

## 1. Aplicar la migración

En Supabase → SQL Editor ejecutá una vez el archivo:

`supabase/migrations/202610220002_admin_users.sql`

Las dos migraciones anteriores deben estar aplicadas. La cuenta original conserva su UUID, pacientes y movimientos. Se registra como `profesional` con ingreso anterior: puede seguir usando su email habitual. Cuando el administrador le restablezca la contraseña, pasará a ingresar como `profesional` con la nueva contraseña.

## 2. Desplegar la función del servidor

Desde Supabase → Edge Functions → Deploy a new function → Via Editor:

1. Usá el nombre **admin-users**.
2. Reemplazá el código del editor por todo el contenido de `supabase/functions/admin-users/index.ts`.
3. Desplegá la función.
4. En su configuración, desactivá **Verify JWT** / **Enforce JWT verification** para usar la validación explícita implementada en el handler. La función valida el token con Supabase Auth y después exige el rol admin activo en SQL antes de hacer cualquier operación.
5. Conservá disponibles las claves de servidor que Supabase inyecta automáticamente. El handler acepta los diccionarios actuales `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS` y las claves heredadas `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. Nunca copiarlas al frontend ni al repositorio.

La función usa imports npm versionados y es autocontenida: solo hace falta copiar `index.ts`. El archivo `runtime.d.ts` se usa únicamente para comprobar tipos localmente.

Los orígenes permitidos por defecto son el GitHub Pages actual, localhost:5173 y 127.0.0.1:5173. Para otro dominio, configurá el secret `ALLOWED_ORIGINS` con una lista de orígenes separados por coma, sin rutas. CORS acompaña la validación de identidad; no la reemplaza.

Alternativa con Supabase CLI ya instalado y autenticado:

```powershell
supabase functions deploy admin-users --project-ref TU_PROJECT_REF
```

El `verify_jwt = false` específico de esta función está en `supabase/config.toml`.

Referencias: [editor del Dashboard](https://supabase.com/docs/guides/functions/quickstart-dashboard), [claves del entorno](https://supabase.com/docs/guides/functions/secrets), [creación administrativa de cuentas](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

## 3. Crear el primer administrador

En Supabase → Authentication → Users → Add user → Create new user:

- Identificador interno: **admin@accounts.consultorio.invalid**.
- Contraseña: elegí una propia de al menos 12 caracteres.
- Activá **Auto Confirm User**. No uses Invite user.

Ese identificador no requiere una casilla de correo. Después ejecutá en SQL Editor:

`supabase/setup/bootstrap_admin.sql`

El script registra esa cuenta como admin, separada de la profesional existente. No contiene contraseñas ni cambia la cuenta original.

## 4. Ingresar y administrar

Ingresá en la app como **admin** con la contraseña que elegiste. Se abrirá Usuarios.

- **Nuevo usuario:** nombre de usuario de 3–32 caracteres, nombre para mostrar y contraseña de 12–128 caracteres. Se admiten letras minúsculas, números, punto, guion y guion bajo.
- **Quitar acceso:** el servidor bloquea el acceso a los datos inmediatamente, incluso para tokens que aún no vencieron. La app vuelve a comprobar el acceso cada 30 segundos mientras está visible y al recuperar foco; si detecta un bloqueo, retira las pantallas y limpia el cache.
- **Habilitar:** reactiva la misma cuenta con su historial.
- **Contraseña:** establece otra contraseña y la compartís directamente con el usuario. No se usa recuperación por correo para estas cuentas.

Bloquear no borra la cuenta ni sus datos. La sesión de Auth puede seguir siendo válida, pero ya no autoriza operaciones del consultorio. No se agregaron borrado físico, roles configurables, edición de permisos ni acceso del admin a pacientes.

## Reglas y límites

Las cuentas/roles y su auditoría viven en el esquema privado. Los usuarios no pueden cambiar su rol ni habilitarse. Las RPCs administrativas solo admiten `service_role`; la función del servidor identifica al actor mediante un token verificado, valida las entradas con Zod y vuelve a comprobar su autorización en SQL.

Las altas conservan una clave de solicitud para recuperar una respuesta ambigua sin crear otra cuenta. La creación en Auth y su registro en PostgreSQL no son una transacción única: si se interrumpe el alta, reintentá los mismos datos desde el diálogo. No se guardan contraseñas en tablas, logs, localStorage ni el cache de consultas.

El frontend conserva compatibilidad con la cuenta original si todavía falta aplicar esta migración. Un admin no podrá ingresar hasta completar migración, función y configuración inicial.

Por pedido del usuario no se escribieron ni ejecutaron tests. Se comprueban los tipos del frontend y del handler; el build no reemplaza la verificación en Supabase. La activación y validación real quedan pendientes mientras no exista conexión administrativa al proyecto.
