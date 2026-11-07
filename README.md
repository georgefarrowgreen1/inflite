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

Today and modules inside its shell share button and switch rules in
`today/public/roof/controls.css`, imported by `roof.css`. The existing `.pill` and `.ifl-btn` names are aliases;
control sizes and interaction states live in that one file. App accents and theme colours remain in the existing
tokens. Standalone apps and Mail's separate document retain their own styles.

Morning plan history and Undo controls live under **What changed**. Offers needing a decision, ride guidance,
warnings and messages stay visible. The disclosure preserves its open state and keyboard focus across redraws.

Run the local UI checks with `npm ci`, `npx playwright install chromium`, then `npm run test:web`
(`CHROMIUM=/path/to/chromium` selects an existing browser). These use an isolated local static server, sample
account fixtures and the production Content Security Policy; external requests are blocked. They check keyboard
navigation, Undo requests, offers, both themes at phone/desktop widths, device wording and zoom configuration.
They do not verify authenticated backend behaviour. Set `WEB_UI_SCREENSHOTS=test-results/web-ui` for sample
previews. The Web UI checks workflow runs the same checks on web pull requests and production pushes.

## Deploys

Every push to each Worker's production branch is built and deployed by Cloudflare automatically, so work happens on
other branches until it's ready to go live. By hand: `npx wrangler deploy` at the root (Today) or in `email/` (Mail).
