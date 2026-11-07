# Mac beta 4 — native foundations

Today, Apps, You and navigation are real SwiftUI views. Keep the website's exact SVGs, soft sky and night palettes,
system type, rounded glass cards and Today/Chats/Apps/You order. Do not manufacture account data.

Native Today decodes existing boot/cards JSON: backend words, meaningful summaries, card order/visibility, empty/error
states and last-loaded time. Day actions remain explicitly web-based. You offers account-backed morning, Quiet Hours
and card visibility controls. The sidebar, cards, forms and account identity are native controls.

WebKit is confined to sign-in and unfinished app sections, labelled Website. No native password form or new identity
system is introduced. Profile and security editing still use the canonical website.

Fixture previews use the existing public backend tests, carry a visible SAMPLE DATA banner and disable account writes.
Normal launch requests the real API. Capture reports identify the surface as SwiftUI and state whether fixtures were
used. Never present a sample layout as verified authenticated behaviour.

Native controls use switch-style toggles for on/off, rounded glass secondary buttons, blue primary save buttons and
rounded time menus. Disabled and destructive states stay distinct. Saves remain explicit; visual changes do not add
autosave or change the account API. Reduced-motion settings suppress pressed-state animation.
