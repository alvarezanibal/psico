# Implementation plan for Sol 6.1

Read this plan with [SPEC.md](SPEC.md), version 1.4. The spec defines the product; this plan defines the implementation order, proposed defaults, and a deliberately small verification budget. The intended implementer is Sol 6.1.

Reviewed 21 October 2026 and updated with the user's scope clarification. Development of the first release has started; see the progress record before continuing. The local Git repository tracks https://github.com/alvarezanibal/psico.git on main.

**Current user instruction (21 October 2026): do not create or run tests yet.** This overrides the testing steps below for the current development stage. Use type checks and production builds; keep live functional/security/database verification explicitly pending. Do not install test frameworks or generate test scaffolding.

**Access update (22 October 2026):** the user deferred TOTP. Use email/password for the single authorized owner; no authenticator enrollment gate. Apply `202610220001_password_only_access.sql` after the initial migration, preserving ownership and RLS. This supersedes earlier MFA requirements.

**Scope update (22 October 2026):** add a separate account administrator who creates professional users, resets passwords and enables/disables access. New accounts use username/password with no personal email or invitations. Each professional owns isolated data; the administrator only manages accounts. This supersedes the earlier single-user/no-admin restriction. See docs/admin-users.md for activation.

**Confirmed scope:** one psychologist using a private tool to make daily administration easier. The first useful release covers patient debts, payments, and planning appointments. ARCA billing comes later. Invoicing and collection remain independent.

**Daily workflow:** open Inicio to see today's appointments and outstanding debts; schedule/reschedule appointments, mark sessions completed, and record full or partial payments with few steps. Show patient balances alongside session history. Keep fiscal setup out of these workflows until billing is introduced.

**Token priority: do not build a large test suite.** Use the focused checks below, implement real features, and keep reports short. Do not repeatedly reread the entire project, research unrelated tools, generate extensive documentation, or delegate to additional agents unless requested.

## 1. Working instructions

- Keep the stack in the spec. UI text: Spanish (Argentina); currency: ARS; business timezone: `America/Argentina/Buenos_Aires`.
- Support exactly two roles: account administrator and professional. Keep owner_id isolation, no organizations or configurable roles. New user creation runs through the protected admin-users backend; administrators cannot read clinical or financial data.
- Implement in phases with working software at each boundary. Build only the phase(s) requested. If the user requests the whole project, continue through the phases without requesting routine approval between them.
- Read only relevant files after the initial orientation. Reuse existing components and dependencies; avoid framework comparisons and speculative abstractions.
- Persist real data in Supabase. Fixtures belong only in isolated development/test environments. Never fall back to fake production data or simulated fiscal authorization.
- Missing credentials should disable the affected integration with clear setup instructions. Continue independent work; do not claim unexecuted checks passed.
- Update the short progress record at the end of this file after each phase: completed work, actual checks, blockers, and next step. Do not duplicate the plan in a second tracking document.
- Prepare deployment configuration as code. Publish, provision external resources, and enable fiscal production only within the user's authorized scope.

## 2. Proposed defaults and unresolved decisions

These defaults resolve unspecified behavior for implementation; they are engineering proposals, not confirmed business or tax requirements. Record any user changes before implementing dependent logic.

| Topic | Proposed MVP behavior |
|---|---|
| Advances and overpayments | No stored credit or advance payments initially. A payment must be fully allocated to eligible charges for the same patient; reject excess amounts. |
| Cancellation and absence fees | Zero by default. Support an explicit nonnegative fee recorded on the session, with an audited reason; never infer it from a Google cancellation. |
| Charge eligibility | Completed sessions become chargeable after their scheduled end. Explicit cancellation/absence charges become eligible once the appointment time has passed. Future sessions never enter debt. Store historical amounts; time-based eligibility belongs in the server calculation. |
| Corrections to receipts | Reverse an erroneous payment once, preserving its original allocations and audit trail; enter a replacement when needed. Exclude reversed receipts from balances and collection totals using the original payment date. This restates historical totals; it is not a cash-refund ledger. |
| Refunds and credit balances | Leave unsupported until their business treatment is defined. Do not represent an actual refund as a deletion or an accidental-payment reversal. |
| Session changes after financial activity | Reject direct changes to patient, charge, or eligibility that would invalidate payments/invoices. Allow safe scheduling changes; use audited correction workflows for financial changes. |
| Invoice amount | Invoice the selected billable session amounts, not their remaining unpaid balance. Initially invoice each selected session in full. Payment status does not determine billing eligibility. |
| Credits and rebilling | Define the legal correction route before fiscal production. Preserve authorized documents; link corrective documents and prevent rebilling while their effect is unresolved. Never assume a credit note is also a refund. |
| Dashboard reporting | Monthly collections use effective, non-reversed payments by `paid_at`; monthly invoicing uses authorized documents by issue date, with separately defined credit-note treatment. Local month boundaries are converted to UTC. |

**First usable release = phases 1–2 plus the applicable release checks in section 9.** Deliver patients, debt tracking, payments, and a working local agenda together. Google Calendar improves planning in phase 3; billing preparation and ARCA follow in phases 4–5. The first release needs no fiscal tables, PDFs, billing forms, accountant inputs, or Google connection.

Fiscal inputs remain blockers for real issuance: issuer tax status, permitted document types, tax treatment, point of sale, certificates/permissions, recipient requirements, service periods, and corrective-document rules. Obtain these from the user/accountant; do not guess Factura C or VAT exemption.

## 3. Architecture decisions

- Use React, TypeScript, Vite, MUI, TanStack Query, React Hook Form, Zod, and Supabase as specified. Select compatible stable versions once and commit one package-manager lockfile.
- Use React Router's `HashRouter` with the correct Vite deployment base. Hash routes stay outside server path routing, making this a simple choice for GitHub Pages. Explicitly handle authentication callback parameters before route navigation. [React Router reference](https://reactrouter.com/api/declarative-routers/HashRouter)
- Organize frontend code by feature as implemented: auth, dashboard, patients, sessions, accounts, calendar, settings, and later billing. Add shared UI/utilities only when actually reused.
- Keep SQL migrations in `supabase/migrations`, privileged handlers in `supabase/functions`, and the requested operational documents in `docs`.
- Use RLS-protected client access for ordinary reads and safe patient edits. Use transactional database functions for financial writes; Edge Functions handle external credentials and integrations. Multiple client/HTTP writes are not a database transaction.
- Create one canonical server calculation for charge eligibility, session balances, patient balances, and dashboard totals. Aggregate allocations before joining invoice relations to avoid multiplying amounts or counts.
- Store money as `numeric(14,2)`. Use exact decimal strings or validated integer cents at application boundaries; do not calculate currency using binary floating-point fractions. Validate ranges and rounding.
- Store timed events in UTC and display in the business timezone. Preserve all-day calendar events as dates; do not silently turn them into appointments.
- Require the authenticated, manually authorized owner for private data and privileged actions. TOTP is deferred; do not enforce `aal2` or add an authenticator enrollment gate. Keep ownership checks and RLS on the server.
- RLS must also protect summaries and relationships. Use invoker-secured views where appropriate; audit privileged functions, restrict execution, and fix their search path. Do not expose credential tables or let users edit their own authorization. [RLS reference](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Only public Supabase connection configuration belongs in `VITE_*`. Google tokens, service credentials, and ARCA material stay in the backend. Keep sensitive query data out of persistent browser caches and clear it on logout.

## 4. Phase 1 — Foundation and private access

1. Scaffold the app, dependency lockfile, scripts, `.gitignore`, and public-only `.env.example`. Add the responsive sidebar, initial routes (Inicio, Calendario, Pacientes, Sesiones, Cuentas corrientes, Configuración), theme tokens/toggle, and reusable loading/error/empty states. Add Facturación and integration settings only in their implementation phases.
2. Configure Supabase migrations and the initial owner/profile model. Add patients, sessions, payments, and allocations as phase 2 needs them; defer integration tables until their phases.
3. Implement email/password login/logout, password recovery and protected routing. Document manual account creation, disabled public signup and allowed URLs. TOTP is not required for the current release.
4. Enforce the single manually provisioned user's authorization as well as ownership, using the smallest server-managed configuration. A valid JWT alone is insufficient. Deny anonymous and unapproved-user data access; do not add a role-management system.
5. Add a GitHub Pages build workflow, deployment base configuration, and callback handling compatible with hash routing. Document repository/Supabase setup without assuming access exists.

**Done when:** the app runs, themes/navigation work, the authorized user can authenticate with email/password, and a small real-database negative-access check confirms data isolation. Build/deployment configuration is ready; any unperformed hosted callback check is recorded explicitly.

## 5. Phase 2 — Patients, sessions, collections, and debt

1. Add versioned SQL for the core tables, constraints, ownership relationships, indexes, audit log, and financial operations. Enforce same owner and patient across linked records in the database.
2. Build patient create/edit/search/filter/archive and the patient detail page. Copy the habitual price/duration into new sessions; subsequent patient edits never rewrite session history.
3. Build manual sessions and local day/week/month agenda, plus the session list. Make scheduling, rescheduling, and marking completion easy from the agenda or patient page. Separate session status from calculated payment status; add the independent billing status in phase 4. Implement explicit cancellation fees and the eligibility defaults above.
4. Implement `record_payment` and `reverse_payment` as atomic server operations. Validate allocations, lock affected rows in a consistent order, check balances, write allocations/audit entries together, and roll back on failure.
5. Scope idempotency keys to owner and operation. Repeated identical requests return the original result; the same key with different data is rejected. Prevent concurrent requests from overallocating a session and prevent a second reversal.
6. Restrict direct writes that could bypass payment, allocation, charge, or audit invariants. Audit events must be produced by the trusted operation, not supplied by the browser. Extend these safeguards to invoices when implemented.
7. Build Cuentas corrientes: indicators, debtors table, search/filter/sort, per-session balances, partial/grouped payment form, movement history, and audited reversal. Include archived patients who still owe money.
8. Build the daily agenda and debt/collection dashboard indicators from the same server calculations, including top five debtors. Add quick actions to schedule an appointment, mark a session completed, and record a payment. Add invoiced totals only in the fiscal phase. Invalidate relevant queries after mutations and refresh date-dependent summaries at the next local day boundary.

**Done when:** the psychologist can plan and reschedule appointments, mark attendance, and register payments without Google or ARCA. Four completed sessions at ARS 30,000 show ARS 120,000 debt; a grouped ARS 90,000 payment leaves ARS 30,000; a partial payment counts its unpaid session once; reversal restores the appropriate debt. Future sessions and ordinary cancellations add no debt. Changing a habitual fee preserves existing prices. Apply the release checks in section 9 before real use; later integrations are not release blockers.

## 6. Phase 3 — Read-only Google Calendar

1. Add connections, protected token storage, event cache, and a stable link from event occurrences to local sessions. Choose minimal scopes that support selecting a calendar and reading its events.
2. Implement backend OAuth start/callback/disconnect. Use expiring, single-use state tied to the initiating authorized user; exchange codes server-side, encrypt refresh tokens, and return no Google credentials to the SPA. Document consent/publication and token-expiry requirements. [Google OAuth reference](https://developers.google.com/identity/protocols/oauth2/web-server)
3. Implement calendar selection, manual synchronization, pagination, recurrence identities, updates, and cancellations. Key recurring instances by stable external identity/original occurrence, not a mutable start time.
4. Save a new sync token only after every page succeeds. Handle `410` with a fresh sync of the remote cache while preserving patient links, local sessions, and financial history. Prevent overlapping sync runs. [Google sync reference](https://developers.google.com/workspace/calendar/api/guides/sync)
5. Display unlinked events and link them manually to patients. Repeated linking/sync must not create duplicate sessions. Update safe scheduling fields; flag conflicts involving completed or financially linked sessions for review.
6. Keep local sessions usable after disconnect. Do not add background jobs, webhooks, or two-way editing in this MVP.

**Done when:** a real connected calendar imports, a recurring occurrence links once, resync preserves financial history, and disconnect leaves the local agenda usable. When OAuth configuration is unavailable, record that live verification remains blocked.

## 7. Phase 4 — Billing preparation

1. Add fiscal settings, invoices, invoice-session relations, and attempts. Store immutable issuer/recipient/amount snapshots for submitted documents, separate from editable patient/settings records.
   Introduce the Facturación route, fiscal patient/settings fields, billing statuses, and a separate invoiced dashboard total in this phase.
2. Implement drafts, single-patient session selection, totals, validation, preview, and history filters. Reject mixed-patient selections and sessions already reserved by an active issuance or covered by an authorized invoice.
3. Distinguish a draft from an issuance reservation. Draft edits are allowed; concurrent submissions must claim eligible sessions atomically. Confirmed rejection can release a reservation; unresolved authorization cannot.
4. Keep draft/invoice status independent of collections. Preparing a four-session invoice for ARS 120,000 after collecting ARS 90,000 still leaves ARS 30,000 debt.
5. Add a reusable PDF layout. Every sample/draft PDF must visibly say **NO VÁLIDO COMO FACTURA**. Add optional private Storage only if needed; otherwise generate downloads from persisted authorized data later.
6. Perform one bounded technical feasibility check for CMS signing and SOAP in the Edge runtime. Record the result. Introduce the spec's minimal external serverless component only if a concrete limitation requires it.

**Done when:** a correct grouped draft is saved and previewed, invalid selections are rejected server-side, and no preview can be mistaken for an authorized invoice.

## 8. Phase 5 — ARCA homologation and controlled issuance

1. Read the current official WSAA/WSFEv1 manuals and parameter requirements for the configured issuer. Separate authentication, SOAP transport, orchestration/reconciliation, and PDF modules. WSFEv1 does not authorize individual line items; descriptive session detail belongs in the PDF. [ARCA documentation](https://www.arca.gob.ar/ws/documentacion/ws-factura-electronica.asp)
2. Configure isolated homologation credentials and endpoints. Cache temporary WSAA credentials server-side with expiry handling; never log private keys or raw sensitive payloads.
3. Implement explicit preview/confirmation, durable attempts, payload fingerprints, and a serialized issuance claim per issuer/environment/point-of-sale/document-type sequence. Prevent parallel number assignment across individual/grouped requests.
4. Persist the attempt and reserved number before the external request. Do not hold a database transaction open during SOAP network calls. Resolve external numbering conflicts through the documented ARCA queries.
5. Use the required last-number, authorization, and consultation methods. On timeout, crash, or ambiguous response, set `pendiente_conciliacion`; query the same document and reconcile before any resubmission or sequence reuse. Never blindly retry issuance.
6. Store authorization details, CAE/expiry, fiscal snapshots, and sanitized responses. Authorized records must resist direct API edits/deletion. Produce downloadable fiscal PDFs with the current required fields/QR; failed PDF generation must not trigger another issuance.
7. Implement/document the agreed correction and credit-note treatment, including invoice-session coverage and reporting. Do not release a previously billed session for rebilling simply because someone changes a local flag.
8. Demonstrate individual and grouped issuance in homologation plus timeout recovery. Enable production only after actual credentials/parameters and accountant validation are available. Clearly distinguish implemented code from live fiscal validation.

**Done when:** ARCA genuinely authorizes the test documents, a retry cannot issue duplicates, authorized PDFs are downloadable, and unresolved outcomes remain blocked pending reconciliation. Missing fiscal prerequisites block production, not unrelated app work.

## 9. Phase 6 — Release readiness and short documentation

Apply this checklist to the functions included in each release, beginning with phases 1–2. The phase number does not mean waiting for ARCA before making the core app usable. Repeat only checks affected by later changes.

- Finish responsive/accessibility details and clear errors on the completed workflows. Use one manual desktop/mobile walkthrough covering theme, keyboard forms, route reload, login/recovery, debt/payment, and available integrations.
- Verify restricted CORS, safe external-event rendering, private PDF access if used, secret-free bundles/repository, and absence of sensitive data in logs. Do not log real patient data in test output.
- Complete a concise README plus architecture, database, and deployment documents for the first release. Add Google Calendar and ARCA integration documents in their phases. Document applicable setup, backup/restore, retention decisions, credential rotation, and unresolved inputs.
- Document an executable backup/restore procedure and verify it with synthetic data in a non-production environment before real patient deployment. Record costs/limits to check for the chosen hosting plans; do not promise free production operation.
- Run the applicable final checks once. Report exactly what passed, what could not run, and the remaining operational prerequisites.

**Done when:** the spec's applicable acceptance criteria are met, remaining external blockers are explicit, and deployment/operation can be reproduced from the documentation. This phase does not authorize expanding the test suite.

## 10. Strict testing and token budget

**Paused by the user's latest instruction: no tests yet.** The budget below applies only when testing is requested later. Do not treat the scenarios or phase completion criteria as authorization to write/run tests now.

**Small, risk-focused verification only. Target three compact automated suites and roughly 12–15 meaningful scenarios across the full project, added when their features exist. This is a planning target, not a quota to fill.**

For the first release, use only the money and access suites (roughly 8–10 scenarios). Add the fiscal suite later; do not create fiscal test scaffolding in phases 1–2. A second test identity is only a negative-access fixture, not a requirement to build multi-user product features.

| Suite | Essential scenarios |
|---|---|
| Money and database invariants | Exact cents and eligibility/history; partial/grouped allocation and aggregate agreement; reversal; duplicate request/payload mismatch; concurrent over-allocation rejection. |
| Access control | Anonymous/unapproved-user denial; cross-owner denial through tables, summaries, relations, RPCs, Edge Functions and private PDFs where present; authorized success and rejection of invariant-bypassing direct writes. Reuse a small parameterized fixture across surfaces. |
| Fiscal integrity | Same-patient/full-session amount rules; repeated/concurrent submission; ambiguous authorization followed by reconciliation; authorized-record immutability and no change to collected totals. |

- Exercise financial transactions and RLS against an actual isolated database using authenticated identities. Mocked UI checks or the unrestricted service role cannot prove these guarantees.
- Use one lightweight runner where practical and a small SQL/integration harness where necessary. Do not introduce a separate framework for every layer.
- Use narrowly scoped external-service stubs for deterministic timeout/duplicate scenarios only in tests. Supplement them with the required real homologation checks; never label stubbed authorization as ARCA validation.
- Cover Google sync and ordinary UI flows with a short manual checklist initially. Add a focused automated regression only for a concrete bug or an unresolved high-impact risk.
- **Do not add** component-by-component tests, snapshots, broad E2E/browser suites, visual regression, load tests, coverage targets, test matrices for every UI permutation, or tests that merely repeat implementation details.
- No new automated tests for copy, spacing, theme tokens, or similarly reversible visual edits.
- After a coherent implementation batch, run relevant type/lint checks and only affected tests. Build once at a phase boundary when the app changed; do not run builds or the full suite after every edit.
- After a passing result, rerun only for a relevant change or concrete unresolved concern. At final integration, run the complete small suite once. Do not rerun unchanged code to generate extra evidence.
- Check tool/environment availability once. If database credentials, the local runtime, or certificates are missing, document the blocked command and continue independent work instead of repeatedly retrying setup.
- If a serious unresolved money/security/fiscal risk needs another check, add the smallest useful check and explain why in one sentence. The token budget is not a reason to skip a required release safeguard.
- Keep output to check names, pass/fail, and actionable errors. No full passing logs, coverage reports, or repeated explanations of the same change.

## 11. Suggested first instruction to Sol 6.1

> Read SPEC.md and IMPLEMENTATION_PLAN_SOL_6_1.md, especially the progress record. Continue the first release for one psychologist: debts, payments, and local planning. Do not write or run tests yet; use relevant type checks and a build. Connect/configure Supabase and resolve the recorded live-operation blockers when credentials are available. Keep the progress record and report brief. Defer Google Calendar and ARCA to their later phases.

## 12. Progress record

- Checks for account administration: frontend/Edge Function type checking and production build passed. No tests created or run. The Supabase admin connection is not available yet, so migration, function deployment and first-admin provisioning remain pending.
- Account administration implemented: dedicated Users panel, username/password for new accounts, enable/block and password resets. Added private role/account tables, server-only admin RPCs, an authenticated/authorized Edge Function and first-admin setup SQL. Original professional login/data are preserved. Activation requires applying 202610220002_admin_users.sql, deploying admin-users and bootstrapping the admin. No tests created or run.

- Publication (22 October 2026): pushed main to the public repository https://github.com/alvarezanibal/psico using the existing Git Credential Manager account. Configured public Supabase build variables and /psico/ base path, enabled Pages and completed Deploy Consultorio successfully. Verified HTTP 200 for https://alvarezanibal.github.io/psico/ and its JavaScript asset. Local credentials, dependencies and build files are excluded from Git.

- Phase 1 code: React/Vite/MUI project, responsive navigation, light/dark themes, setup screen, private login/logout, recovery callback, owner authorization helpers (TOTP removed on 22 October at user request), public env example, and manual GitHub Pages workflow.
- Phase 2 code: patient CRUD/archive/detail, manual appointments and day/week/month calendar, overlap warning, session filters/completion, dashboard, debtor accounts, partial/grouped payments, audited reversal, exact-cent allocation, server balances, transaction locks and idempotency. Fiscal features remain deferred.
- Database: initial versioned SQL includes ownership/FKs, RLS/grants, invoker views, monetary/date constraints, optimistic session editing and transactional RPCs. Migration has NOT been applied to a live database.
- Documentation: README plus architecture, database and deployment/recovery/backup instructions. Environment values and the one authorized user must be configured manually.
- Checks: frontend TypeScript/production compilation passed during development. No tests were created or executed, per user instruction. No test dependencies or scripts were added.
- Latest setup: the user created a Supabase project and configured `.env.local`; the variable prefixes were corrected to `VITE_`. Added `202610220001_password_only_access.sql` to allow password-only access while retaining the single owner and RLS.
- Blockers: the access update must be applied manually in the Supabase SQL Editor. No Supabase CLI, psql or Docker available here. Recovery, RLS, transactions, hosted callbacks and backup/restore remain unverified from this environment. The site is now published on GitHub Pages; live authentication/recovery still requires production URL configuration in Supabase. No tests were created or run.
- Next: activate the administrator following docs/admin-users.md (third migration, admin-users function and bootstrap account). Existing professional access stays compatible. Google Calendar and ARCA come afterward. No tests were created or run.
