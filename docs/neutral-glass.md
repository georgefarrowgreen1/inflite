# Neutral glass

Root 4.13 and the corresponding app releases remove theme colour from material surfaces. The shared Appearance runtime uses achromatic light and dark surface, inset and border values. Palette colours remain available to actions, selections, icons, status indicators and page artwork. Glass backdrop saturation is zero at every strength; blur, transparency, highlights, pointer responses and the saved strength preference retain their existing behavior.

This uses backdrop filtering, not a content filter. Photos, app artwork, charts and coloured controls keep their original colours. No new appearance preference, account migration or API contract is introduced. Reduced transparency, increased contrast, forced colours, glass-off and before-paint fallbacks retain their existing contracts. Native 4.10 immutable asset graphs remain unchanged.

Change `.tools/inflite/appearance.js` and `.tools/inflite/tokens.css` in the Apps repository, then run `node .tools/appearance.mjs ../inflite/today/public/theme.js ../inflite/email/public/theme.js` and `node .tools/iflmenu.mjs ../inflite/today/public ../inflite/email/public`. Regenerate app minified assets, then run `node .tools/wxshell.mjs` to fingerprint the actual Weather offline assets. Keep the paired framework revision in the Apps release fixture current.

Validation includes all six palettes in light and dark at glass strengths 0, 70 and 100, real material contrast against busy backdrops, coloured descendants and primary actions, actual Account cards in both browser engines, preference persistence, keyboard/touch/pointer behavior, native asset budgets and deployed source parity.
