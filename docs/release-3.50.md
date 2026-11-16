# InFlite 3.50

This release connects explicit user actions across the existing native apps. It keeps their stores, authentication, encryption, confirmation screens and singleton lifetimes. Saved workspaces remain retired.

## Actions and Today

Reminders have titles and notes entered by the person, an optional due date, device alerts and up to five versioned Drive references. Mail, Chats, Fitness and Files offer a reminder action that carries an opaque source reference, never an automatically copied message body. The original remains in its app. Open and completed lists, search, source navigation, edit, deletion, completion and version-safe Undo share the existing sheets and focus handling.

Each write has an operation identity and an observed version. Pending work is acknowledged only after the account's encrypted IndexedDB journal commits. Lost responses retry the same operation; a concurrent edit requires review rather than an automatic overwrite. Reads cannot retire an item written after that read began. Local and account identities are reconciled without showing duplicate pending reminders.

Today shows at most three reminders/suggestions. Suggestions use fresh real ride/weather, dividend or available Mail draft data and explain their source. They can be dismissed for a day. An empty or unavailable reminder service does not insert a technical placeholder or shift existing cards. Visible Today refreshes reminders once a minute; hidden pages do not poll. Due device alerts use the existing five-minute scheduler and quiet-hours/preferences rules, so an entered time is not a promise of an exact-time push.

## Discovery and native app continuity

Explicit search fans out through permission-checked native providers: authenticated Mail search, Drive metadata, the unlocked Chat worker's local search, Fitness workouts/activities/saved route, portfolio holdings and saved forecast names. Queries are bounded and debounced. Query cancellation releases results and reads without poisoning the account-owned singleton mount; selecting a result can still open that app immediately. Account/lock changes retire private results. Private result callbacks do not write titles or snippets to Recent or put queries in navigation/history.

Remembered devices exposes the existing curated screen-continuation references and encrypted draft copies. Forget revokes continuation and removes its draft backup; it does not claim to sign out an authentication session. Account security remains the destination for session/passkey management. Devices are bounded to twelve active references, with revocation tombstones guarding delayed writes.

Chat draft backups are sealed and opened only inside its worker using the existing own-key E2E format and draft binding. The server sees an opaque authenticated envelope, no key or plaintext. Merely opening Chats cannot replace an older cloud copy with an empty local draft. Recovery is explicit, displays a native preview, checks the current local draft under the existing cross-tab lock, acknowledges durable storage and never sends a message. The editor is held read-only during confirmed restoration. Copies expire after fourteen days; forgotten devices and account removal purge the relevant rows.

## Files

PDFs render to bounded canvases in a local worker, without embedding a browser document, annotations, links, scripts or external viewer service. The pinned PDF.js distribution is 6.5.438, with its license under `today/public/roof/vendor/pdfjs/LICENSE`. Evaluation, XFA, Wasm and external worker font fetching are disabled; pages have a four-million-pixel canvas bound. There are page controls, bounded zoom and password entry. Unsupported document features remain downloadable. The image viewer has current-folder previous/next controls, swipe navigation, zoom and deterministic blob-URL retirement. A source version is revalidated before preview bytes are read.

Files retains page selection and gains touch selection. A menu tap racing a refresh opens against fresh metadata instead of silently disappearing. Queued-file recovery can save the exact local bytes, retry or discard. A replacement conflict requires explicit review of the current version, uses a new operation identity and retains the replaced bytes in history. Already committed operations are reconciled before a manual retry. Downloaded recovery copies use an inert MIME type.

## Loading budgets and security

The existing ordinary core and native first-open budgets remain in force. The 3.50 optional system/viewer controls have an independent 18 KiB JS / 3 KiB CSS served-gzip ceiling. Files moves from 36 to 36.5 KiB for safe viewer dispatch, selection and refresh handling. Reviewed optional adapter ceilings are Fitness 5, Weather 3.25, Markets 1.75, Chats 3.25 and Mail 4.25 KiB JS. The aggregate optional graph is bounded to 134 KiB JS / 20 KiB CSS. PDF.js is excluded from startup, prefetch and service-worker install lists: its separately measured renderer/worker cost is approximately 646 KiB gzip, requested only for an explicit PDF preview.

Private APIs use fixed routes, exact browser-origin checks, captured-owner preconditions checked against cookie identity, body/response limits, private no-store responses and live-account SQL guards. No API response or private file enters a shell cache. Action edits, replacements, backups and revocations use version checks and idempotent operations. Account export/deletion includes the new account-owned records. Tests cover concurrent edits, lost acknowledgements, cookie-only account swaps, revocation, retention, quiet hours, malformed sources, foreign file references and private result storage.

Validation uses actual browser UI, encrypted IndexedDB, the Root proxy and workerd D1/R2 for reminder, conflict, PDF and gallery flows in Chromium and WebKit. Full framework, native-app, security, startup, geometry and existing Files regressions remain release gates. Live checks verify deployed code, version endpoints and anonymous privacy boundaries; fixture tests do not claim access to a real person's production data.
