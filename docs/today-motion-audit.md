# Today motion audit

Audited against InFlite `5806802` and georgefarrowgreen `bd9eafb7`. Prepared as Today 1.98, with a consistent iOS-style motion system for the web.

## Motion rules

| Interaction | Result |
| --- | --- |
| Today, Apps and You | 280 ms fade with a 5 px settle; navigation remains fixed |
| Open a page / go back | 460 ms directional push/pop with restrained parallax |
| Open a card | 460 ms shared-card transition where supported; a small entrance otherwise |
| Buttons and controls | 100 ms press, 380 ms spring return; gentle scale appropriate to the target |
| Switches and selection lenses | One shared spring curve, with a cubic-bezier fallback |
| Sheets | 460 ms rise on a phone; a small scale/translation on desktop; 300 ms dismissal |
| Cancel a sheet drag | Follow the finger, then spring back without replaying the opening animation |
| Nested sheet pages | Short directional movement on push and back |
| Profile menu and toasts | Small spring movement and opacity; the menu opens close to its final size |
| Today cards, welcome and account panes | Shared timing and easing, without changing layout measurements |
| Reduced motion | No spatial press feedback, animated selection travel or decorative loops; short navigation fades |

## Findings addressed

- A skipped View Transition could run its old update callback after a newer route started. Each transition now owns a generation; obsolete callbacks cannot render an old page or clear a newer transition's state.
- Transitions now clean up on completion, cancellation, another navigation, sign-out, backgrounding and a switch to reduced motion. A bounded watchdog keeps a failed snapshot from holding the page.
- Fallback animations remove their event listeners and temporary classes. They do not retain a transform after finishing. Full-height screens containing fixed composers fade instead of creating a new containing block.
- Full-screen navigation blur and animated brightness filters were replaced by opacity and transforms. The header, bottom navigation and desktop rail remain separate from page motion.
- Sheet drag listeners belong to the sheet lifecycle. Other pointers are ignored; cancellation, backgrounding or loss of window focus returns the sheet safely. Dismissal uses the animation's own completion with a timeout fallback.
- Notification swipes previously treated `pointercancel` like a completed swipe. Cancellation and interruption now return the card; closing a sheet during a gesture cannot clear its notification.
- Section swipes release preview classes, properties, timers and listeners on interruption, resize and teardown. A stale gesture cannot navigate another app. Chart and map gestures retain ownership of their input.
- Decorative background loops pause when Today is hidden. Animation libraries, global animation loops and persistent compositor hints were not added.
- Desktop app re-selection now respects reduced motion when returning to the top.
- The day-history disclosure has an explicit keyboard tab stop, including in WebKit.

## Coverage

Reviewed Today’s day summary, timeline, app cards, Apps launcher and editor, You panes and folders, search, profile menu, notifications, shared controls, nested sheets, integrated app navigation, section swipes, fixed Chat composer, welcome screen and shared 404. The 404 already has reduced-motion rules and lightweight CSS animation, and its design was retained. Forecast, training, account and messaging data logic was unchanged.

The regression harness now supports WebKit and comparison against an unchanged public directory. WebKit screenshot capture is kept out of strict CSP tests because Playwright injects a stylesheet while taking its screenshots; Chromium supplies the preview artifacts. The offline-reload check continues in Chromium: Playwright WebKit cannot reload the intercepted localhost service-worker fixture offline.

The framework test's existing assertions were compared against unchanged production first. Six stale assertions were aligned with current behavior: the Edit glyph, numeric header compaction, compact-header preservation between sections, settled scroll restoration, full-screen header state and Chat's existing `reply` facade. Accessibility checking no longer injects CSP-blocked resource-preload styles.

The framework JavaScript budget remains bounded at 30 KiB gzip, including cancellation and gesture cleanup; no runtime dependency was added. The request coordinator retains its separate budget.

## Verification

| Check | Result |
| --- | --- |
| Full app unit suite | 1,854 passed, 5 existing skips, 0 failed |
| Final focused routing / UI / day / notification units | 103 passed, 1 existing skip, 0 failed |
| Today in Chromium | 33 passed, 0 failed |
| Today in WebKit | 32 passed, 1 offline-fixture skip, 0 failed |
| Final background/resume and interrupted notification tests | 2 passed in each engine |
| Root request, body and shared-page checks | 22 passed |
| Shared framework: navigation, sheets, focus, accessibility and module lifecycle | 308 checks passed |
| Real Chat composer and module | 81 checks passed, including keyboard, rotation, resume and tap targets |
| Real Weather / Fitness / Markets section swipes | All 28 gesture, cleanup and layout checks passed; Fitness's frame check passed |
| Parse and whitespace checks | Passed |

Phone and desktop screenshots were inspected; the existing page layouts and navigation positions were preserved. Test data is synthetic. Previews are in `/tmp/today-motion/final-previews/`.

### Performance limit

The swipe suite's strict “every frame under 40 ms at 4× CPU throttling” assertion failed for Weather and Markets on both unchanged production and this pass. The assertion was retained. The other 29 checks passed in each run.

| Throttled swipe | Production's slowest reported frame | This pass's slowest reported frame |
| --- | --- | --- |
| Weather | 100 ms | 67 ms |
| Fitness | ≤40 ms | ≤40 ms |
| Markets | 67 ms | 50 ms |

These are single comparisons on a shared cloud runner. They show no new failure relative to production, but do not establish a physical-iPhone frame-rate guarantee. A device check remains useful before release, especially on an older phone.

### Reproduce

In `inflite`:

```sh
npm run test:web
WEB_UI_BROWSER=webkit npm run test:web
node --test tests/requests.test.cjs tests/body.test.cjs tests/not-found.test.cjs
```

In the sibling `georgefarrowgreen` checkout:

```sh
node --test .tools/tests/unit/*.test.mjs
node .tools/tests/roofkit.mjs
node .tools/tests/roofchatcomposer.mjs /tmp/chat-check /tmp/chat-check/composer
node .tools/tests/roofchatmount.mjs /tmp/chat-check /tmp/chat-check/mount
HUB_LOCAL_PROXY=1 STATE=/tmp/swipe-check .tools/tests/run.sh roofswipe
```

`HUB_LOCAL_PROXY=1` limits the browser's test proxy to local `.ifl.test` / `.gfg.test` hosts. It corrects this cloud runner's routing of those synthetic hostnames. It is not used in the app.

Release prepared as Today 1.98 on `codex/today-motion-audit`, with matching regression checks in the sibling repository.
