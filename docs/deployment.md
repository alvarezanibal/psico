# Configuración y operación

## Supabase y acceso

Aplicá ambas migraciones en orden y habilitá la única cuenta siguiendo README.md. Si ya aplicaste la inicial, ejecutá solo `202610220001_password_only_access.sql` para permitir el ingreso sin TOTP. Solo `public` debe exponerse mediante Data API para la aplicación; mantené `private` fuera de la API. Deshabilitá signup y configurá la contraseña mínima de la cuenta en 12 caracteres o más. No crees pacientes hasta terminar el aprovisionamiento.

En Authentication → URL Configuration configurá:

- Desarrollo: Site URL `http://localhost:5173`; Redirect URLs `http://localhost:5173/` y `http://localhost:5173/?recovery=1`.
- Si elegís `127.0.0.1`, usá ese origen en todos los pasos y agregá sus dos URLs equivalentes.
- Producción: Site URL `https://USUARIO.github.io/REPOSITORIO/`; Redirect URLs de esa raíz y `https://USUARIO.github.io/REPOSITORIO/?recovery=1`.

Las URLs de recuperación apuntan a la raíz estática, sin fragmento de router. El SDK intercambia el código PKCE y luego abre las rutas `#/`. Solicitá y abrí la recuperación en el mismo navegador. Configurá un proveedor de correo propio y comprobá la entrega antes de depender de este flujo en producción.

El archivo `supabase/config.toml` corresponde al desarrollo opcional mediante CLI; no configura automáticamente el proyecto alojado. El desarrollo normal del frontend puede usar Supabase remoto sin Docker.

## GitHub Pages

1. Creá un repositorio y subí el código, incluyendo `pnpm-lock.yaml`; excluí `.env.local`, credenciales y backups.
2. En Settings → Pages elegí GitHub Actions como origen.
3. En Settings → Secrets and variables → Actions → Variables agregá `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_BASE_PATH` (`/REPOSITORIO/`; `/` para dominio propio o repositorio raíz).
4. Ejecutá manualmente **Deploy Consultorio** desde Actions. El workflow instala el lockfile, compila y publica `dist`; no ejecuta tests ni aplica SQL.
5. Configurá las URLs de Auth con el dominio definitivo. Verificá acceso con email/contraseña, recuperación y recarga de una ruta como `/REPOSITORIO/#/pacientes` antes de usar datos reales.

Solo la URL y clave pública de Supabase se incluyen en el bundle. Los datos están protegidos por Auth/RLS del servidor. Las referencias del workflow siguen la [guía oficial de Vite para Pages](https://vite.dev/guide/static-deploy.html#github-pages).

## Recuperación de acceso

La profesional debe conservar acceso al email de recuperación. Desde “Olvidé mi contraseña” puede solicitar un enlace y abrirlo en el mismo navegador. Si pierde también el email, la recuperación requiere intervención administrativa y comprobación de identidad. El acceso actual no solicita vincular un autenticador.

Las claves de administración y contraseñas de base de datos se guardan en un gestor de secretos. Ante exposición, rotarlas en Supabase y revocar las sesiones afectadas. Cambiar una clave pública o dominio requiere actualizar las variables y reconstruir el frontend.

## Respaldo y restauración

Responsable inicial: quien administra Supabase. Antes de datos reales, elegir almacenamiento cifrado fuera del repositorio, frecuencia diaria y retención inicial sugerida de 30 días; confirmar la retención definitiva según el uso real. Confirmar qué backups ofrece el plan contratado y no asumir que un plan gratuito incluye restauración automática.

Con Supabase CLI, Docker y `psql` disponibles, usar el procedimiento oficial para un respaldo lógico completo. Guardar las URLs de conexión en variables temporales, sin imprimirlas ni incorporarlas al código. Desde una carpeta cifrada de backups, con `$env:CONSULTORIO_SOURCE_DB_URL` ya definida:

```powershell
supabase db dump --db-url $env:CONSULTORIO_SOURCE_DB_URL --role-only -f roles.sql
supabase db dump --db-url $env:CONSULTORIO_SOURCE_DB_URL -f schema.sql
supabase db dump --db-url $env:CONSULTORIO_SOURCE_DB_URL --data-only --use-copy -f data.sql
```

Restaurar únicamente en un **proyecto nuevo y vacío**, con `$env:CONSULTORIO_RESTORE_DB_URL` definida para ese destino:

```powershell
psql --dbname $env:CONSULTORIO_RESTORE_DB_URL --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command "SET session_replication_role = replica" --file data.sql
```

Conservar identidades de Auth y la fila de `private.app_owner`; revisar la configuración Auth y correo en el destino. Si se usa historial de migraciones del CLI, respaldarlo/restaurarlo también según la [guía oficial de backup/restauración](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Revisar las exclusiones/versiones de la guía para el proyecto concreto. La primera entrega no usa Vault ni Storage.

Ensayar la restauración con datos sintéticos y contrastar pacientes, sesiones, recibos, asignaciones y saldos antes de depender del respaldo. **Este procedimiento no se ejecutó en esta sesión** y requiere validar el entorno de destino. No restaurar encima del proyecto operativo.

## Estado de entrega

Código y configuración preparados localmente. Pendiente: aprovisionar Supabase, aplicar SQL, comprobar acceso y flujos reales, ejecutar recuperación/restauración y publicar cuando corresponda. Google Calendar, ARCA, PDFs y sus secretos no están habilitados.
