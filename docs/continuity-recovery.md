# Continuation and recoverable work (3.13)

The account service owns device continuation and file revisions. Root uses the
existing fixed private capability proxy and captured-owner predicate. Cookie
identity remains authoritative. All responses are private/no-store; writes require
Root's exact Origin and custom CSRF header. Account deletion removes records and
historical objects, including pending replacement objects.

## Screen continuation

After verified sign-in, an optional background module synchronizes a bounded screen
reference for this device. Today offers up to three other devices. Only a tap
opens one: the active route, deep links and local reopen take precedence. Records
contain an opaque random device ID, Phone/Tablet/Computer label, curated path,
bounded scroll and server timestamp. Never search terms, names, location, content
or auth tokens. Each device uses compare-and-swap; at most 12 are retained and
references older than 30 days are not offered. Mail drafts autosave through Mail's
own authenticated API; local Chat drafts retain their existing encryption model.
The continuation service does not receive plaintext drafts or bypass app unlock.

## Files

Replace file stages independent immutable bytes while the old version remains
readable. Account CAS commits the replacement, history and quota together. The
20 most recent displaced versions can be downloaded or restored. Restore makes a
new immutable copy and preserves the displaced current version. History and
pending replacements count towards the existing 1 GiB quota. Deleting a file or
Trash subtree releases all current, historical and pending storage. A daily grace
period lets the orphan sweep reclaim pruned or interrupted private objects.
Observed versions protect against concurrent rename, move, replacement and restore.
A lease cannot be taken over by a late writer using the same physical object key.

## Offline work

Uploads, replacement uploads and Today layout edits enter an acknowledged
IndexedDB journal before being described as kept. Bodies and names are AES-GCM
encrypted using an account-specific, non-extractable device key. Queue metadata
exposes only random operation IDs, operation kind and byte counts. The journal is
limited to 100 operations / 100 MiB; each file retains its 25 MiB cap. Indexed kind
reads and a small quota store avoid decrypting/re-reading queued file bodies when
saving Today settings. It is browser storage, not a remote backup: clearing site
data removes unsynced work.

After verified reopening, uploads retain their destination and operation identity.
The queue permits two transfers concurrently. Retry uses idempotent reservations;
a consumed/deleted reservation requires an explicit Retry before a new operation
can be created. Failed writes remain recoverable with Retry and Discard in Activity.
Account change/sign-out clears device references and closes/deletes the previous
account journal; delayed writes cannot recreate it. Private responses never enter
service-worker caches. The worker caches only the explicit optional static modules.

Today layout edits have an expected account layout. A mismatch pauses the queue
and offers Use account layout or Keep this layout. Network availability alone
never means a write synced. Other native editors retain their existing save/outbox
semantics; Root does not replay arbitrary app writes.

## Today

Edit Today supports app order/visibility, section visibility and compact spacing.
Ride overview places the real planned session and its best-time/weather summary
in one sheet, with explicit actions into Fitness, Routes and Weather. It does not
invent a route assignment or revive saved workspaces.

## Cost and validation

New continuation/recovery UI is optional and bounded to 12 KiB gzip in total.
The reviewed optional total is 114 KiB JS; the original 39 KiB core, native first-open
and 36 KiB Files component limits are unchanged. History controls load only on use.
Tests exercise real D1/R2 history and quotas, stale/foreign writes, encrypted IDB
and exact File bytes after a closed tab in Chromium and WebKit, explicit layout
conflicts, and the real phone Explorer replace/restore flow.
