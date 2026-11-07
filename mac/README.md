# InFlite for Mac — 0.1.0 beta 2

The InFlite website in a lightweight native Mac window. macOS 14 Sonoma or later, Apple silicon and Intel.

## Same InFlite, on Mac

The app opens **https://inflite.ai/** directly. The live website provides its real desktop navigation, app rail,
logos, typography, colours, glass, themes, transitions, settings and account screens. There is no separate Mac launcher,
recreated dashboard, simulated data or second sidebar. At narrower widths the site uses its own responsive layout.
Website updates appear in the app without rebuilding the Mac shell.

The Mac window adds back/forward/reload, in-page find, native file selection and save dialogs, Mac menus and browser
handoff for external links. The **Go** menu uses the website's own hub routes for Today, Chats, Apps, You, Mail,
Weather, Fitness and Markets. Normal navigation inside the website retains its existing SPA behaviour and draft handling;
Mac Go menu actions perform page navigation. Account permissions and Chat's existing computer restrictions remain the
website's own. The Mac app does not bypass them.

All native branding uses exact SVG artwork from the website, compiled into a vector asset catalogue. See
`Resources/BrandAssets.md` for source paths. Generic system symbols are used only for window controls and actions.

## Install the beta

Open the **InFlite Mac beta** workflow in this repository's Actions tab. Download the artifact from a successful run
(GitHub sign-in required), open the DMG, and drag InFlite to Applications. The artifact includes an app ZIP, checksums,
this guide, website-load reports and light/dark screenshots. Artifacts expire after 14 days.

The beta is ad-hoc signed, not Apple Developer ID signed or notarized. macOS may prevent it from opening. Only approve
a beta obtained from this repository, using System Settings → Privacy & Security if macOS offers Open Anyway.
Developer ID signing and notarization are required before wider distribution.

Sign in using InFlite's existing account page and password. Cookies are kept in one persistent WebKit website data
store. The default browser has its own sign-in: opening Safari will not transfer its cookies into the app or vice versa.

| Shortcut | Action |
|---|---|
| ⌘1–4 | Today, Chats, Apps, You |
| 1–4, / | The website's own tab and search shortcuts, when not typing |
| ⌘R | Reload the current page |
| ⌘F | Find on page |
| ⇧⌘B | Open the current page in the default browser |
| ⌘, | Mac window settings and local data controls |

Use the website's own preferences for its appearance and glass styling. Mac window settings provide the default
system/light/dark appearance; explicit website preferences continue to take precedence on the page.
Clearing website data requires confirmation and also removes unsynced local drafts.

## Beta limits

- Live pages need an internet connection. Background push, native badges, auto-updates and native sharing are not implemented.
- Mail remains owner-only; Chat remains restricted to its supported devices by the website.
- Passkeys and OAuth callbacks are not verified in this ad-hoc build. Apple signing, associated-domain support and
  real-device account testing are required before claiming parity with Safari. Browser sign-in does not sign this app in.
- Authenticated flows, attachments, logout and accessibility need a real-account Mac acceptance pass.
- Screenshot builds open the actual public website without an account. If the runner cannot reach it, the capture step
  fails and the report explains the HTTP/load result; installer artifacts are retained for diagnosis.

## Build on a Mac

Install Xcode 15 or later and select its command-line tools, then:

```sh
bash mac/scripts/build-beta.sh
open mac/dist/InFlite.app
```

No third-party Swift dependencies. `swift test --package-path mac` checks hub routes and navigation restrictions.
The packaging script compiles the site's SVG assets, builds both architectures, validates the bundle and ad-hoc signature,
and creates ZIP and DMG files. CI launches the app, verifies the public page loaded and captures both themes.
It does not change website source, production configuration or account data.

## Acceptance before wider beta

1. Launch on Apple silicon and Intel; compare with inflite.ai at the same viewport size in Safari, including dark mode.
2. Sign in with a test account. Check the website's own rail, tabs, search, settings, transitions and permissions.
3. Leave a draft and navigate using the website; verify its draft handling, then test Go menu navigation separately.
4. Upload an attachment, save a download, use find and follow an external link into the default browser.
5. Sign out through the website and verify subsequent authenticated requests are rejected.
6. Clear local data; confirm the app returns to the signed-out website.
7. Check interrupted connections, VoiceOver, WebKit process recovery, Apple signing and notarization.
