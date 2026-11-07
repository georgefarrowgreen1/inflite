# inflite

Two Cloudflare Workers, each deployed by Cloudflare Workers Builds from this repo: **InFlite Today** at inflite.ai (the
root Worker, `today/`), and **Mail** at email.inflite.ai (`email/`). The apps' accounts, and the data both show, live in
the georgefarrowgreen repo, at account.inflite.ai.

## Today (`today/`, the root Worker at inflite.ai)

Your day from every InFlite app on one page: Weather's forecast and warnings, Chat's pigeons on their way, Fitness's
session and its best time, and Markets' day; and one morning notification in place of Weather's briefing and Fitness's
reminder. Signed out, it's InFlite's way in: what InFlite is, its apps, and Sign in.

- **The page** is `today/public` (static files, with its service worker, manifest and icons). InFlite's menu and its
  way in are copied into `app.js` and `app.css` from the georgefarrowgreen repo: there, `node .tools/iflmenu.mjs
  ../inflite/email/public ../inflite/today/public` and `node .tools/signin.mjs ../inflite/today/public`.
- **The Worker** (`today/src/index.js`) runs only for `/api/*` and `/version`. It keeps nothing of its own: each
  `/api/*` request is checked (Origin, `X-Inflite` and `Sec-Fetch-Site` on writes, a short list of query parameters),
  then passed on with only the account's cookie to `account.inflite.ai/api/account/today/*` (the georgefarrowgreen
  repo's `functions/_todayapp.js`). It has no D1, cron or secrets, only the var `ACCOUNT_ORIGIN`.
- **The morning notification** is sent by the georgefarrowgreen repo (`functions/_todaymorning.js`, every 5 minutes
  from its scheduler), to devices Today's page turned it on on.
- **One roof** (`today/public/roof/`): the framework the page is built on (frame, header, tab bar, sheets, toasts,
  search, send, connectors). Apps that are modules open inside it with no page load: Weather's module is the
  georgefarrowgreen repo's `weather/roof/`, served at `/weather/roof/*` through the hub (`today/src/hub.js`,
  `today/src/roof.js`), and `/weather/` is the framework's own page. The switch: the `ROOF_OFF` secret (the georgefarrowgreen repo's `roof.yml`)
  puts Weather back to milestone 1's page of the hub in seconds.
- **Its version** is `BUILD` and `NEWS` in `today/public/app.js`, raised by 0.01 with every change that's pushed;
  `/version` says it, for InFlite's updater (`IFL.updates`).

The root `wrangler.toml` stays at the root, as Workers Builds deploys it from there: `main` is `today/src/index.js`,
the assets `./today/public`. It's only at inflite.ai (no workers.dev address, no preview addresses).

### Run locally

```sh
npm install
npx wrangler dev --var ACCOUNT_ORIGIN:http://127.0.0.1:8789
```

Then open http://localhost:8787, with a stand-in for the account's API on 8789 (the georgefarrowgreen repo's
`.tools/tests/mocks/todaystub.mjs`; its `.tools/tests/todaypage.mjs` drives the page through both).

## Mail (`email/`)

inflite Mail, the mail client for `email.inflite.ai`. See [email/README.md](email/README.md) for setup.

## Web UI maintenance

The shell's JSON API calls use `today/public/roof/requests.js` (exported by the frame entry point).
It shares only identical unfinished GETs, returns independent decoded JSON to each caller, and bounds the full
fetch/body read to 20 seconds by default. Callers can pass an `AbortSignal`, `timeoutMs`, `fresh: true`, or a
`latestKey` for related reads. One subscriber cancelling does not cancel the others; the transport stops when
no subscriber remains. A newer replacement read suppresses the older response, including stale HTTP errors.

There is no completed-response cache or automatic retry. Writes are sent separately, with the existing credentials
and `X-Inflite` header; reads after a write starts/settles cannot join a pre-write transport. Cancellation or a timeout
does not undo a write already received by the server. A write timeout asks the user to refresh and check its outcome.
Account transitions reset the coordinator. Screen contexts retain its scope signal so delayed work cannot start
requests or repaint settings for a different account. Boot results are paired with their authenticated view.
Full app modules with their own API clients and authentication remain outside this first integration.

Run `npm run test:requests` for deterministic transport/concurrency checks, or `npm test` for these and the browser
checks. CI runs both. The coordinator is preloaded and included in the offline/updater asset lists.

Today and modules inside its shell share button and switch rules in
`today/public/roof/controls.css`, imported by `roof.css`. The existing `.pill` and `.ifl-btn` names are aliases;
control sizes and interaction states live in that one file. App accents and theme colours remain in the existing
tokens. Standalone apps and Mail's separate document retain their own styles.

Morning plan history and Undo controls live under **What changed**. Offers needing a decision, ride guidance,
warnings and messages stay visible. The disclosure preserves its open state and keyboard focus across redraws.

On desktop, `today/public/layout.js` packs the summary, Coming Up and app cards into one grid, using two to four
columns based on the space available. Cards retain their natural heights, and the summary spans up to two columns.
Resize and mutation observers update row spans when content grows, cards change or the window resizes. Nodes stay
in reading/keyboard order; no dense reordering or animated positioning is used. The grid has a readable CSS fallback,
and phones retain the single-column layout. Keep `layout.js` in the service-worker and updater file lists.

Run the local UI checks with `npm ci`, `npx playwright install chromium`, then `npm run test:web`
(`CHROMIUM=/path/to/chromium` selects an existing browser). These use an isolated local static server, sample
account fixtures and the production Content Security Policy; external requests are blocked. They check keyboard
navigation, Undo requests, offers, both themes at phone/desktop widths, device wording and zoom configuration.
Desktop checks also cover 1100–2560px, packing without overlaps, expanding content, hidden/reordered cards, a day
without a sidebar and returning to Today after resizing another screen.
They do not verify authenticated backend behaviour. Set `WEB_UI_SCREENSHOTS=test-results/web-ui` for sample
previews. The Web UI checks workflow runs the same checks on web pull requests and production pushes.

## Deploys

Every push to each Worker's production branch is built and deployed by Cloudflare automatically, so work happens on
other branches until it's ready to go live. By hand: `npx wrangler deploy` at the root (Today) or in `email/` (Mail).
