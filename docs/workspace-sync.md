# Retired: workspace sync

The unified shell no longer loads saved workspaces, relays their context or starts cloud layout sync. Today, Files, direct app navigation and app-owned drafts remain available. Old workspace bookmarks return to Today. Existing local and cloud records are left untouched. The notes below document the retained compatibility modules and storage format, rather than active shell features.


The OS synchronizes workspace names, app selections, active workspace/pane and normalized window layouts through the existing private account service. Each device retains its local layout while offline. App contents, unsent drafts, message/conversation IDs, file names/content, private searches, location coordinates, scroll positions and authentication state are excluded. Object routes remain local; only literal app sections travel between devices.

## Host contract

`createWorkspaceSync(F, {store, onChange, onStatus, storage?})` is account-lived. The host starts it once, registers its `busy/flush` system-task hooks and destroys it with the account/frame. `onChange` runs after an accepted cloud layout or an explicit Review saved layout has been applied to the local store, so the host can repaint and adapt the semantic layout to the current viewport.

The controller exposes:

- `start()` — read cloud state and begin visible-page polling and connection listeners.
- `sync({manual:true})` — explicitly check and synchronize using a fresh cloud revision. Automatic calls use `manual:false`.
- `resolve('local'|'cloud')` — explicitly choose a conflict winner after another fresh read. A racing write still returns conflict.
- `open()` — show one owned native sheet with Sync now and explicit Keep this device / Use cloud workspaces choices. A separate Review saved layout action handles newer edits in another browser tab without reloading apps or discarding their drafts.
- `status()/subscribe()` — bounded RAM status with `state`, `message`, `revision`, `updatedAt`, `dirty`, `hasCloud`, `uncertain`, `localConflict` and `localPersisted`.
- `busy()/flush()/destroy()` — prevent updater reload during a write and release network work, timers, subscriptions and any open sheet at teardown.

Status is `idle`, `syncing`, `synced`, `waiting`, `offline`, `error` or `conflict`. `waiting` means a cloud layout is ready but another active editor/modal/task is busy. Automatic adoption waits; explicit Sync/resolve actions represent the user's choice to apply it. The Activity Centre can map waiting/offline/conflict to a waiting activity and offer the native sync sheet; it must never pick a conflict winner silently.

The store adds `subscribe`, `replaceSnapshot`, `reloadSaved`, `hasLocalData` and `storageChanged` without changing its existing version-2 layout format. Cloud replacements are canonical, account-checked and tagged `{source:'cloud'}`. All store mutations check the last observed serialized localStorage snapshot before writing. An observed newer tab rejects a stale create/update/select/remove/reset and emits a storage conflict; automatic sync also stops before and after its read. It never silently merges layouts. The explicit Review saved layout action reads the other tab’s validated account-owned layout. Review is available even while offline, before any network request. Until it is reviewed, or while a local copy cannot be persisted, busy/flush holds automatic updater reloads. A missing local layout with a leftover sync acknowledgement adopts cloud data rather than uploading generated defaults.

## First use and conflicts

An empty cloud is initialized using the local approved metadata. A fresh device with no local layout adopts the cloud. Existing local and nonempty cloud layouts that differ require an explicit choice. The client keeps an account-scoped last acknowledged metadata snapshot/revision in `ifl:workspace-sync:v1:<owner>`; no app contents are stored there.

When only cloud changed, the clean local layout can adopt it. When only local changed, a compare-and-swap write uses the latest checked revision. If both changed, neither is silently overwritten. Local edits made during a pending write remain dirty after its acknowledgement and are synchronized subsequently.

A write with an uncertain network outcome is not automatically retried. A later read can confirm an identical committed layout. If not confirmed, only an explicit user sync/choice may attempt another guarded write. No background retry can duplicate a mutation whose result is unknown.

## HTTP and storage

Root exposes only `GET/PUT /api/workspaces`, forwarding to the fixed account endpoint `GET/PUT /api/account/today/workspaces`. Both requests require `X-Inflite-Workspace-Owner`; it must match the account authenticated by the existing HttpOnly cookie. It is a precondition, never an authoritative owner. Root validates exact Origin/Fetch Metadata and write headers before forwarding. The account service independently checks canonical Today origin and the signed-in owner before parsing or processing a write.

The complete JSON write is at most 16 KiB:

```
{revision: nonnegativeInteger, operationId: randomOpaqueId, state: canonicalVersion2Metadata}
```

A read/write reply is `{revision,state,updatedAt}`. An empty account has revision zero and null state. Positive revisions contain canonical metadata. Successful writes advance exactly one revision. D1 conditionally changes the row only when the supplied revision still matches and the account remains active. The latest operation ID supports successful acknowledgement checks without advancing a revision twice.

Cloud metadata is bounded to eight workspaces and five known first-party apps per workspace. Unknown fields are stripped, names are control/bidi-cleaned, literal routes are allowlisted and all geometry is finite and normalized to the viewport. Backend normalization is independent of the browser and is exercised against the same canonical fixtures.

Every Root response is private/no-store with nosniff, same-origin CORP, sandbox CSP and no CORS grant. No sync API response enters the service worker. Query strings, alternate methods and caller-supplied destinations are rejected.

The `ifl_workspaces` D1 row is fenced closed before account removal begins. The fence persists until the final atomic account-deletion batch removes both workspace metadata and the account, preventing a late write from recreating the layout during cleanup. Account exports include the approved workspace snapshot. Storage reports classify its table under Today.

## Verification

`tests/workspace-sync.test.cjs` exercises conflict choices, missing local cache, uncertain acknowledgements, edits during writes, offline preservation, another-tab storage changes, editor-safe automatic adoption and stale-account cancellation. Existing state/migration/window tests remain in force. `tests/workspaces-api.test.cjs` checks Root origin/owner forwarding, payload bounds, private headers, cancellation and no retry. `.tools/tests/unit/workspaces-security.test.mjs` runs actual workerd cookie authentication and D1 races, owner isolation, canonicalization and account deletion fences.
