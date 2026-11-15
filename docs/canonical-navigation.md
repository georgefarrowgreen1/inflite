# One public InFlite origin

New app links use `https://inflite.ai`: `/chats/`, `/weather/`, `/fitness/`, `/markets/`, `/mail/`, `/account/`, `/auth/` and `/status/`. Sessions kept by an earlier frontend are normalized before generating public navigation. Fixed native service addresses remain internal transports, including Mail's API/body frames and Apple Health's Origin-less Shortcut endpoint.

A forced cross-origin redirect cannot transfer browser storage. Legacy Chat keeps private CryptoKeys, outboxes and drafts in its own IndexedDB; Fitness can keep unfinished imports and pending edits; Markets can keep pending local state. Their existing standalone documents remain available for recovery, alongside legacy APIs and open tabs. This release does not pretend to migrate or erase that storage. Public links already point to the unified site. Weather can also retain in-flight sign-in words, so its legacy document stays available. Status documents redirect directly; APIs, assets and service-binding requests do not.

Mail's `/mail/standalone/` is a canonical outer page for legacy features and origin-local drafts. The existing Mail document stays in a separate-origin iframe. A top-level visit to email.inflite.ai moves to this wrapper; iframe documents, API requests and `/body/*` stay isolated. The wrapper's sign-in return path is explicitly allowlisted.

A canonical app boot whose availability probe fails shows a recoverable status with an explicit Retry. It never redirects or reloads itself as its own fallback. Retry asks the server again before choosing the next state.

The app dock mounts once outside the animated page containers. Today, Files and native apps share its viewport anchor; page changes do not move or remount it. Its separate View Transition layer stays stationary while the page animates. Keyboard and native full-screen chrome policies can still hide it, and account teardown removes it.
