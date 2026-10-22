# Arquitectura de la primera entrega

React/TypeScript/Vite genera una SPA estática. MUI aporta los temas y componentes; React Router usa rutas hash para permitir recargas en GitHub Pages. React Hook Form y Zod validan los formularios. TanStack Query mantiene los datos en memoria, consulta cada minuto y actualiza las vistas después de las operaciones.

El cliente Supabase se crea solo si existe configuración pública. Login con email/contraseña y recuperación PKCE usan Supabase Auth. Por pedido del usuario del 22/10/2026, se retiró la exigencia de TOTP y su pantalla de enrolamiento. El callback de recuperación se procesa antes de iniciar el router; los enlaces deben abrirse en el navegador que solicitó el cambio. El navegador conserva la sesión de Supabase y la preferencia visual; no persiste pacientes, movimientos ni el cache de consultas. El cache se elimina al cerrar sesión.

La tabla `private.app_owner` admite exactamente una cuenta y solo la configura el administrador. `is_app_owner()` comprueba esa autorización sin devolver datos del consultorio. Tras aplicar `202610220001_password_only_access.sql`, `has_app_access()` requiere la cuenta autenticada y autorizada, sin exigir `aal2`. Todas las tablas públicas mantienen RLS de propiedad y autorización. Las vistas se ejecutan con `security_invoker`. Si el backend conserva la exigencia anterior, la app muestra que falta actualizar el acceso.

Los pacientes y el nombre del perfil admiten escrituras limitadas por columnas y RLS. Las sesiones y operaciones de dinero se escriben exclusivamente mediante RPCs transaccionales. Estas funciones comprueban la identidad, bloquean registros, validan sus entradas y generan auditoría. Ninguna operación requiere `service_role` en el frontend. Las integraciones futuras usarán Edge Functions; no se crean funciones vacías en esta entrega.

## Organización

| Ubicación | Responsabilidad |
|---|---|
| `src/features` | Inicio, acceso, pacientes, calendario, sesiones, cuentas y configuración |
| `src/components` | Layout, diálogos de operaciones, tablas y estados comunes |
| `src/lib/api.ts` | Lecturas paginadas, RPCs e invalidación de consultas |
| `src/lib/format.ts` | Importes exactos en centavos y fecha/zona horaria |
| `supabase/migrations` | Esquema, grants, RLS, vistas y transacciones versionadas |
| `.github/workflows` | Build y publicación manual de archivos estáticos |

Los importes de las vistas llegan como cadenas decimales. Los cálculos de distribución usan centavos enteros validados; los indicadores y saldos provienen del servidor. Los tiempos se guardan con zona horaria inequívoca y se muestran en Buenos Aires. El refresco periódico y al recuperar foco actualiza la elegibilidad temporal sin convertir una sesión programada en realizada automáticamente.

Las colecciones se descargan por páginas de 500 registros, evitando el límite por respuesta de Supabase. Esta primera versión prioriza el tamaño de un consultorio individual; si el historial crece mucho, agregar paginación/filtros del lado servidor sin cambiar las reglas de saldo.

## Etapas siguientes

Google Calendar se incorpora después de que la agenda local sea utilizable. Borradores fiscales, ARCA y PDF autorizado vienen después, manteniendo los cobros independientes. No hay datos fiscales obligatorios, tablas de facturas ni autorizaciones simuladas en esta entrega.

No se ejecutaron pruebas funcionales ni de base de datos por instrucción del usuario. La compilación comprueba el frontend; no demuestra las garantías de las políticas/transacciones hasta verificarlas en Supabase.

## Administración de cuentas

La extensión de usuarios reemplaza la autorización de una única propietaria por cuentas privadas con dos roles. has_app_access exige profesional activo y conserva owner_id; el administrador solo consulta su perfil y las operaciones de cuentas del backend. AuthGate consulta current_app_account y retira el acceso al detectar bloqueos. Las cuentas nuevas usan un alias interno de Auth, con usuario y contraseña en la UI. Ver docs/admin-users.md para los detalles y activación.
