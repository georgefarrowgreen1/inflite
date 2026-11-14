# Shared Open and Save

InFlite OS owns one account-lived Files dialog controller. The optional workspace SDK exposes a per-app facade under `fw.workspace.files`; standalone applications retain their existing device pickers and downloads. Dialogs use the same framework sheets, tokens and focus restoration as native applications. They are not another app instance or a public sharing boundary.

The host lazily imports `/roof/files-dialogs.js` and `/roof/files-dialogs.css`. `createFilesDialogs(F, { service })` returns `forApp(app, { current, signal })`, `open`, `save`, `fromDrop` and `destroy`. A facade supports:

```js
const files = await fw.workspace.files.open({
  title: "Import to Fitness",
  accept: ".fit,.gpx,.tcx,.zwo,.erg,.mrc,.zip",
  multiple: true,
  current,
});

const saved = await fw.workspace.files.save(file, {
  title: "Save from Fitness",
  suggestedName: file.name,
  current,
});
```

`open` resolves to actual `File[]`, or `null` on dismissal or retirement. `save` resolves to `{ id, name }` only after the Files service confirms the upload commit, or `null` on dismissal. Reads are selected explicitly, bounded to 25 MiB total by default, and revalidate the observed Drive item version. Options may impose a smaller `maxBytes` or `maxFiles`; Mail uses its existing 20 MiB aggregate attachment limit. Accept filters support extensions, exact MIME types and MIME families. Folder reads are independent, server-paginated and never change the Explorer's selected folder. Saving always asks for a destination and valid leaf filename; it does not overwrite an existing file silently.

The facade combines its captured app and Frame/account lifetime with each request's caller guard and AbortSignal. Closing the dialog aborts its current read/write lease. A changed account, route or caller cannot receive late file bytes or publish a success. Search terms, names, selections and bytes remain in the live dialog; they do not enter URLs, workspace snapshots, local storage or service-worker caches. After an intentional import/attachment, the native app's existing account-owned data and draft rules apply.

Opaque drag-and-drop uses `application/x-inflite-files-token`. The Files service issues a random, account-owned, short-lived token; no filenames, account IDs, paths or file bytes are placed in `DataTransfer`. `fromDrop(dataTransfer, { accept, maxBytes, maxFiles, current, signal })` resolves current resource references and then explicitly reads each observed version. Unknown, expired, stale and foreign references cannot read data. A native app validates the resulting files again before importing or attaching.

## Native workflows

- Mail's composer offers **From InFlite Files** and accepts token drops into the compose surface. Actual selected files go through the existing unsent composer/outbox. Attaching never sends a message. The reader's **Save to InFlite Files** action reads an authorized attachment only after a click and asks for its destination; multi-attachment messages first ask which attachment to save. This uses an explicit authenticated `POST /api/attachments/:id/export` with the existing hub/account/`X-Inflite` guards. The bounded response is an octet-stream attachment with `private, no-store`, `nosniff` and a sandbox CSP. Ordinary raster previews retain their existing GET allowlist; message bodies and raw messages remain isolated at Mail's origin.
- Fitness offers **Open from InFlite Files** beside its existing device picker, and accepts token drops on its native screen. Recorded activities go through the existing parser and upload review. Untimed GPX tracks and routes use the optional `fitness/roof/route-files.js` reader: one continuous segment, 2–12,000 points, 100 m–500 km, no point gaps over 2.5 km, at most 5 MiB, no XML entities or document declarations. Point timestamps retain the activity path; metadata timestamps alone do not make a route a recorded activity. Routes are reviewed locally, then opened in the real Routes preview and day/departure form. Only **Save planned route** persists the route, replacing the existing account plan. Imported A-to-B geometry keeps `source: imported-gpx` and `provider: Imported GPX`; it is never labelled as a BRouter route or claimed to have checked roads. Generated-loop constraints stay unchanged. Route plan reads and mutations carry a captured `X-Inflite-Route-Owner` precondition checked against the actual cookie account before parsing or writes; older clients without that optional header remain supported. Coordinates and source file names do not enter navigation URLs or workspace snapshots.
- Fitness's native provider exposes `import-drive`, `save-route-drive` and `save-workout-drive`. The save actions generate the real existing GPX or FIT content, then await the Drive commit. They do not trigger a second device download.
- Mail's native provider exposes `compose-attach`, which opens a picker and then its existing composer with the chosen files. Actions are advertised only when the account has access and the SDK capability is available.

Other first-party OS apps receive the same scoped API when hosted. Unsupported Weather/Markets/Chats import or export formats are not invented or advertised as working features.
