# InFlite OS workspaces v1

`os.inflite.ai` uses Today's existing session, app services and domain engines through an optional workspace host. The apex retains its ordinary Today surface. An explicit `?os=1` flag is available only on localhost and test hosts. It does not enable OS on the production apex or another production subdomain.

The first workspace combines real Fitness and Weather views. Desktop presents both; a narrow viewport presents one foreground pane. Expanding an app and returning reparents the same app instance, so stores, drafts and chart owners remain attached to their original module lifetime. Markets, Chats and Mail open as full apps. Workspace v1 supports one or two unique pane apps, not arbitrary duplicate instances of a module.

## Ownership

| Layer | Owns |
| --- | --- |
| `workspace.js` | Workspace navigation, active panes, providers, global actions and explicit cross-app intents |
| `workspace-view.js` / `workspace.css` | Stable DOM slots, dock, workspace list and responsive presentation |
| `workspace-state.js` | Validated, account-scoped workspace metadata |
| `workspace-context.js` | Ephemeral location/time selection and subscriptions for one workspace |
| `workspace-catalog.js` | Versioned first-party manifests and allowlisted persisted routes |
| `frame.js` | The single module instance, account lifetime, scoped framework handles, loading and flush |
| App `roof/workspace.js` adapters | Domain snapshots and explicit actions using that app's existing engine |

Every app module remains a singleton within its signed-in frame. `F.view(app)` reuses its normal module record, import, store and service. Moving a view does not unmount it; signing out aborts frame and module ownership before cleanup. Late imports, snapshots, intents and old cleanup callbacks cannot adopt a replacement account or remove a newer owner's attachment.

The manifests describe trusted first-party modules sharing this origin, DOM and JavaScript realm. They are **not a security sandbox**, permission grant or extension boundary. Untrusted apps would need an isolated origin, message schema, explicit capability mediation and separate storage; they cannot use this API as an isolation mechanism. Existing server session, CSRF, origin and app-specific authorization checks remain authoritative.

## Controlled view contract

`F.view(app)` returns a stable handle while that frame lives:

```text
{ el, root, fw, signal,
  build, header, route,                         // read-only current values
  attach({ container, navigate, back, section, header, fill, workspace, depth }),
  load() → Promise<instance | null>,
  show(route, { container?, visible? }) → Promise<boolean>,
  hide({ detach? }), busy(), flush() }
```

`attach` returns an ownership-checked detach callback. The host supplies a real DOM container and the navigation/header callbacks. `show` validates the route against the same app and its current hub switch. A newer show/hide supersedes an older pending import. The host may reparent the root but must not create a second app instance.

While attached, framework navigation, sections, Back, header and fill are pane-scoped. A hidden pane cannot navigate or open a modal. `fw.visible()` requires both document and pane visibility in this mode. Hidden panes receive no document-visible redraw event. Ordinary module navigation retains its existing semantics after expansion; services keep their separate account lifetime. All mounted modules still participate in frame `busy()` and `flush()`, including an editor currently hidden in another pane.

A module gets the account-owned `fw.workspace` capability only under the OS host. The optional `instance.workspace()` method activates an adapter for a module already opened by a cold full-app deep link; it must be idempotent and inert after module abort.

```text
workspace = {
  enabled: true,
  active() → boolean,
  provide({ snapshot(), run(intent, objectId?, { current }) }) → owned cleanup,
  changed(),
  context: { get(), capture() → currentContextPredicate, subscribe(fn) → cleanup, update(patch, { source }) → boolean }
}
```

Provider callbacks and context writes are bound to the registering app and account. Context sources use the registering app's prefix. Providers expose current domain values and opaque file references; the host does not reimplement training calculations, forecasts, encryption or financial arithmetic.

Asynchronous intents check the host's `current()` predicate after awaited reads and before navigation, context writes or downloads. Leaving and returning does not revive an abandoned intent. A context capture instead follows workspace identity across section changes, so a confirmed ride time can update its own linked forecast without changing another workspace's selection. Nested context updates supersede older subscriber deliveries.

## Metadata, context and explicit actions

Only account ID, workspace ID/name, known app/route references, active pane and update time are persisted under `ifl:workspace:v1:<account-id>`. Stored input is bounded and sanitized on restore. Eight workspaces and two unique eligible panes are the limits. Storage failure falls back to in-memory metadata. Other accounts' records are neither adopted nor cleared by an old owner.

Persisted routes reject queries, encoded values, external URLs, auth/settings flows and share payloads. Live query-based place navigation remains ephemeral. Location, forecast data, ride content, GPX contents and auth material are absent from saved metadata. The live history owner is checked before restoring a workspace; context and live query memory are cleared on account teardown.

Each workspace's location/time context stays in memory. Coordinates are validated and rounded; a time interval is UTC, bounded to 48 hours and a usable forecast horizon. A route's wall-clock schedule and timezone remain distinct from actual UTC instants. Missing location or forecast coverage is reported explicitly.

Changing Weather's place or choosing “Weather for ride” is an explicit context action. Routine forecast refreshes do not silently write a ride location. Scheduling opens Fitness's existing editor and writes only on its confirmed action. Ride sharing uses the existing supported workout card. GPX references resolve against the current account's saved route and export a real escaped GPX file; the host does not fabricate a Chat route-card schema or place GPX contents into a URL.

## Optional assets and checks

The five root workspace scripts, `workspace.css` and `os.webmanifest` form the OS-only shell closure. Host updater and service worker agree on the exact list. Ordinary HTML does not preload them. The service worker enables this closure only on the exact OS host or explicit local preview, and retains only static assets, never account/API responses.

Fitness and Weather adapters are literal lazy imports. Their exact `roof/workspace.js` and `roof/workspace.css` paths belong to `connector.lazy`, not the app's ordinary first-open `connector.files`. Once used in OS, the host asks the root worker to retain the static graph plus these curated optional files. Existing installed-app idle caching and network-only exclusions continue to apply. The worker accepts only JS/CSS assets for module build caches and rejects API path segments, documents and data files; it also refuses to replay an old malformed API cache entry.

The core framework budget is 35 KiB gzip with comments stripped; its request coordinator has a separate 2 KiB + 128 byte ceiling. Optional OS JS plus both adapters has a 24 KiB served-gzip ceiling and its CSS an 8 KiB ceiling. Ordinary app budgets remain unchanged. The exact optional file exclusion prevents future unrelated files from escaping the core budget.

`roofworkspace.test.mjs` checks host selection, updater/worker closure, manifest, static versus lazy graphs, cache path rejection, route opt-in and served sizes. Workspace model tests exercise hostile storage, account replacement, immutable snapshots and context ownership. Real-frame fixtures cover interrupted imports and stale handles. The app composition browser suite uses the actual Fitness/Weather modules, controls and chart lifecycle with synthetic API data; it does not write production accounts.
