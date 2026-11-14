# InFlite OS Activity Centre

Activity is an optional OS-only account-owned registry and native sheet. It stores bounded metadata in RAM; it never persists filenames, file bytes, workspace content, errors or callbacks. The owning subsystem still owns transports, its busy/flush hooks, authentication and resource version checks. Merely opening Activity or searching its command performs no work.

```js
import {createActivityRegistry, createWorkspaceActivity} from './workspace-activity.js';
const activity = createActivityRegistry(F); // one per account/frame
const files = activity.source('files', {signal: F.signal, current: accountIsCurrent});
files.put(operationId, {
  title: 'Upload route.gpx', detail: 'My Drive', kind: 'upload',
  status: 'running', progress: 0.4,
  actions: [{id: 'cancel', label: 'Cancel upload', run: () => service.cancelTransfer(operationId)}],
});
const view = createWorkspaceActivity(F, {registry: activity});
view.open(); // parent wires the launcher/toolbar/command; no route/history entry
```

The producer has `put(id, spec)`, `remove(id)`, `clear()` and `destroy()`. A source has one owner; registering that source again retires its older producer and callbacks. IDs are bounded opaque identifiers, not URLs. Available states are `queued`, `running`, `waiting`, `succeeded`, `failed`, `cancelled` and `handed-off`. Kinds are `upload`, `download`, `sync`, `recovery`, `open`, `save` or `task`. Omitted/invalid progress is indeterminate, never a fabricated percentage. A native browser download is `handed-off`, with wording explaining browser ownership; it must not be reported as completed without an actual completion receipt.

`snapshot()` returns frozen copies with callback-free action labels and an observed `revision`. `invoke(key, actionId, revision)` accepts only that observed revision, refuses double dispatch and rechecks the account/source. Supplied action callbacks receive `{current, signal}`; their live operation also keeps its resource/version guards. Status/progress updates during an action retain its operation lease. Clearing/removing/replacing its producer or account aborts it. The registry's `signal` also closes its UI immediately on destruction or detected account replacement. Producers should use a new operation ID for distinct concurrent operations. Stable IDs are suitable for one sync/recovery task, including an explicitly requested retry that moves failed→running→succeeded.

Retry is shown only when the owning subsystem supplies a safe callback. Activity does not retry a failed upload or uncertain mutation. Files failures can instead offer an explicit folder refresh/reconciliation. Workspace sync can offer its read-before-CAS retry; recovery can retry safe reads or focus the existing app. Picker dialogs themselves need no task; the shared Files save operation is recorded once by the Files service.

An action's optional `current()` is its durable authorization/resource lease: it is rechecked by the callback lease and again after awaiting its result. It must not mean “the button is not currently pending”; the registry owns that separate dispatch guard. Authorization revoked while awaiting prevents a late callback side effect, while pending-state/progress changes alone do not invalidate a safe retry.

The default limit is 128 entries and 12 producers, covering the Files queue of 100 uploads alongside sync/recovery tasks. Old completed entries are evicted first; when every slot is active, `put` returns false rather than losing an active task or growing memory indefinitely. Clear completed removes completed/failed/cancelled/handed-off entries while retaining queued, running and waiting work. Source or frame abort, account replacement, and explicit destruction clear their metadata and callbacks. Subscribe disposers own their registration even when the same function is registered twice.

The sheet retains task and action DOM nodes through progress updates, uses the framework dialog for focus/Escape/account teardown, and exposes padded rounded buttons and indeterminate/determinate native progress. Error strings and titles are text only. The toolbar count is `view.count()`, covering queued/running work. Command action ID is `open-activity`.

Optional static closure: `/roof/workspace-activity.js`, `/roof/workspace-activity-state.js`, `/roof/workspace-activity.css`. Parent registers these in the OS updater/service-worker graph and the approved optional budget. None belongs to ordinary app first-open assets.
