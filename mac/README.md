# InFlite for Mac — 0.1.0 beta 1

A native SwiftUI workspace around InFlite's existing services. macOS 14 Sonoma or later, on Apple silicon or Intel.

## Get the beta

Open the **InFlite Mac beta** workflow in this repository's Actions tab. Download the artifact from a successful
run (GitHub sign-in required), then open the DMG and drag InFlite to Applications. The artifact also contains an app
ZIP, SHA-256 checksums, a native screenshot and these instructions. Artifacts expire after 14 days.

This development beta is ad-hoc signed, not Apple Developer ID signed or notarized. macOS may prevent it from opening.
Only approve a beta you obtained from this repository, using System Settings → Privacy & Security if macOS offers
Open Anyway. Developer ID signing and notarization are required before wider distribution.

## What works in beta 1

- A native workspace, translucent sidebar, first-launch welcome, app switcher and light/dark/system appearance.
- Today, Mail, Weather, Fitness, Markets and Account in WebKit, using the real services and existing permissions.
- One persistent website data store for sign-in cookies across the app's views. No native password storage or API keys.
- Back, forward, reload, native file selection and save dialogs, in-page find, standard web editing and scrolling.
- App views are retained when switching destinations, preserving their in-progress state during the session.
- Known InFlite and sign-in hosts stay in the app; other web links open in the default browser.
- Clear sign-in and website data from Settings, after confirmation. This also removes unsynced local drafts.

Sign in from **Your account** using an existing account and password. There is no demo data in the workspace.
Your browser has a separate sign-in; opening Safari will not transfer its cookies into the app or vice versa.

| Shortcut | Action |
|---|---|
| ⌘0 | Workspace |
| ⌘1–5 | Today, Mail, Weather, Fitness, Markets |
| ⌘K | Switch app |
| ⌘R | Reload current page |
| ⌘F | Find on page |
| ⇧⌘B | Open current page in the default browser |
| ⌘, | Mac settings |

## Current limits

- Chat deliberately enforces its existing iPhone/iPad restriction; the Mac app explains that limit and does not spoof a phone.
- Mail remains admin-only. The app does not grant extra account permissions.
- Passkeys and third-party OAuth callbacks are not verified in this ad-hoc build. WebKit associated-domain support,
  Apple signing and real-device sign-in testing are required before claiming parity with Safari.
- Background push notifications, native badges, offline account data, auto-updates, native sharing and new-window
  workflows are not implemented. Live app pages need an internet connection.
- These are the existing service interfaces inside a native shell; the individual app screens have not been rewritten.
- The automated screenshot uses `--design-preview`, a network-free view of the actual native workspace, not an
  authenticated account. Password sign-in, attachments and logout still need a real-account Mac acceptance pass.

## Build on a Mac

Install Xcode 15 or later and select its command-line tools, then:

```sh
bash mac/scripts/build-beta.sh
open mac/dist/InFlite.app
```

No third-party Swift dependencies. `swift test --package-path mac` checks host navigation and sign-in routing.
The packaging script builds both architectures, validates the bundle and ad-hoc signature, and creates ZIP and DMG files.
CI builds and launches the real Mac app on a macOS runner. It does not deploy either website or change account data.

## Acceptance before wider beta

1. Launch on Apple silicon and Intel, resize to the minimum size, test dark mode and VoiceOver.
2. Sign in with a test account; check Today and permitted apps. Confirm Mail remains unavailable for non-admins.
3. Leave a draft, switch apps and return; restart and verify the website's own draft recovery.
4. Upload an attachment, save a download, use find, and open an external link in the default browser.
5. Sign out through Account; revisit all open services and verify their server authorization rejects signed-out actions.
6. Clear local data and confirm the app returns to Workspace without a signed-in session.
7. Test interrupted connections and WebKit process recovery. Complete Apple signing and notarization.
