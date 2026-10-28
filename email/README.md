# Mail

A mail client for `email.inflite.ai`, built as a Cloudflare Worker with a Liquid Glass web app
for iPhone and iPad. Mail comes in through Cloudflare Email Routing and goes out through
Cloudflare Email Sending.

- **Receiving:** Email Routing delivers mail to the Worker's `email()` handler, which parses it
  (`postal-mime`) and stores it in D1 (metadata) and R2 (bodies, attachments, original `.eml`).
- **Sending:** the `send_email` binding (`env.EMAIL.send`), with replies threaded via
  `In-Reply-To` / `References`.
- **Sign-in:** your inflite account (account.inflite.ai). Its cookie covers all of inflite.ai, so the
  Worker passes it to the account site, which says whether this is the site's admin. Only the admin can
  open Mail, with a passkey on the account, and Mail asks you to confirm it's you every 12 hours (the same
  rule as Admin). Signing in from Mail goes to the account page and comes back, which also works for Mail
  added to the Home Screen. The account-side code is `functions/_mailapp.js` in the georgefarrowgreen repo.
- **One stream, not folders:** every conversation lands in one stream, split into **People** and
  **Updates** as it arrives (by a sender rule you set, or by the signs bulk mail carries: an
  unsubscribe link, a mailing list, no-reply senders). A floating tab bar at the foot of the screen
  holds People, Updates, Later and Done, with search beside it (it opens into a field); the title is
  the tab you're on, and tapping it shows only Unread, Flagged or With Attachments, narrows to one
  @inflite.ai address, or opens the Trash. Conversations are grouped
  by day, Updates read as a one-line digest, and clearing People shows what's still around
  elsewhere. Swipe right for **Done**; a new reply brings a conversation back. Search takes
  `from:`, `to:`, `file:`, `has:attachment`, `has:image`, `has:pdf`, `is:unread`, `is:flagged`,
  `is:done`, `before:` and `after:`; plain words match file names too. Before you type it shows
  your recent searches, and as you type a name it suggests the people you write to. A search that finds nothing says
  so in words, offers the searches beside it that do find something (sent to them, mentioning them, in Trash),
  each with how many it finds, and Clear filters. `in:trash` searches the Trash, which is otherwise left out.
- **Your photo** opens InFlite's menu, the same one every InFlite app has (its copy is between the marks in
  `public/app.js` and `public/app.css`, from the georgefarrowgreen repo's `.tools/inflite/menu.js` and `menu.css`, by
  `node .tools/iflmenu.mjs ../inflite/email/public`; change it there): you (to your account), Mail's
  Notifications, Remote Images and Settings, and Mail's version with Sign Out. After an update, it says so once.
- **Settings** (in the profile menu, or the settings button on Mail's card on the account page, which opens
  `email.inflite.ai/#settings`): your addresses on the domain, each with the name it's sent under, a colour, where its
  mail goes (Auto, People or Updates) and whether it notifies; a new one is just a name, as Email Routing's catch-all
  already brings every address here. Also the default address, what happens to mail to any address that isn't listed
  (Keep, or Turn Away: refused, so its sender hears), and a signature added under new messages and replies (each
  address can have its own). A reply goes from the address the mail came to, with that address's signature.
- **Attachments:** pictures show as a gallery in the message; pictures, PDFs and videos open in a
  full-screen viewer (swipe through, pinch or double-tap to zoom, swipe down to close, Share or Save).
- **Later:** swipe left (or the clock in a conversation) to put it away until a time: later today,
  this evening, tomorrow, the weekend, next week or a time of your own. A scheduled run every five
  minutes (the `triggers.crons` in `wrangler.jsonc`) brings it back to the top of the stream, unread.
- **Notifications:** turn on **Notifications** in the profile menu to get a notice for new mail in
  People (not Updates) and for conversations back from Later, with the unread count on the app icon.
  Web Push with a VAPID key Mail makes for itself and keeps in D1; nothing to configure.
- **App:** a static web app in `public/`, installable to the home screen, in the look of the other
  inflite apps: the stream on iPhone with conversations pushed over it (and an edge-swipe back), the
  two side by side on iPad and Mac, swipe actions, undo send, drafts and keyboard shortcuts.

Try the interface without a backend by adding `?demo` to the URL.

## One-time setup

1. **Create the Worker.** In Cloudflare, go to **Workers & Pages → Create → Import a repository**,
   pick this repo, set **Root directory** to `email`, **Deploy command** to `npx wrangler deploy`,
   and **production branch** to `claude/inflite`. The first deploy creates the D1 database and
   R2 bucket and attaches `email.inflite.ai` as a custom domain.
2. **Deploy the accounts change** (the `claude/inflite-mail-signin` branch of the georgefarrowgreen
   repo), so account.inflite.ai knows about Mail.
3. **Route incoming mail.** In **Email → Email Routing** for `inflite.ai`, enable routing, then
   under **Routing rules** set the **Catch-all** action to **Send to a Worker → inflite-email**
   (or add a rule per address).
4. **Check the sender settings** in `wrangler.jsonc`: `DEFAULT_FROM` is the address mail goes out
   from by default (you can send from any `@inflite.ai` address), and mail goes out under your account's
   name. Set a `DISPLAY_NAME` variable to use a different name.

Email Sending needs the Workers Paid plan while it is in beta.

Optional: set a `FORWARD_TO` variable to a verified Email Routing destination to also forward a
copy of every incoming message there.

## Install on iPhone or iPad

Open `https://email.inflite.ai` in Safari, tap **Share → Add to Home Screen**. Notifications on
iPhone and iPad only work in Mail opened from the Home Screen icon (iOS 16.4 or later); if it was
added before notifications existed, remove it and add it again.

## Local development

```sh
cd email
npm install
npm run dev
```

Signing in needs the account site. Set `ACCOUNT_ORIGIN` to wherever it runs; both sites must share a
domain and port, as they do in production. Without it, use `?demo` to try the interface.

Simulate an incoming message:

```sh
curl -X POST 'http://localhost:8787/cdn-cgi/handler/email?from=a@example.com&to=hello@inflite.ai' \
  --data-binary @message.eml
```

Sent mail is simulated locally; Wrangler prints where it wrote each message.
