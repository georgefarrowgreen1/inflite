# InFlite 4.21 — launcher refinement

The app library uses the existing neutral glass window with one set of insets. Its sheet-specific outer padding and separate sticky-header material are removed. Edit sits beside the title; Search spans the content width. A tighter labelled icon grid, a hidden idle edit status and a shared utility group remove the unused vertical space. Security and More use aligned glyphs and disclosure indicators. The launcher body scrolls independently so its header stays available on smaller screens and with the keyboard open. Other sheets retain their existing styling.

Apps is now a single account-owned window. A pending return transition carries a route identity, and an existing open/closing launcher is reused rather than stacked. Route replacement releases a pending request; account teardown closes and retires it. A regression test reproduced three simultaneous launchers before the fix and verifies one afterwards.

The 4.20 icon transitions, native app mounts, focus trap, permission checks, draft/scroll preservation and reduced-motion behavior remain. Styling stays in the optional launcher asset. Superseded launcher rules are removed from workspace.css; existing core, base-shell, native-app and aggregate OS budgets are retained.

Checks cover single-instance behavior under rapid taps; padding and header/search alignment; compact height; six fixed dock slots and 36px dock icons; search and favourites; keyboard/Escape; Chromium and WebKit; narrow, desktop and landscape layouts; app/Files/draft continuity; and security/offline/size boundaries.
