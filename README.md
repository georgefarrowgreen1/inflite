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
