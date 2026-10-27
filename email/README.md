# inflite Mail

A mail client for `email.inflite.ai`, built as a Cloudflare Worker with a Liquid Glass web app
for iPhone and iPad. Mail comes in through Cloudflare Email Routing and goes out through
Cloudflare Email Sending.

- **Receiving:** Email Routing delivers mail to the Worker's `email()` handler, which parses it
  (`postal-mime`) and stores it in D1 (metadata) and R2 (bodies, attachments, original `.eml`).
- **Sending:** the `send_email` binding (`env.EMAIL.send`), with replies threaded via
  `In-Reply-To` / `References`.
- **App:** a static web app in `public/`, installable to the home screen. It has a navigation
  stack on iPhone (with an edge-swipe back gesture) and a split view on iPad, plus swipe actions,
  undo send, drafts, search, and keyboard shortcuts.

Try the interface without a backend by adding `?demo` to the URL.

## One-time setup

1. **Create the Worker.** In Cloudflare, go to **Workers & Pages → Create → Import a repository**,
   pick this repo, set **Root directory** to `email`, **Deploy command** to `npx wrangler deploy`,
   and **production branch** to `claude/inflite`. The first deploy creates the D1 database and
   R2 bucket and attaches `email.inflite.ai` as a custom domain.
2. **Set the password.** In the Worker, open **Settings → Variables and Secrets** and add a
   secret named `APP_PASSWORD`. This is the password for signing in to the app.
3. **Route incoming mail.** In **Email → Email Routing** for `inflite.ai`, enable routing, then
   under **Routing rules** set the **Catch-all** action to **Send to a Worker → inflite-email**
   (or add a rule per address).
4. **Check the sender settings** in `wrangler.jsonc` (`DEFAULT_FROM`, `DISPLAY_NAME`). You can
   send from any `@inflite.ai` address.

Email Sending needs the Workers Paid plan while it is in beta.

Optional: set a `FORWARD_TO` variable to a verified Email Routing destination to also forward a
copy of every incoming message there.

## Install on iPhone or iPad

Open `https://email.inflite.ai` in Safari, tap **Share → Add to Home Screen**.

## Local development

```sh
cd email
npm install
echo 'APP_PASSWORD=dev' > .dev.vars
npm run dev
```

Simulate an incoming message:

```sh
curl -X POST 'http://localhost:8787/cdn-cgi/handler/email?from=a@example.com&to=hello@inflite.ai' \
  --data-binary @message.eml
```

Sent mail is simulated locally; Wrangler prints where it wrote each message.
