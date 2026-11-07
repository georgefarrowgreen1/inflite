# InFlite for Mac — 0.1.0 beta 3

The first native SwiftUI slice of InFlite. macOS 14+, Apple silicon and Intel.

## Native now

**Today, Apps, You and navigation** are SwiftUI. Today decodes the existing boot/cards API into native weather,
fitness, chat and markets summaries, day briefing and Coming Up. It honours card order/visibility and shows loading,
empty, failure and last-loaded states. You renders the account's identity and native morning, Quiet Hours and card
visibility controls. Save buttons call the existing account-backed API and show the result; no server contract changes.
The visual language retains the website's exact SVG logos, soft sky palette and rounded glass cards.

## Still web-based

Sign-in, registration, profile/password/passkey security and full Weather/Fitness/Markets/Mail/Chat interfaces use
WebKit and are labelled Website. Complex day actions link explicitly to the website. The account's Mail permission
and Chat's mobile restriction remain in force. No new authentication system or native password form is introduced.

Sign in through the sheet's existing Today/account flow. Native requests read applicable account cookies from that
WebKit store in memory. Networking is ephemeral: no passwords, tokens or API responses are written to a native
database, shared cookie jar or URL cache. API redirects are refused. Only applicable account cookies go to the exact
production API origin. Session renewal is returned to WebKit. The default browser keeps its own session.

Sign-out ends the server session before clearing local website data. Local clearing alone is also available, with a
confirmation explaining that unsynced local drafts are lost.

## Install and build

Download the **InFlite-Mac-0.1.0-beta.3** artifact from a successful **InFlite Mac beta** Actions run (GitHub sign-in
required; artifacts expire after 14 days). Open the DMG and drag InFlite to Applications.

This development beta is ad-hoc signed, not Developer ID signed or notarized. macOS may block opening. Only approve
builds obtained from this repository, using System Settings → Privacy & Security if Open Anyway is offered.
Wider distribution requires Apple signing and notarization.

With Xcode 15+ selected:

```sh
bash mac/scripts/build-beta.sh
open mac/dist/InFlite.app
```

No third-party Swift dependencies. Core tests decode existing backend fixtures and check signed-out handling,
card ordering, routes and cookie isolation. The Mac workflow builds both architectures, compiles site SVGs, verifies
the bundle/signature, launches SwiftUI and captures both themes. Normal capture uses the real API without an account.
Additional captures pass an explicit public fixture and display SAMPLE DATA; account writes are disabled in that mode.
Normal launch never uses fixtures. Reports identify the surface as SwiftUI and whether sample data was used.

## Shortcuts and limits

⌘1 Today · ⌘2 Chats · ⌘3 Apps · ⌘4 You · ⌘R Refresh · ⌘F Find in a web screen · ⇧⌘B Open in browser · ⌘, Settings.

Authenticated reads, renewed cookies, preference saves, logout, account changes, accessibility, file transfers and
offline recovery need real-account Mac acceptance. Signed-out API checks and sample previews do not prove these flows.
No website source or production configuration is changed by this branch.

Full app screens, profile/security editing and advanced day actions remain web-based. Background push, native Chat,
badges and auto-updates are not implemented. Passkeys/OAuth require signing and real-device verification. Morning and
Quiet Hours edits affect the account's existing registered notification devices; this Mac is not registered for push.
