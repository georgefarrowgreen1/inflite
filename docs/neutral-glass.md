# Adaptive glass

The shared Appearance stylesheet uses a neutral tint over the live backdrop. Blur softens moving text. Saturation preserves the colours of messages, artwork and maps. Compact controls use less blur than large windows. Each theme has a luminance adjustment and the tint keeps labels readable at maximum intensity. Glass off, zero intensity, reduced transparency, increased contrast and forced colours use solid surfaces.

The shell refracts the backdrop with a vector displacement field in browsers that support SVG backdrop filters. Its coordinates are relative to the glass element so a dock retains its flat centre on high-density displays. On WebKit the compositor supplies the translucent glass. A rounded bevel in the wallpaper layer samples the original orb canvas at its current resolution and frame rate. Page content paints over that layer, including isolated Mail frames. Only the visible bevels are drawn, with geometry reused between artwork frames.

Edit the shared material in `.tools/inflite/tokens.css` and the before-paint preference handling in `.tools/inflite/appearance.js` in the Apps repository. Run `node .tools/appearance.mjs ../inflite/today/public/theme.js ../inflite/email/public/theme.js` and `node .tools/iflmenu.mjs ../inflite/today/public ../inflite/email/public`. Regenerate the minified app assets and run `node .tools/wxshell.mjs` for Weather’s offline assets. Refresh the shell’s asset integrity with `npm run release:shell -- --assets`.

The browser tests measure foreground contrast over light and dark artwork in all six palettes. They also scroll a coloured message beneath the dock and quick reply, compare solid mode, and check that a 3× scene bends at the rim while its centre stays aligned.
