# inflite

A basic "Hello World" web app running on a Cloudflare Worker.

## Run locally

```sh
npm install
npm run dev
```

Then open http://localhost:8787. A JSON endpoint is available at `/api/hello`.

## Deploy

```sh
npx wrangler login   # first time only
npm run deploy
```

## Deploy via GitHub Actions

`.github/workflows/deploy.yml` deploys on every push to `main` (or this branch),
and can be run manually from the Actions tab. It needs two repository secrets
(Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN` — create one from the "Edit Cloudflare Workers" template
- `CLOUDFLARE_ACCOUNT_ID` — shown on your Cloudflare dashboard
