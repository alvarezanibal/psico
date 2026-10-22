# SPEC.md — Gestión de Consultorio Psicológico

**Versión:** 1.4
**Estado:** Especificación para implementación  
**Idioma:** Español (Argentina)  
**Alcance actual:** Usuarios profesionales con datos separados y un administrador dedicado a crear y habilitar/bloquear cuentas. Acceso por usuario y contraseña, sin correo para las cuentas nuevas. Facturación ARCA en una etapa posterior.

## 1. Objetivo

Construir una herramienta de uso diario para profesionales de psicología, con cuentas separadas y un administrador de accesos. Su propósito principal es reducir el trabajo administrativo para saber quién debe, cuánto debe y cómo está organizada su agenda.

**Primera entrega utilizable:**

- Identificar rápidamente pacientes deudores, sesiones impagas y saldos pendientes.
- Registrar cobros completos y parciales con pocos pasos.
- Planificar, consultar y reprogramar turnos en una agenda propia.
- Gestionar pacientes y sus tarifas.
- Registrar sesiones realizadas, canceladas o pendientes.

**Etapas posteriores:**

- Integrar eventos de Google Calendar para facilitar la planificación, manteniendo la agenda local independiente.
- Emitir comprobantes electrónicos individuales o agrupados mediante ARCA (Argentina).
- Consultar y descargar comprobantes autorizados.

La primera entrega debe poder usarse sin Google Calendar ni configuración fiscal. ARCA se incorpora después de resolver deudas, cobros y planificación; sus requisitos pendientes no bloquean esa entrega.

La aplicación debe ser **simple, agradable, segura, responsive y de bajo costo**, con temas claro y oscuro. No implementar historia clínica ni notas terapéuticas en este MVP.

## 2. Stack y arquitectura

| Capa | Tecnología | Observaciones |
|---|---|---|
| Frontend | React + TypeScript + Vite | SPA desplegada en GitHub Pages |
| UI | Material UI (MUI) | Temas personalizados claro y oscuro |
| Datos y formularios | TanStack Query, React Hook Form, Zod | Validación en cliente y servidor |
| Navegación | React Router o TanStack Router | Resolver recargas de rutas en GitHub Pages |
| Backend | Supabase Edge Functions | Integraciones privadas y lógica privilegiada |
| Base de datos | Supabase PostgreSQL | Migraciones, constraints y RLS |
| Acceso | Supabase Auth con usuario y contraseña | Admin y profesionales; sin registro público ni correo para cuentas nuevas; TOTP diferido |
| Archivos | Supabase Storage privado, si hace falta | PDF, nunca almacenamiento público de datos fiscales |
| Deploy | GitHub Actions + GitHub Pages | Solo assets estáticos, sin secretos |
| Calendario | Google Calendar API | Integración posterior a la agenda local; OAuth 2.0, solo lectura |
| Facturación | ARCA WSAA + WSFEv1 | Etapa posterior; homologación antes de producción fiscal |

**Principio de arquitectura:** GitHub Pages aloja **únicamente el frontend**. Certificados ARCA, claves privadas, tokens de Google y credenciales de servicio nunca deben incluirse en el bundle, en variables `VITE_*`, en el repositorio ni en el almacenamiento del navegador. Las operaciones privilegiadas deben ejecutarse desde el backend.

Supabase Edge Functions es la opción preferida. Si la firma CMS/PKCS#7 o la integración SOAP requerida por ARCA no son viables allí de modo confiable, documentar la limitación y utilizar un componente serverless externo mínimo para esa integración, sin montar un backend permanente innecesario.

## 3. Usuarios y autenticación

- Dos roles: administrador de cuentas y usuario profesional. El administrador solo crea usuarios, restablece contraseñas y habilita/bloquea accesos.
- Los profesionales gestionan sus propios pacientes, sesiones y cobros. El administrador no accede a esos datos.
- Las cuentas nuevas usan nombre de usuario y contraseña, sin correo personal, confirmación por mail ni invitaciones. Supabase Auth mantiene identificadores técnicos internos.
- La cuenta original conserva sus datos y su ingreso anterior hasta que el administrador configure su acceso por usuario.
- Login/logout y recuperación de cuentas nuevas a través del administrador. TOTP continúa diferido por pedido del usuario.
- Deshabilitar registro público. El alta administrativa se ejecuta exclusivamente en backend con entradas validadas e identidad/rol comprobados en servidor.
- RLS obligatoria por owner_id y cuenta profesional activa. Bloquear el acceso debe impedir lecturas/escrituras incluso con una sesión anterior todavía válida.
- Los usuarios no pueden asignarse roles ni habilitarse. Las credenciales privilegiadas nunca llegan al frontend.
- Mantener solo estos dos roles; no agregar organizaciones, roles configurables ni gestión fiscal al panel del administrador.

## 4. Navegación

El administrador solo tiene el menú **Usuarios**. Para los profesionales, el menú lateral es:

1. **Inicio** — resumen del día y deudas.
2. **Calendario** — eventos y sesiones.
3. **Pacientes** — fichas y tarifas.
4. **Sesiones** — listado y estados.
5. **Cuentas corrientes** — cobros, deudas y pagos.
6. **Facturación** — borradores, emisión e historial; incorporar al implementar la etapa fiscal.
7. **Configuración** — perfil; agregar Google Calendar y ARCA cuando se implementen esas integraciones.

La interfaz debe mostrar estados vacíos, cargas y errores claros, con confirmación antes de acciones irreversibles.

La primera entrega presenta solo las funciones disponibles. Priorizar accesos rápidos para agendar/reprogramar un turno, marcar una sesión realizada y registrar un pago desde Inicio o la ficha del paciente.

## 5. Requisitos funcionales

### 5.1. Inicio / dashboard

Mostrar:

- Próximas sesiones y agenda de hoy, en orden horario.
- Pacientes activos y sesiones realizadas durante el mes.
- **Deuda total pendiente de cobro**.
- **Cantidad de pacientes con deuda**.
- **Cantidad de sesiones realizadas con saldo pendiente**.
- **Total cobrado durante el mes** (según fecha de pago).
- Total facturado del mes, **distinto** del total cobrado; agregar en la etapa fiscal.
- Top 5 de pacientes con mayor deuda, con acceso a su cuenta corriente.

Los totales deben surgir de datos reales y actualizarse al registrar sesiones o pagos. No confundir **facturado** con **cobrado**.

### 5.2. Pacientes

CRUD, búsqueda, filtros por estado, ficha individual y archivado lógico. Campos:

- `id`, `owner_id`, nombre, apellido, fecha de alta, estado activo/inactivo.
- DNI/CUIT/CUIL y tipo de documento **solo cuando sean necesarios**.
- Email, teléfono, domicilio fiscal opcionales.
- Condición fiscal y datos necesarios para la emisión, a incorporar y validar en la etapa fiscal; no exigirlos para gestionar pacientes, deudas o turnos.
- Precio habitual de sesión y duración habitual.

En la ficha mostrar historial de sesiones, pagos y saldo pendiente; agregar comprobantes en la etapa fiscal. **Cambiar la tarifa habitual no modifica los importes históricos de sesiones existentes**.

### 5.3. Calendario y sesiones

- Vistas de día, semana y mes.
- Cada turno muestra hora, paciente asociado, duración, estado y estado de cobro.
- Estados de sesión: `programada`, `realizada`, `cancelada`, `ausente`.
- Estados de pago calculados por saldo: `pendiente`, `parcial`, `pagada` (no reemplazan estados de sesión).
- Alta manual, reprogramación y agenda local funcional desde la primera entrega, sin depender de Google.
- Origen de cada sesión: manual o Google Calendar.
- Guardar precio de cada sesión independientemente de la tarifa actual del paciente.
- Cancelaciones y ausencias **no generan deuda por defecto**, salvo una tarifa de cancelación configurada explícitamente.
- Sesiones futuras **no cuentan como deuda vencida o exigible**.

**Google Calendar (etapa posterior a la primera entrega):**

1. Conectar/desconectar la cuenta por OAuth 2.0 con alcance mínimo de lectura.
2. Elegir el calendario a sincronizar.
3. Consultar y mostrar eventos sin asociarlos automáticamente a pacientes.
4. Asociar manualmente un evento con un paciente y persistir la asociación por identificador externo y ocurrencia (incluidas recurrencias).
5. Sincronización unidireccional **Google → aplicación**, manual mediante botón y, opcionalmente, programada en backend.
6. Manejar paginación, recurrencias, modificaciones, eliminaciones, expiración de tokens y error `410` de sincronización incremental.
7. Usar zona horaria `America/Argentina/Buenos_Aires`; guardar timestamps de forma inequívoca (UTC en base de datos).
8. No sobreescribir pagos ni datos fiscales cuando cambie un evento o se cancele.
9. Guardar refresh tokens cifrados, exclusivamente en backend; verificar el flujo de consentimiento/publicación exigido por Google.

No agregar edición bidireccional de eventos al MVP.

### 5.4. Cuentas corrientes y deudas (prioritario)

Crear una pantalla específica **Cuentas corrientes** y una sección resumida en Inicio.

**Indicadores:** deuda total, pacientes con deuda, sesiones con saldo pendiente y cobrado del mes.

**Tabla de pacientes deudores:**

| Paciente | Sesiones pendientes | Saldo adeudado | Última sesión | Acción |
|---|---:|---:|---|---|
| María González | 4 | $120.000 | 20/10/2026 | Ver detalle |
| Juan Pérez | 2 | $60.000 | 18/10/2026 | Registrar pago |
| Ana López | 1 | $30.000 | 15/10/2026 | Ver detalle |

*Datos ficticios de ejemplo.*

Permitir buscar, filtrar y ordenar por importe adeudado, sesiones pendientes y antigüedad. La vista de un paciente debe listar **cada sesión cobrable** con fecha, importe original, importe abonado y saldo; agregar el estado de facturación en la etapa fiscal.

**Registro de pagos:**

- Registrar fecha, importe, medio (`efectivo`, `transferencia`, `otro`) y referencia opcional.
- Asignar un pago a una o varias sesiones mediante `payment_allocations`.
- Admitir pagos parciales y pagos agrupados; validar que el importe asignado no supere lo disponible ni el saldo permitido según la regla definida para anticipos.
- Ejemplo: cuatro sesiones de $30.000 → deuda de $120.000; pago de $90.000 → saldo de $30.000.
- Mostrar historial de movimientos y permitir corregir registros mediante ajustes/reversiones auditables, sin borrar silenciosamente pagos pasados.
- Evitar doble registro al repetir una solicitud (idempotencia en backend).
- Mantener consistencia mediante transacciones y restricciones en base de datos.

**Regla principal de cálculo:**

`Saldo de sesión = importe cobrable de sesión − suma de pagos imputados a esa sesión`.

`Saldo del paciente = suma de saldos positivos de sus sesiones cobrables`.

Solo cuentan sesiones realizadas o cargos de cancelación válidos y explícitos; no cuentan sesiones programadas futuras. Las sesiones parcialmente pagadas cuentan **una sola vez** en la cantidad de sesiones pendientes. No reducir deuda por el mero hecho de emitir una factura.

Distinguir entre **pendiente de cobro**, **pendiente de facturación** y **facturada**; son dimensiones independientes.

### 5.5. Facturación electrónica ARCA

**Alcance posterior:** implementar esta sección después de que deudas, cobros y planificación sean utilizables. No crear tablas, formularios, PDFs ni integraciones fiscales como requisito de la primera entrega.

La emisión debe autorizarse mediante **ARCA**; un PDF por sí solo **no es una factura fiscal válida**.

**Configuración:** CUIT del emisor, nombre/razón social, condición fiscal, domicilio fiscal, punto de venta, tipo de comprobante, ambiente de homologación/producción y referencias a certificados y claves privadas almacenadas de modo seguro. **No suponer Factura C ni exención de IVA:** requieren validación con profesional contable según situación real.

**Emisión individual:** elegir una sesión, validar los datos fiscales del receptor, mostrar vista previa y total, confirmar explícitamente, solicitar autorización a ARCA, guardar resultado y habilitar PDF si fue autorizada.

**Emisión agrupada:** elegir varias sesiones **del mismo paciente**, sumar importes y emitir **un único comprobante**; por ejemplo, cuatro sesiones de $30.000 → total $120.000. Conservar la relación factura-sesiones e importes. Incluir el desglose descriptivo de sesiones en el PDF cuando corresponda: WSFEv1 no autoriza un detalle individualizado de ítems.

**Estados de facturas:** `borrador`, `en_proceso`, `autorizada`, `rechazada`, `pendiente_conciliacion`.

**Obligatorio:**

- WSAA para credenciales temporales de servicios web y WSFEv1 para facturas.
- Métodos pertinentes como `FECompUltimoAutorizado`, `FECAESolicitar`, `FECompConsultar` y consultas de parámetros.
- Guardar tipo, punto de venta, número, fecha, receptor, importe, CAE y vencimiento del CAE.
- Revisar reglas de período de servicios y datos de receptor aplicables.
- Idempotencia y control de concurrencia para evitar dobles emisiones.
- Ante fallo de red o timeout **no asumir rechazo**: consultar el comprobante en ARCA y conciliar antes de reintentar.
- Una factura autorizada es inmutable; correcciones mediante comprobantes legales pertinentes (por ejemplo, nota de crédito cuando corresponda).
- No permitir que una misma sesión se facture accidentalmente más de una vez; documentar el tratamiento de ajustes/credit notes.
- Generar un PDF descargable con información fiscal obligatoria, CAE, vencimiento y QR fiscal vigente cuando aplique.
- Historial con filtros por paciente, fecha, tipo, número y estado.
- **Nunca** usar la clave fiscal personal en frontend; gestionar certificados y claves en backend seguro.
- Homologar y probar con un contador antes de habilitar producción.

Separar los módulos de autenticación WSAA, conexión SOAP/WSFEv1, conciliación fiscal y PDF.

## 6. Modelo de datos propuesto

Diseñar migraciones SQL versionadas y restricciones relacionales. Crear las entidades según su etapa: primero perfil, pacientes, sesiones, pagos, asignaciones y auditoría; después conexiones/eventos de Google; finalmente tablas y configuración fiscal. La lista describe el alcance completo, no un requisito de crear todo al inicio.

| Tabla | Propósito / campos principales |
|---|---|
| `profiles` | `user_id`, `display_name` |
| `patients` | `id`, `owner_id`, datos de contacto/fiscales, `default_session_price`, `default_duration_minutes`, `active` |
| `sessions` | `id`, `owner_id`, `patient_id`, `starts_at`, `ends_at`, `origin`, identificador de evento, `status`, `price`, `chargeable_amount` |
| `payments` | `id`, `owner_id`, `patient_id`, `paid_at`, `amount`, `method`, `reference`, estado/reversión |
| `payment_allocations` | `id`, `payment_id`, `session_id`, `amount` |
| `invoices` | `id`, `owner_id`, `patient_id`, emisor/receptor, tipo, punto de venta, número, fecha, importe, estado, CAE, vencimiento, respuesta fiscal depurada |
| `invoice_sessions` | `invoice_id`, `session_id`, `amount` |
| `invoice_attempts` | `invoice_id`, `idempotency_key`, estado, hash de solicitud, respuesta y timestamps |
| `google_calendar_connections` | `owner_id`, calendario, referencia protegida a refresh token, sync token, última sincronización |
| `calendar_events` | `owner_id`, ID externo/ocurrencia, calendario, horario, estado, paciente vinculado |
| `fiscal_settings` | `owner_id`, CUIT, punto de venta, ambiente, referencia segura a certificado |
| `audit_log` | Acciones críticas (creación/reversión de pagos, emisiones, cambios fiscales) sin secretos |

Requisitos de modelado:

- UUID como PK; FKs e índices sobre propietario, paciente, fechas y estados.
- Importes `numeric(14,2)` (no `float`).
- Restricciones de no negativos, propiedad consistente y unicidad cuando corresponda.
- Preservar fechas e importes históricos.
- Proteger la relación entre pagos, sesiones y facturas del mismo paciente/owner con validación transaccional en servidor.
- Definir explícitamente cómo se tratan anticipos, ajustes, cancelaciones y notas de crédito; no deducir saldos con suposiciones ambiguas.
- No borrar físicamente registros ligados a comprobantes emitidos.

## 7. Seguridad, privacidad y operación

**Obligatorio antes del deploy real:**

Aplicar estos controles a las funciones incluidas en cada entrega. Los controles de Google, certificados ARCA y PDFs se exigen cuando esas funciones se habiliten; no bloquean el uso real de la agenda y las cuentas corrientes. Mantener autenticación, autorización de las cuentas y separación por propietario, RLS, respaldo y protección de datos desde la primera entrega. MFA queda diferido por pedido del usuario.

1. RLS en todas las tablas privadas, con pruebas negativas de acceso cruzado.
2. Auth con usuario/contraseña y autorización por rol/cuenta activa; deshabilitar sign-up público. No exigir MFA por ahora.
3. Autorización en Edge Functions y validación Zod de entradas de usuario.
4. Secrets y certificados fuera del repo/frontend. Nunca subir `.env` real.
5. Cifrado/gestión segura de refresh tokens de Google y claves ARCA, con rotación/revocación.
6. HTTPS y CORS restringido a orígenes conocidos; no usar CORS como sustituto de autenticación.
7. Protección frente a XSS; no renderizar HTML arbitrario de eventos externos.
8. Manejo de errores sin exponer tokens, datos fiscales innecesarios ni detalles internos.
9. Backups, restauración documentada y política de retención.
10. Logs de auditoría para pagos y comprobantes, sin notas clínicas ni secretos.
11. Buckets privados y URLs firmadas temporales si se almacenan PDFs.
12. Cumplimiento de normativa argentina aplicable de protección de datos personales y confidencialidad; evaluar con asesoramiento legal/fiscal según el uso real.

Minimizar datos personales. **Fuera de alcance:** historias clínicas, diagnósticos y anotaciones terapéuticas.

## 8. Diseño visual / UX

**Objetivo:** panel profesional, minimalista, intuitivo, pocos clics, diseño responsive y accesibilidad razonable.

| Token | Modo claro | Modo oscuro (azul, no negro) |
|---|---|---|
| Fondo | `#F8FAFC` | `#0B172A` |
| Superficie | `#FFFFFF` | `#14233B` |
| Superficie elevada | `#FFFFFF` | `#1B2E4B` |
| Primario | `#2563EB` | `#60A5FA` |
| Texto | `#0F172A` | `#E8EFFA` |
| Bordes | `#E2E8F0` | `#2D4262` |

Permitir alternar entre temas y recordar la preferencia. Usar tarjetas, tablas legibles, estados sutiles, skeletons, confirmaciones y notificaciones. Formato local `DD/MM/AAAA`, ARS y zona horaria Argentina.

## 9. Fases sugeridas

**Orden de entrega confirmado:** fases 1–2 forman la primera aplicación útil para cada profesional: pacientes, deudas, cobros y planificación local. Luego se incorpora Google Calendar; facturación ARCA viene después. Aplicar la calidad y documentación pertinentes de la fase 6 antes de cada entrega, incluida la primera; no esperar a ARCA para poder usar la aplicación.

### Fase 1 — Fundación
- Crear proyecto React/Vite, layout, temas, Supabase, migraciones, Auth con usuario/contraseña, roles simples y RLS.
- Configurar despliegue GitHub Pages, base URL y rutas SPA.

### Fase 2 — Gestión central
- Pacientes, tarifas, sesiones manuales, agenda local día/semana/mes, reprogramación y dashboard de deudas y turnos.
- Cuentas corrientes completas: deudas, pagos agrupados/parciales, asignaciones, reversión y conciliación interna.

### Fase 3 — Google Calendar
- OAuth seguro, consulta de eventos, enlace a pacientes y sincronización unidireccional.

### Fase 4 — Preparación fiscal
- Borradores, selección de sesiones, prevención de duplicados, configuración fiscal, historial y PDF de prueba claramente marcado como **no válido**.

### Fase 5 — ARCA
- WSAA/WSFEv1, homologación, emisión individual/agrupada, consulta/conciliación, generación de PDF autorizado y paso controlado a producción.

### Fase 6 — Calidad y documentación
- Pocas pruebas automáticas enfocadas en dinero y permisos; agregar las fiscales al implementar facturación. Sin metas de cobertura ni suites extensas. Seguir el presupuesto de pruebas de `IMPLEMENTATION_PLAN_SOL_6_1.md`.
- Seguridad, manejo de errores, accesibilidad, responsive y guías de operación/backup para cada entrega.

## 10. Criterios de aceptación mínimos

Los criterios de Google y facturación corresponden a sus etapas posteriores. La primera entrega se acepta por sus funciones de pacientes, agenda local, deudas, cobros y seguridad, sin exigir esas integraciones.

- [ ] Solo las cuentas habilitadas pueden acceder; cada profesional lee/escribe sus propios datos.
- [ ] El administrador puede crear usuarios sin correo, restablecer contraseñas y bloquear/reactivar accesos, sin consultar pacientes ni cobros.
- [ ] Una persona ajena no puede consultar datos por ID ni invocar Edge Functions privilegiadas.
- [ ] Se pueden crear, editar, buscar y archivar pacientes.
- [ ] Se pueden agendar, consultar y reprogramar turnos en vistas de día, semana y mes sin conectar Google ni configurar ARCA.
- [ ] Inicio permite ver los turnos del día y las deudas, con acceso directo para registrar una sesión realizada o un pago.
- [ ] Cambiar una tarifa no altera sesiones históricas.
- [ ] Una sesión realizada cobrable suma deuda correctamente.
- [ ] Las sesiones futuras/canceladas no suman deuda por defecto.
- [ ] El dashboard muestra deudas por paciente, cantidad de sesiones e importes precisos.
- [ ] Un pago parcial reduce el saldo sin contarlo dos veces.
- [ ] Un pago que cubre varias sesiones distribuye importes correctamente.
- [ ] La suma de saldos por paciente coincide con el indicador de deuda total.
- [ ] Emitir factura **no** marca automáticamente un pago como cobrado.
- [ ] Un evento de Google puede vincularse a paciente y sincronizar cambios sin borrar historial de cobros.
- [ ] Se puede preparar una factura agrupando cuatro sesiones del mismo paciente.
- [ ] Nunca se incluyen sesiones de pacientes diferentes en un mismo comprobante.
- [ ] Una sesión ya facturada no se duplica accidentalmente.
- [ ] ARCA autoriza comprobantes de prueba en homologación y se registra el CAE.
- [ ] Un timeout de ARCA no provoca duplicación de emisión.
- [ ] Facturas autorizadas no se editan ni eliminan.
- [ ] Se puede obtener el PDF de una factura autorizada.
- [ ] GitHub Pages funciona al abrir y recargar rutas internas.
- [ ] Tema claro/oscuro y diseño móvil operativos.

## 11. Entregables para el agente desarrollador

Entregar el código, pruebas breves y documentación correspondientes a cada etapa. La documentación y configuración de integraciones futuras se agregan cuando se implementen, sin retrasar la primera entrega.

1. Código fuente organizado y listo para GitHub.
2. Migraciones SQL, políticas RLS y pruebas.
3. Edge Functions para operaciones seguras e integraciones.
4. Tests unitarios/de integración para dinero, permisos y facturación.
5. `README.md` con desarrollo local y despliegue.
6. `.env.example` **sin secretos**.
7. `docs/architecture.md`, `docs/database.md`, `docs/google-calendar.md`, `docs/arca-integration.md`, `docs/deployment.md`.
8. Instrucciones de configuración manual de OAuth, Supabase, certificados y ARCA.
9. Lista explícita de bloqueos o parámetros fiscales pendientes de confirmar con contador.

## 12. Instrucciones a Sol 6.1

**Instrucción vigente del usuario (21/10/2026): no crear ni ejecutar tests todavía.** Durante el desarrollo actual, usar chequeos de tipos y compilación. Las pruebas y verificaciones funcionales/de seguridad que requieren un entorno real quedan pendientes; no presentarlas como aprobadas por haber compilado.

Seguí `IMPLEMENTATION_PLAN_SOL_6_1.md`. Implementá este proyecto **por fases**, dejando una aplicación ejecutable al final de cada fase. Diseñá para profesionales con datos separados y un administrador de cuentas; priorizá deudas, cobros y planificación diaria; agregá facturación después. Priorizá funcionalidad real, simplicidad, mantenibilidad, seguridad y costos bajos. No generes pantallas estáticas como sustituto de la lógica. No uses mocks en producción ni simules una autorización fiscal. No inventes requisitos fiscales.

Tomá decisiones de ingeniería razonables y documentalas. Ejecutá tests, verificá RLS y flujos críticos, y prepará un despliegue reproducible. Si una integración requiere configuración o acceso del usuario, dejá documentados los pasos precisos y continuá con lo demás.

**Presupuesto de tokens:** pocas pruebas de alto valor, verificaciones solo cuando correspondan y reportes breves. No generar suites extensas ni repetir tests que ya pasaron sin cambios relevantes.

**Prioridad explícita del negocio:** la profesional debe poder abrir el dashboard y saber inmediatamente **qué pacientes no pagaron, cuántas sesiones debe cada uno, cuánto dinero le deben y cómo está organizada su agenda**, independientemente de la emisión de facturas.

## 13. Referencias oficiales

- ARCA — Factura electrónica: https://www.arca.gob.ar/ws/documentacion/ws-factura-electronica.asp
- ARCA — WSAA: https://www.arca.gob.ar/ws/documentacion/wsaa.asp
- ARCA — Homologación: https://www.arca.gob.ar/ws/documentacion/homologacion-externa.asp
- Google Calendar — Sync: https://developers.google.com/workspace/calendar/api/guides/sync
- Supabase — RLS: https://supabase.com/docs/guides/database/postgres/row-level-security

> **Nota:** revisar la documentación oficial vigente antes de implementar integraciones fiscales, OAuth o normativa de protección de datos. La habilitación de facturación real requiere certificados, permisos y parámetros fiscales válidos del emisor.
