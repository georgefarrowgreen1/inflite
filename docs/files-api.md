# InFlite Files private drive

The cloud drive uses the Apps Worker’s existing `DB` and dedicated private `FILES_R2` binding (`inflite-private-files`). The OS Worker proxies a fixed set of same-origin `/api/files/*` endpoints to `/api/account/today/files/*`. Files does not create a separate account, bearer token, public bucket or public sharing URL. The deployment step creates the dedicated bucket only if absent and refuses deployment unless its managed public domain is disabled and no custom domain is enabled; it never changes public access on an existing bucket.

Every backend operation resolves the account from the existing HttpOnly session cookie. The browser cannot choose the authorizing owner. Root checks its exact browser Origin, Fetch Metadata and `X-Inflite: 1` before forwarding changes; the account service independently checks Today’s canonical origin and session. JSON requests are limited to 4 KiB, replies to 128 KiB, and upload streams to 25 MiB. No API response or binary content may enter the service worker cache.

## HTTP contract

| Root endpoint | Input | Result |
| --- | --- | --- |
| `GET /api/files/list` | `parentId`, `view=folder|recent|search`, `sort=name|modified|size`, optional `kind=folder`, optional `cursor` | A bounded folder page |
| `POST /api/files/search` | `{parentId,view,sort,kind,cursor,q}` | The same page shape; `q` is at most 160 characters |
| `GET /api/files/item` | `id` | `{item}` |
| `POST /api/files/folders` | `{name,parentId,operationId}` | `{item,limits}`, HTTP 201 |
| `POST /api/files/uploads` | `{name,parentId,mime,size,operationId}` | A pending `{item,limits}`, HTTP 201 |
| `PUT /api/files/content` | `id`, raw file body | Ready `{item}`; a completed retry also has `alreadyUploaded: true` |
| `PATCH /api/files/item` | `{id,version,name}` | Updated `{item}` |
| `POST /api/files/move` | `{id,version,parentId}` | Updated `{item}` |
| `DELETE /api/files/item` | `id`, `version` | `{ok:true}`; folders must be empty |
| `GET` or `HEAD /api/files/content` | `id`, optional single byte Range | Private attachment bytes |
| `GET /api/files/limits` | None | `{limits}` |

Mutations and search require `X-Inflite: 1`. Their content type is `application/json`, except the raw upload body. GETs return no CORS grant. Search terms and filenames stay out of resource URLs. There is no Trash or Undo endpoint in this first implementation.

All Files requests also carry `X-Inflite-Files-Owner`, the account ID captured by the initiating frame. Root forwards only 1–80 ASCII letters, digits, hyphens or underscores. The account service compares that predicate with the cookie’s signed-in account before reading input, charging pace or touching Drive data; a missing or mismatched predicate returns 401 with `field: "session"`. This prevents another tab’s cookie replacement from writing or returning a new account’s Drive data to a stale frame. The header never grants access. Native attachment GET/HEAD requests may omit it because opaque file IDs remain checked against the cookie owner; if supplied, the predicate must still match. Upload fetch/XHR requests always include it.

An item contains `{id,parentId,kind,name,mime,size,createdAt,modifiedAt,version,status}`. IDs are opaque 32-character base64url strings; a null parent is My Drive. Kind is `file` or `folder`, and status is `pending` or `ready`. A folder’s size is zero. Timestamps are milliseconds. Owners, object keys and upload nonces are never returned.

A page contains `{folder,ancestors,items,cursor,revision,usage}`. Items are limited to 100; cursor is a numeric account revision and offset, containing no filename. A changed revision returns HTTP 409 so the client refreshes its listing. Usage contains committed and reserved bytes, the storage/file limits, and node count/limit.

Folder views include only the current folder; `view: "search"` searches the entire drive, including ready folders and files, while Recent includes ready files only. Name sorts ascending; Modified and Size sort descending. Folders come first outside Recent, and every order has an ascending opaque-ID tiebreaker. Recent defaults to Modified; other views default to Name. The client resets its cursor whenever location, query, view or sort changes and preserves server order across pages.

An optional `kind: "folder"` filters before pagination, for destination choosers. Omit it for normal listings; other kind values are rejected. A destination chooser keeps its own cursor history and resets it when its location, query, sort or filter changes.

Rename, move and delete require the last observed positive item version. The server returns 409 on a stale version, collision, cycle, excessive depth or nonempty folder; 404 for missing and foreign resources; 410 for expired/consumed upload operations; and 413 for quota or file-size limits.

## Storage and concurrency

The drive permits 1 GiB, 5,000 nodes and at most 16 path components per account. A one-hour pending upload reserves quota before accepting bytes. The client supplies a random operation ID of 16–80 letters, digits, hyphens or underscores. The reservation is authorized by its owning session and opaque item ID; its internal nonce stays server-side.

All metadata mutations increment one account revision through a conditional D1 update and dependent node statement in the same atomic `batch`. Parent, depth, cycle, version and quota checks rerun on a competing revision. Quota is charged only when that transaction inserts the item. An operation record stores a signature and resulting ID, preserving idempotency through rename/move and retaining a bounded tombstone after deletion. Reusing an operation for different input is rejected.

Upload bodies pass through a `FixedLengthStream`, which rejects short or oversized bodies without collecting the file in memory. Bytes use an immutable server-owned `files/<account>/<id>/<nonce>` key. Only the matching pending claim can become ready. Cancellation, expiry, metadata deletion or account removal prevents finalization and triggers compensation. A CAS retry never reuses an object key captured before a failed transaction.

Account removal first closes the drive to new writes, then deletes its objects and metadata. The closed fence persists until the account’s final D1 deletion transaction, preventing recreation during cleanup. The existing retention job removes abandoned reservations in bounded batches and scans only the Files prefix for old unreferenced objects. Storage reports classify Files separately, and account exports include ready file metadata without keys or credentials.

## Content isolation

Downloads require an owned ready metadata row before any R2 lookup. Responses use `private, no-store`, `nosniff`, same-origin CORP, a sandbox CSP, and an encoded attachment filename. MIME information supplied at upload never enables same-origin HTML/SVG execution. The explorer may render allowlisted raster/audio Blob previews or plain text nodes. Active documents and unsupported formats remain downloads.

The Files explorer is a built-in OS view rather than a sixth domain module. The five existing app sources retain their own permissions, crypto, content and native editors. Their virtual files do not become personal-drive objects unless a future explicit copy operation is implemented.
