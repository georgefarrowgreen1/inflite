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

## Automatic deploys

The repo is connected to Cloudflare Workers Builds, so every push to the
production branch is built and deployed by Cloudflare automatically.

## Email client

The `email/` folder contains inflite Mail, the mail client for `email.inflite.ai`.
See [email/README.md](email/README.md) for setup.
