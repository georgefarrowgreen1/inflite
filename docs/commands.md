# InFlite OS Command Centre

The OS adds typed actions to the existing shared search. Ctrl/Cmd+K opens it outside native editors and dialogs, including editors inside open shadow trees. Search text remains in the current page. Typing never invokes an action, uploads, imports, synchronizes or fetches file contents; Files search still reads only metadata already in the account's RAM index.

## Supported file commands

With the host's optional account-owned file dialogs available, “attach a file” opens Mail's `compose-attach` action and “import route” opens Fitness's `import-drive` action. Both go through the real native provider, requester-scoped Open dialog and existing app editor/parser. Attaching does not send a message. Imported files are handled by Fitness's existing import workflow. No unsupported Weather or Markets file actions are inferred.

“Save export” finds `save-route-drive` and `save-workout-drive` only when the current native provider advertises a real eligible route or workout. A stale provider row cannot silently switch to a new resource. File names, content and search text are not copied into commands' navigation history or local storage.

The host must pass `fileDialogsAvailable: () => boolean` when creating commands. Without that explicit capability, new file commands remain absent. The host's `runIntent(app,id,objectId,{current,signal})` composes the command's lease with native app, route and resource guards.

## Typed system actions

`createWorkspaceCommands(F,{systemActions: () => descriptors})` accepts these identifiers only:

- `open-activity`: opens the actual account-owned Activity Centre.
- `sync-workspaces`: requests a manual synchronization through the real revision/CAS controller.
- `resolve-workspace-sync`: opens the host's explicit local/cloud conflict choices; never picks a winner while typing.
- `open-recovery`: opens actual connection and app recovery status.
- `retry-fitness`, `retry-weather`, `retry-markets`, `retry-chats`, `retry-mail`: invoke the corresponding application's guarded recovery controller.

Each descriptor contains `{id,label?,detail?,keywords?,app?,enabled?,revision?,current,run}`. `current()` is a required durable ownership/authorization predicate. Retry descriptors' optional `app` must match their identifier. `revision` can be a nonnegative safe integer or bounded string when the action targets a specific observed state.

Command results re-read the current descriptor, enabled state, application entitlement and optional observed revision before invocation. Unrecognized identifiers and missing predicates are ignored. Account replacement, abort, a revoked descriptor or changed revision prevents stale rendered controls from starting work.

`run({current,signal})` receives an account-scoped operation lease. The command does not invoke two concurrent copies of one pending action. `enabled` controls selection and may become false when a task starts; the durable `current()` predicate must remain true through the task's own pending state. Underlying sync/recovery controllers retain responsibility for their current revision/resource checks and safe error recovery. Cancellation is quiet; failed actions show one scoped error and are never silently replayed.

## Verification

Model regressions cover native file capability discovery, invalid targets/prototype command IDs, typed system discovery without effects, stale resource/revision/entitlement retirement, duplicate pending actions, account replacement, durable pending leases and cancellation. Shared-search browser tests exercise keyboard dispatch, mobile layout, plain-text rendering, native-editor shortcut preservation and query/history privacy under the unmodified Root CSP.
