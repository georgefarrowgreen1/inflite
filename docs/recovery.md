# InFlite OS connection and recovery

`workspace-recovery.js`, `workspace-recovery-view.js` and `workspace-recovery.css` are optional OS assets. They do not extend the ordinary framework bundle, create new native app instances or change the service-worker cache policy.

The account-lived controller captures the current owner and listens for browser network availability. `online` means the browser reports a network, not that an app has synced. Per-app import/loading errors, provider sign-in/lock state and backend offline states remain separate. Returning online updates these states without retrying requests or replaying writes.

## Host contract

`createWorkspaceRecovery(F, { getHandle, retry, activity?, onChange? })` provides:

- `load(app, () => handle.load(), {signal?,current?}?)`: instruments the real singleton Frame handle. Failed imports can retry using the framework’s existing import/CSS retry logic. Mounted modules retain their instance and stores.
- `update(app, snapshot.status)`: receives bounded provider states. Sign-in/lock gates cannot be bypassed by Recovery.
- `recover(app, {signal?,current?}?)`: explicit, bounded resumption through the host’s supplied `retry(app, lease)`. That callback must use its lease before navigation or presentation, re-present the existing route and return a boolean or `{ok}`. It must never unmount an editor, discard a draft or replay a failed mutation.
- `snapshot()`, `subscribe(fn)`, `actions()`, `destroy()`: immutable status metadata, owned listeners, guarded `retry-<app>` commands and teardown.

`createWorkspaceRecoveryView(F, controller)` exposes `open()`, `close()` and `destroy()`. The host registers its Connection & recovery entry in the launcher/commands and loads the optional stylesheet before opening it.

`activity` is the producer returned by `registry.source('recovery', ...)`. Only explicit recovery attempts produce tasks; idle apps do not populate the Activity Centre. Progress is a real running state, not fabricated percentages. Failed attempts offer an owner-fenced explicit retry. No frame-wide busy/flush hook is required because recovery does not create mutations.

## Ownership and offline guarantees

Every operation checks captured account, frame signal, caller signal and optional caller predicate. A caller can stop waiting without destroying a module mount shared by another view. Account teardown releases pending waiters and prevents late results, status callbacks or Activity Centre actions from affecting the replacement account. Coalesced same-app retry controls invoke the host once.

Offline mode keeps current native editors and their app-owned draft storage intact. Recovery cannot promise uncached applications will open offline; existing installed-app static caching decides that. API replies, Drive contents, previews and recovery metadata never enter a new cache or browser storage. Navigation and existing editors remain usable, while refresh/retry controls explain that a connection is needed.

The recovery callback is bounded to fifteen seconds by default. A timed-out mount may finish through its normal account-owned loader later, but its expired user action lease cannot navigate or change a replacement screen. Recovery reports unavailable rather than claiming the operation succeeded.


## Availability metadata (3.11)

Each native provider may publish an `availability` allowlist: `local`, bounded `pending` count, `saving`, `draft`, `error`, and `updatedAt`. The account recovery controller normalizes these values and never copies content. Loaded content is described as current content, not as a guaranteed offline archive. A small, non-modal status row appears only offline or when the current app reports unsynced work/service failure. Files states explicitly that cloud bytes and uploads need a connection. Browser online events do not clear producer-reported unsynced work and do not trigger host writes. The Review sheet reports Network available, not a claim that all services are connected or saved. Locks and sign-in gates take priority over all availability detail. This rollout reports Fitness settings saves, Markets reorder status, Chat outbox and Mail outbox/composer state; it does not claim every local edit is an acknowledged cloud write.
