// InFlite Today, at inflite.ai: your day from all your apps on one page, and one morning notification instead of one
// from each. Everything shown comes from your InFlite account (this site's Worker passes your sign-in on to
// account.inflite.ai: today/src/index.js), worked out there by each app's own rules: this page only draws it (cards.js)
// and sends what you change (Edit, Morning). Signed out, it's InFlite's way in (index.html's, there without a script too).
import { CARD_KEYS, APP, esc, safe, hm, dayKey, dateLong, dateShort, G, cardHTML, placeholder, applyVars, tick } from "/cards.js";

// Today's build, shown in InFlite's menu (raised with each release)
const BUILD = "1.01";
// (what's new in it, said once it's in)
const NEWS = "Your day from every app on one page, and one morning notification instead of several";

// ==== InFlite's menu, shared: from .tools/inflite/menu.js by node .tools/iflmenu.mjs (change it there) ====
// InFlite's menu: one menu, the same in every app, opened from your photo. You (a tap to your account), the app's own
// few rows, and a foot with its version and Sign Out. With it: the same note in every app after it's updated itself,
// and the updater every app shares (updates, below).
// (Plain script, no imports: it's the same in a module and in Mail's script. Images only ever blob: or the app's own,
// as each app's rules allow; the apps' icons are drawn here, made blob: once each.)
const IFL = (() => {
  // (no app's page pinched bigger, as no app's is: iPhone takes no notice of a page's viewport saying so, only of its own
  // gesture events refused. A map or a photo still pinches itself, by its touches; menu.css says the rest, touch-action)
  for (const n of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(n, (e) => e.preventDefault(), { passive: false });
  const APPS = [["chat", "Chat"], ["weather", "Weather"], ["fitness", "Fitness"], ["markets", "Markets"], ["mail", "Mail"], ["today", "Today"], ["account", "Account"]];
  const NAME = Object.fromEntries(APPS);
  const ICONS = {"chat":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\".6\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4aa3ff\"/><stop offset=\"1\" stop-color=\"#0055d4\"/></linearGradient><radialGradient id=\"glow\" cx=\"220\" cy=\"120\" r=\"760\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0\"/></radialGradient><linearGradient id=\"low\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\".6\" stop-color=\"#002a80\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#002a80\" stop-opacity=\".25\"/></linearGradient><linearGradient id=\"rim\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".7\"/><stop offset=\".4\" stop-color=\"#fff\" stop-opacity=\".1\"/><stop offset=\".8\" stop-color=\"#fff\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\".25\"/></linearGradient><linearGradient id=\"face\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"1\" stop-color=\"#e6efff\"/></linearGradient><linearGradient id=\"side\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#b9d4fb\"/><stop offset=\"1\" stop-color=\"#7fa9ec\"/></linearGradient><filter id=\"cast\" x=\"-80%\" y=\"-80%\" width=\"260%\" height=\"260%\"><feGaussianBlur stdDeviation=\"22\"/></filter><filter id=\"bevel\" x=\"-5%\" y=\"-5%\" width=\"110%\" height=\"110%\"><feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"5\"/><feOffset dy=\"-9\" result=\"up\"/><feComposite in=\"SourceAlpha\" in2=\"up\" operator=\"out\" result=\"lo\"/><feFlood flood-color=\"#9fbff0\" flood-opacity=\".75\"/><feComposite in2=\"lo\" operator=\"in\" result=\"loS\"/><feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"3\"/><feOffset dy=\"6\" result=\"dn\"/><feComposite in=\"SourceAlpha\" in2=\"dn\" operator=\"out\" result=\"hi\"/><feFlood flood-color=\"#fff\"/><feComposite in2=\"hi\" operator=\"in\" result=\"hiL\"/><feMerge><feMergeNode in=\"SourceGraphic\"/><feMergeNode in=\"loS\"/><feMergeNode in=\"hiL\"/></feMerge></filter><clipPath id=\"sq\"><rect width=\"1024\" height=\"1024\" rx=\"224\"/></clipPath></defs><g clip-path=\"url(#sq)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#g)\"/><rect width=\"1024\" height=\"1024\" fill=\"url(#glow)\"/><rect width=\"1024\" height=\"1024\" fill=\"url(#low)\"/><g filter=\"url(#cast)\" opacity=\".58\"><path transform=\"translate(10 50) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\" fill=\"#001c5c\"/></g><g fill=\"url(#side)\"><path transform=\"translate(0 16) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 14) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 12) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 10) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 8) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 6) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 4) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 2) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/></g><g filter=\"url(#bevel)\"><path transform=\"translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\" fill=\"url(#face)\"/></g></g><rect x=\"4\" y=\"4\" width=\"1016\" height=\"1016\" rx=\"220\" fill=\"none\" stroke=\"url(#rim)\" stroke-width=\"8\"/></svg>","weather":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4f97f8\"/><stop offset=\"1\" stop-color=\"#2b69de\"/></linearGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd44f\"/><stop offset=\"1\" stop-color=\"#f9b929\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#f2f7ff\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"cloudClip\"><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"320\" cy=\"392\" r=\"192\" fill=\"url(#sun)\"/><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\" fill=\"#0b3a9e\" fill-opacity=\"0.16\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#cloudClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"320\" cy=\"392\" r=\"192\" fill=\"url(#sun)\"/></g><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\" fill=\"url(#glass)\"/></g><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","fitness":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ff8457\"/><stop offset=\"1\" stop-color=\"#ee4b2f\"/></linearGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd85a\"/><stop offset=\"1\" stop-color=\"#ffb52e\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#fff4f0\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"wheelClip\"><path clip-rule=\"evenodd\" d=\"M 512 270 A 290 290 0 1 1 511.9 270 Z M 512 380 A 180 180 0 1 0 512.1 380 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"700\" cy=\"330\" r=\"150\" fill=\"url(#sun)\"/><path fill-rule=\"evenodd\" d=\"M 512 270 A 290 290 0 1 1 511.9 270 Z M 512 380 A 180 180 0 1 0 512.1 380 Z\" fill=\"#8f1d0b\" fill-opacity=\"0.18\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#wheelClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"700\" cy=\"330\" r=\"150\" fill=\"url(#sun)\"/></g><rect width=\"1024\" height=\"1024\" fill=\"url(#glass)\"/></g><path fill-rule=\"evenodd\" d=\"M 512 270 A 290 290 0 1 1 511.9 270 Z M 512 380 A 180 180 0 1 0 512.1 380 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","markets":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4fd98d\"/><stop offset=\"1\" stop-color=\"#169a5b\"/></linearGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd85a\"/><stop offset=\"1\" stop-color=\"#ffb52e\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.86\"/><stop offset=\"1\" stop-color=\"#effff5\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"barsClip\"><path d=\"M 294 560 H 346 A 44 44 0 0 1 390 604 V 748 A 44 44 0 0 1 346 792 H 294 A 44 44 0 0 1 250 748 V 604 A 44 44 0 0 1 294 560 Z M 486 442 H 538 A 44 44 0 0 1 582 486 V 748 A 44 44 0 0 1 538 792 H 486 A 44 44 0 0 1 442 748 V 486 A 44 44 0 0 1 486 442 Z M 678 318 H 730 A 44 44 0 0 1 774 362 V 748 A 44 44 0 0 1 730 792 H 678 A 44 44 0 0 1 634 748 V 362 A 44 44 0 0 1 678 318 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"720\" cy=\"300\" r=\"150\" fill=\"url(#sun)\"/><path d=\"M 294 560 H 346 A 44 44 0 0 1 390 604 V 748 A 44 44 0 0 1 346 792 H 294 A 44 44 0 0 1 250 748 V 604 A 44 44 0 0 1 294 560 Z M 486 442 H 538 A 44 44 0 0 1 582 486 V 748 A 44 44 0 0 1 538 792 H 486 A 44 44 0 0 1 442 748 V 486 A 44 44 0 0 1 486 442 Z M 678 318 H 730 A 44 44 0 0 1 774 362 V 748 A 44 44 0 0 1 730 792 H 678 A 44 44 0 0 1 634 748 V 362 A 44 44 0 0 1 678 318 Z\" fill=\"#05502b\" fill-opacity=\"0.2\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#barsClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"720\" cy=\"300\" r=\"150\" fill=\"url(#sun)\"/></g><rect width=\"1024\" height=\"1024\" fill=\"url(#glass)\"/></g><path d=\"M 294 560 H 346 A 44 44 0 0 1 390 604 V 748 A 44 44 0 0 1 346 792 H 294 A 44 44 0 0 1 250 748 V 604 A 44 44 0 0 1 294 560 Z M 486 442 H 538 A 44 44 0 0 1 582 486 V 748 A 44 44 0 0 1 538 792 H 486 A 44 44 0 0 1 442 748 V 486 A 44 44 0 0 1 486 442 Z M 678 318 H 730 A 44 44 0 0 1 774 362 V 748 A 44 44 0 0 1 730 792 H 678 A 44 44 0 0 1 634 748 V 362 A 44 44 0 0 1 678 318 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","mail":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3fd0c6\"/><stop offset=\"1\" stop-color=\"#119a95\"/></linearGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd85a\"/><stop offset=\"1\" stop-color=\"#ffb52e\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#effffd\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"envClip\"><path d=\"M 286 372 H 738 A 78 78 0 0 1 816 450 V 728 A 78 78 0 0 1 738 806 H 286 A 78 78 0 0 1 208 728 V 450 A 78 78 0 0 1 286 372 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"712\" cy=\"330\" r=\"168\" fill=\"url(#sun)\"/><path d=\"M 286 372 H 738 A 78 78 0 0 1 816 450 V 728 A 78 78 0 0 1 738 806 H 286 A 78 78 0 0 1 208 728 V 450 A 78 78 0 0 1 286 372 Z\" fill=\"#05534f\" fill-opacity=\"0.2\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#envClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"712\" cy=\"330\" r=\"168\" fill=\"url(#sun)\"/></g><rect width=\"1024\" height=\"1024\" fill=\"url(#glass)\"/><path d=\"M 240 404 L 512 610 L 784 404\" fill=\"none\" stroke=\"#05534f\" stroke-opacity=\"0.16\" stroke-width=\"22\" stroke-linecap=\"round\" stroke-linejoin=\"round\" filter=\"url(#frost)\" transform=\"translate(0 6)\"/><path d=\"M 240 404 L 512 610 L 784 404\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.95\" stroke-width=\"14\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g><path d=\"M 286 372 H 738 A 78 78 0 0 1 816 450 V 728 A 78 78 0 0 1 738 806 H 286 A 78 78 0 0 1 208 728 V 450 A 78 78 0 0 1 286 372 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","today":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#2e3a70\"/><stop offset=\"1\" stop-color=\"#141938\"/></linearGradient><radialGradient id=\"glow\" cx=\"512\" cy=\"512\" r=\"420\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#ffd44f\" stop-opacity=\"0.28\"/><stop offset=\"1\" stop-color=\"#ffd44f\" stop-opacity=\"0\"/></radialGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd84f\"/><stop offset=\"1\" stop-color=\"#f9b425\"/></linearGradient><linearGradient id=\"sheen\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\"0.38\"/><stop offset=\"0.55\" stop-color=\"#fff\" stop-opacity=\"0.08\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.6\" stop-color=\"#fff\" stop-opacity=\"0.25\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.1\"/></linearGradient><mask id=\"rim\"><rect x=\"-512\" y=\"-512\" width=\"2048\" height=\"2048\" fill=\"url(#rimFade)\"/></mask><filter id=\"shade\" x=\"-30%\" y=\"-30%\" width=\"160%\" height=\"160%\"><feGaussianBlur stdDeviation=\"16\"/></filter><linearGradient id=\"p0\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5aa9ff\"/><stop offset=\"1\" stop-color=\"#2b69de\"/></linearGradient><linearGradient id=\"p1\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ff8f62\"/><stop offset=\"1\" stop-color=\"#ef5236\"/></linearGradient><linearGradient id=\"p2\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4fdcd0\"/><stop offset=\"1\" stop-color=\"#119a95\"/></linearGradient><linearGradient id=\"p3\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9a8cff\"/><stop offset=\"1\" stop-color=\"#5a4fe0\"/></linearGradient></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><rect width=\"1024\" height=\"1024\" fill=\"url(#glow)\"/><g transform=\"rotate(-45 512 512)\"><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"#000\" fill-opacity=\"0.35\" filter=\"url(#shade)\" transform=\"translate(0 14)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#p0)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#sheen)\"/><rect x=\"433\" y=\"143\" width=\"158\" height=\"306\" rx=\"79\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\"0.75\" stroke-width=\"5\" mask=\"url(#rim)\"/></g><g transform=\"rotate(45 512 512)\"><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"#000\" fill-opacity=\"0.35\" filter=\"url(#shade)\" transform=\"translate(0 14)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#p1)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#sheen)\"/><rect x=\"433\" y=\"143\" width=\"158\" height=\"306\" rx=\"79\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\"0.75\" stroke-width=\"5\" mask=\"url(#rim)\"/></g><g transform=\"rotate(135 512 512)\"><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"#000\" fill-opacity=\"0.35\" filter=\"url(#shade)\" transform=\"translate(0 14)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#p2)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#sheen)\"/><rect x=\"433\" y=\"143\" width=\"158\" height=\"306\" rx=\"79\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\"0.75\" stroke-width=\"5\" mask=\"url(#rim)\"/></g><g transform=\"rotate(225 512 512)\"><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"#000\" fill-opacity=\"0.35\" filter=\"url(#shade)\" transform=\"translate(0 14)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#p3)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#sheen)\"/><rect x=\"433\" y=\"143\" width=\"158\" height=\"306\" rx=\"79\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\"0.75\" stroke-width=\"5\" mask=\"url(#rim)\"/></g><circle cx=\"512\" cy=\"530\" r=\"104\" fill=\"#7a4a00\" fill-opacity=\"0.35\" filter=\"url(#shade)\"/><circle cx=\"512\" cy=\"512\" r=\"104\" fill=\"url(#sun)\"/><circle cx=\"512\" cy=\"512\" r=\"101\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\"0.55\" stroke-width=\"5\" mask=\"url(#rim)\"/></svg>","account":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#7186ff\"/><stop offset=\"1\" stop-color=\"#4a45dc\"/></linearGradient><linearGradient id=\"head\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffc38f\"/><stop offset=\"1\" stop-color=\"#ff8d5c\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#f3f4ff\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"bodyClip\"><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"512\" cy=\"367\" r=\"170\" fill=\"url(#head)\"/><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\" fill=\"#1c1a8f\" fill-opacity=\"0.18\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#bodyClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"512\" cy=\"367\" r=\"170\" fill=\"url(#head)\"/></g><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\" fill=\"url(#glass)\"/></g><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>"};
  const GLYPHS = {
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    haptics: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M3 9v6M21 9v6"/>',
    faceid: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9v1.5M15 9v1.5M12 9v4h-1M9 16c1.7 1.3 4.3 1.3 6 0"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    rain: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 7.9"/><path d="M9 20l-1 2M13 20l-1 2M17 20l-1 2"/>',
    watch: '<rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
    data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    back: '<path d="m15 5-7 7 7 7"/>',
    signout: '<path d="M9.5 19.5h-3a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h3M15.5 16.5 20 12l-4.5-4.5M20 12H9.5"/>',
    install: '<path d="M12 4v12m-5-5 5 5 5-5M5 20h14"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    compose: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
    share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    addp: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  // InFlite Today, your day from every app, where it is: inflite.ai from any of its apps' addresses (the tests' ifl.test,
  // on its port, from theirs); anywhere else (a preview, georgefarrowgreen.pages.dev, this machine) none, as there's no
  // Today of its own there to go to
  const todayUrl = () => { const { protocol, hostname, port } = location; return /(^|\.)inflite\.ai$/.test(hostname) ? "https://inflite.ai/" : /(^|\.)ifl\.test$/.test(hostname) ? `${protocol}//ifl.test${port ? ":" + port : ""}/` : null; };
  const svg = (name, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[name] || ""}</svg>`;
  const urls = {};
  const iconUrl = (a) => urls[a] || (urls[a] = URL.createObjectURL(new Blob([ICONS[a]], { type: "image/svg+xml" })));
  const el = (tag, cls, ...kids) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    for (const k of kids) if (k != null && k !== false) n.append(k);
    return n;
  };

  // the same short note in every app
  // (read out from a place that's always there, unseen, as the home page's toast is: a note only just put in the page
  // with its words already in it often isn't read out at all)
  const sayEl = el("p", "ifm-say"); sayEl.setAttribute("role", "status"); sayEl.setAttribute("aria-live", "polite");
  document.body?.append(sayEl);
  let noteEl = null, noteT = 0;
  function note(app, title, sub) {
    noteEl?.remove();
    clearTimeout(noteT);
    const img = el("img", "ifm-note-ic"); img.src = iconUrl(app); img.alt = "";
    noteEl = el("div", "ifm-note", img, el("span", "ifm-note-tx", el("b", "", title), sub ? el("small", "", sub) : null));
    document.body.append(noteEl);
    if (!sayEl.isConnected) document.body.append(sayEl);
    sayEl.textContent = "";
    const n = noteEl;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (noteEl !== n) return; n.classList.add("on"); sayEl.textContent = sub ? `${title}. ${sub}` : title; }));
    // (what it said emptied as it goes, so the same words next time are a change, and read out again)
    noteT = setTimeout(() => { n.classList.remove("on"); sayEl.textContent = ""; setTimeout(() => n.remove(), 400); }, 3600);
  }
  // Notifications on this device, asked for in one tap (a phone asks each app for itself, and only from a tap): when
  // the app's opened from the account's Notifications page to turn them on (#notify), or from the menu's row where
  // they're off. What they tell you is the account's. turnOn(): asks the browser first thing, → true once they're on
  let allowEl = null;
  function allow(app, line, turnOn) {
    allowEl?.remove();
    const img = el("img", "ifa-ic"); img.src = iconUrl(app); img.alt = "";
    const go = el("button", "ifa-go", "Allow Notifications"), later = el("button", "ifa-later", "Not Now");
    go.type = later.type = "button";
    const sheet = el("div", "ifa-sheet", img, el("h2", "ifa-t", "Notifications on this device"), el("p", "ifa-p", line), go, later);
    sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", "Notifications on this device");
    const layer = allowEl = el("div", "ifa-layer", sheet), was = document.activeElement;
    const key = (e) => {
      if (e.key === "Escape") shut();
      else if (e.key === "Tab") { e.preventDefault(); (document.activeElement === go ? later : go).focus(); }
    };
    const shut = () => { document.removeEventListener("keydown", key, true); layer.classList.remove("on"); setTimeout(() => layer.remove(), 320); if (allowEl === layer) allowEl = null; was?.focus?.({ preventScroll: true }); };
    later.onclick = shut;
    layer.addEventListener("pointerdown", (e) => { if (e.target === layer) shut(); });
    go.onclick = async () => {
      go.disabled = true; go.textContent = "Turning On…";
      const on = await Promise.resolve().then(turnOn).catch(() => false);
      if (on) { shut(); note(app, "Notifications on", "On this device"); } else { go.disabled = false; go.textContent = "Allow Notifications"; }
    };
    document.addEventListener("keydown", key, true);
    document.body.append(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add("on")));
    go.focus({ preventScroll: true });
  }
  // (opened to turn them on: #notify, taken out of the address, and whether it was there)
  function wantsAllow() {
    if (!/(^#|&)notify(&|$)/.test(location.hash)) return false;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (_) {}
    return true;
  }
  // this app's version, as it opens: said once if it's new since last time, with what's new in it (news: a line, set
  // beside the app's version with each one that goes out)
  function built(app, build, news) {
    let was = null;
    try { was = localStorage.getItem(`ifl-build:${app}`); localStorage.setItem(`ifl-build:${app}`, build); } catch (_) {}
    if (was && was !== build) setTimeout(() => note(app, `${NAME[app]} updated`, news ? `V${build} · ${news}` : `Now V${build}`), 600);
  }

  // ---- updates, the same in every app ----
  // A new version's looked for as the app opens, every time you come back to it, and every five minutes while it's on
  // the screen (an app on a phone's Home Screen is brought back, not opened again, so looking only as it opened left it
  // days behind): at the app's own address (/version: functions/_version.js), against the version it's running. Once
  // there's one, it's put in at the first moment it's not in your way: straight away if you've only just opened the app
  // or come back to it and not touched it yet (before you'd notice); else once you've left it be for a minute, never
  // while you're typing, in a sheet or a menu, or the app says it's busy (sending, recording, uploading). One that must
  // go in (min: a fix that can't wait) goes in at the first moment you're not busy. Meanwhile the menu's foot has Update
  // instead of its green dot. The new version's files are fetched afresh first, past any copy the app or the browser
  // keeps, so it's never a mix of the old and the new (and if you start on something meanwhile, it waits again); then
  // where you are is kept (the app's save()) and it opens there again (here()); once for each new version, so a copy
  // that's still the old one mid-release isn't loaded over and over.
  // o: { app, build, url (default "version"), field (in its answer, default "build"), busy() → true while it's not to
  //      be interrupted, save() → where you are (to JSON), files: what to fetch afresh where there's no service worker }
  const U = { app: "", build: "", url: "version", field: "build", busy: null, save: null, files: null, ready: null, fresh: "", at: 0, back: Date.now(), touch: 0, going: false, told: "" };
  const typing = () => { const a = document.activeElement; return !!a && (a.isContentEditable || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || (a.tagName === "INPUT" && !a.readOnly && !/^(button|checkbox|radio|range|submit|reset|file|color)$/.test(a.type))); };
  const busyNow = () => typing() || !!open || !!document.querySelector("dialog[open], .ifa-layer, [aria-busy='true']") || !!U.busy?.();
  // (a version's parts as numbers: 1.76 after 1.8, as 1.80 is written)
  const older = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false; };
  function updates(o) {
    Object.assign(U, o);
    const touched = () => { U.touch = Date.now(); };
    for (const ev of ["pointerdown", "keydown", "wheel"]) addEventListener(ev, touched, { capture: true, passive: true });
    const back = () => { U.back = Date.now(); U.touch = 0; check(true); };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") back(); });
    addEventListener("pageshow", (e) => { if (e.persisted) back(); });
    addEventListener("online", () => check(true));
    // (a service worker that's noticed the app's files change, as it opened: looked at now)
    navigator.serviceWorker?.addEventListener("message", (e) => { if (/:new$/.test(e.data?.type || "")) check(true); });
    setInterval(() => { if (document.visibilityState === "visible") check(); }, 5 * 60e3);
    setInterval(soon, 4000);
    setTimeout(() => check(true), 2000);     // (as it opens, a moment after: out of the way of its opening)
  }
  async function check(now) {
    const t = Date.now();
    if (!U.app || U.going || t - U.at < (now ? 3e3 : 4 * 60e3)) return;     // (now: back, online, a worker's word, as one)
    U.at = t;
    try {
      const r = await fetch(U.url, { cache: "no-store", credentials: "same-origin" });
      if (r.ok) { const j = await r.json(); offer(j[U.field], j.min); }
    } catch (_) {}
  }
  // the version deployed: from /version, or handed over by an app that asks its server anyway (Mail, as it syncs)
  function offer(build, min) {
    if (!build) return;
    build = String(build);
    if (build === U.build) { U.ready = null; return; }
    if (U.ready?.build !== build) U.ready = { build, at: Date.now(), must: !!min && older(U.build, min) };
    soon();
  }
  function soon() {
    const r = U.ready, t = Date.now();
    if (!r || U.going || document.visibilityState !== "visible") return;
    if (busyNow()) return tell();
    const fresh = t - U.back < 8e3 && !U.touch, still = t - (U.touch || U.back) > (window.__iflQuiet || 60e3);     // (__iflQuiet: tests' shorter minute)
    if (fresh || still || r.must) return apply();
    tell();
  }
  // (said once, if it's been waiting a while: it'll go in by itself, or now from the menu)
  function tell() {
    const r = U.ready;
    if (!r || U.told === r.build || Date.now() - r.at < 90e3) return;
    U.told = r.build;
    note(U.app, `A new ${NAME[U.app]} is ready`, r.must ? "It updates as soon as you’re done" : "It updates itself, or tap Update in the menu");
  }
  async function apply(asked) {
    const r = U.ready;
    if (!r || U.going) return;
    // (its files already fetched afresh, the last time it was about to go in: U.fresh, below)
    const key = `ifl-upd:${U.app}`, got = U.fresh === r.build;
    try {
      const k = JSON.parse(sessionStorage.getItem(key) || "null");
      if (!asked && !got && k?.build === r.build && Date.now() - k.at < 10 * 60e3) return;
      sessionStorage.setItem(key, JSON.stringify({ build: r.build, at: Date.now() }));
    } catch (_) {}
    U.going = true;
    close(true);
    if (!got) {
      const t = U.touch;
      if (!(await afresh())) {
        // (a new version's worker that couldn't fetch all its files (Weather's are all or none), or hasn't yet: loaded
        // now, it'd be the old version again. Still offered, it's tried again once that worker's taken over, else in ten
        // minutes; tried afresh, not taken as fresh: a worker taking over has fetched its own files, not always the
        // app's (Mail's are fetched by the page, U.files))
        U.going = false;
        navigator.serviceWorker?.addEventListener("controllerchange", () => { if (U.ready?.build === r.build) try { sessionStorage.removeItem(key); } catch (_) {} }, { once: true });
        if (asked) note(U.app, `${NAME[U.app]} couldn’t update just now`, "It tries again by itself");
        return;
      }
      // (and if you've started on something meanwhile (typing, a sheet, a tap), it waits for the next moment you're not)
      if (!asked && (busyNow() || (!r.must && U.touch !== t))) { U.fresh = r.build; U.going = false; return; }
    }
    // (where you are kept as it goes, not before the wait: you may have scrolled meanwhile)
    try { const at = U.save?.(); if (at != null) sessionStorage.setItem(`ifl-here:${U.app}`, JSON.stringify({ at, t: Date.now() })); } catch (_) {}
    location.reload();
  }
  // the new version's files, fetched afresh before it loads: a service worker of the app's own for each version (as
  // Weather's) installed with all of them; one that keeps one version's files (Markets', Fitness') asked to fetch them
  // again; and without one, the page and its files asked of the network past the browser's own copy. → false if a new
  // worker was being installed and hasn't taken over (its files not all fetched, or not yet)
  async function afresh() {
    const sw = navigator.serviceWorker, wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    try {
      const reg = await sw?.getRegistration();
      if (reg) {
        const was = reg.active;
        await Promise.race([reg.update().catch(() => {}), wait(6000)]);
        if (reg.installing || reg.waiting) {
          await Promise.race([new Promise((ok) => sw.addEventListener("controllerchange", ok, { once: true })), wait(10000)]);
          if (reg.active === was) return false;
        }
        const c = sw.controller;
        if (c) await Promise.race([new Promise((ok) => { const ch = new MessageChannel(); ch.port1.onmessage = ok; c.postMessage({ ifl: "renew" }, [ch.port2]); }), wait(8000)]);
      }
      if (U.files) await Promise.race([Promise.all(U.files.map((u) => fetch(u, { cache: "reload", credentials: "same-origin" }).catch(() => null))), wait(4000)]);
    } catch (_) {}
    return true;
  }
  // where you were as it updated (save()), as the new version opens: once, and only if moments ago; else null
  function here(app) {
    try {
      const k = JSON.parse(sessionStorage.getItem(`ifl-here:${app}`) || "null");
      sessionStorage.removeItem(`ifl-here:${app}`);
      return k && Date.now() - k.t < 2 * 60e3 ? k.at : null;
    } catch (_) { return null; }
  }

  // the menu, from your photo: o = { app, build, me: { name, line, photo: an element }, rows: [{ icon, color, label,
  // on, toggle(next) → on, value, warn (the value in amber: it needs you), open }], account(), signOut(), update: a function when a newer version's ready }
  let open = null;
  function close(now) {
    const m = open;
    if (!m) return;
    open = null;
    m.behind?.forEach((c) => { c.inert = false; });
    m.anchor.classList.remove("ifm-lit");
    document.removeEventListener("keydown", m.key, true);
    window.visualViewport?.removeEventListener("resize", m.fit);
    // (focus back on your photo, if it was in the menu: else it's left on nothing, and a screen reader starts again at the top)
    if (m.layer.contains(document.activeElement) || document.activeElement === document.body) m.anchor.focus?.({ preventScroll: true });
    m.layer.classList.remove("open");
    m.pop.classList.remove("open");
    if (now) m.layer.remove();
    else { m.pop.classList.add("closing"); setTimeout(() => m.layer.remove(), 260); }
    m.onClose?.();
  }
  function menu(anchor, o) {
    if (open) { const same = open.anchor === anchor; close(); if (same) return; }
    const act = (fn) => () => { close(); fn?.(); };
    const photo = el("span", "ifm-photo", o.me.photo || null);
    const card = el("button", "ifm-card", photo, el("span", "ifm-who", el("b", "", o.me.name || "Your account"), o.me.line ? el("small", "", o.me.line) : null));
    card.insertAdjacentHTML("beforeend", svg("chev", "ifm-chev"));
    card.type = "button";
    card.setAttribute("aria-label", `${o.me.name || "You"}: your InFlite account`);
    card.onclick = act(o.account);
    // (the app's rows: "-" between two starts another group; each row's key, data-k, is its handle)
    const drawRows = (list) => {
      const groups = [el("div", "ifm-grp")];
      for (const r of (list || []).filter(Boolean)) {
        if (r === "-") { groups.push(el("div", "ifm-grp")); continue; }
        const rows = groups[groups.length - 1];
        const ic = el("span", `ifm-ic ${r.color || "grey"}`); ic.innerHTML = svg(r.icon);
        if (r.on !== undefined) {
          const sw = el("button", "ifm-switch"); sw.type = "button"; sw.setAttribute("role", "switch");
          sw.setAttribute("aria-checked", String(!!r.on)); sw.setAttribute("aria-label", r.label);
          if (r.key) sw.dataset.k = r.key;
          sw.disabled = !!r.disabled;
          sw.onclick = async () => { const next = sw.getAttribute("aria-checked") !== "true"; sw.setAttribute("aria-checked", String(next)); let v; try { v = await r.toggle?.(next); } catch (_) { v = !next; } if (typeof v === "boolean") sw.setAttribute("aria-checked", String(v)); };
          rows.append(el("div", "ifm-row" + (r.disabled ? " off" : ""), ic, el("span", "ifm-l", r.label), sw));
        } else {
          // (a value or none, its chevron in the same column: lined up with every other row's)
          const b = el("button", "ifm-row go", ic, el("span", "ifm-l", r.label), el("span", "ifm-val" + (r.warn ? " ifm-warn" : ""), r.value || ""));
          b.insertAdjacentHTML("beforeend", svg("chev", "ifm-chev"));
          b.type = "button"; b.onclick = r.stay ? () => r.open?.(b) : act(r.open);
          if (r.key) b.dataset.k = r.key;
          rows.append(b);
        }
      }
      return groups.filter((g) => g.childNodes.length);
    };
    // (Today first, in every app but Today: a group of its own, kept as the app's rows are drawn again)
    const todayAt = o.app !== "today" ? todayUrl() : null;
    let todayGroup = null;
    if (todayAt) {
      const ic = el("img", "ifm-ic ifm-img"); ic.src = iconUrl("today"); ic.alt = "";
      const go = el("a", "ifm-row go ifm-today", ic, el("span", "ifm-l", "Today"), el("span", "ifm-val", "Your day"));
      go.insertAdjacentHTML("beforeend", svg("chev", "ifm-chev"));
      go.href = todayAt;
      todayGroup = el("div", "ifm-grp", go);
    }
    const rowsBox = el("div", "ifm-rows", ...(todayGroup ? [todayGroup] : []), ...drawRows(o.rows));
    const mark = el("img", "ifm-foot-ic"); mark.src = iconUrl(o.app); mark.alt = "";
    // (its foot: the app and its version, quietly, a green dot while it's up to date; a new version waiting, an Update
    // button in the dot's place; and Sign Out, the one round button at the end, named for screen readers)
    const said = (t) => el("span", "ifm-sr", t);
    let status;
    const update = o.update || (U.ready ? () => apply(true) : null);
    if (update) { status = el("button", "ifm-upd"); status.innerHTML = svg("install"); status.append("Update"); status.type = "button"; status.onclick = act(update); }
    else { status = el("span", "ifm-dot", said(" · Up to date")); }
    const out = el("button", "ifm-out", said("Sign Out")); out.insertAdjacentHTML("afterbegin", svg("signout")); out.type = "button"; out.onclick = act(o.signOut);
    const foot = el("div", "ifm-foot", el("span", "ifm-ver", mark, `${NAME[o.app]} ${o.build}`, update ? null : status), update ? status : null, o.signOut ? out : null);
    const pop = el("div", `ifm-pop ifm-in-${o.app}`, card, rowsBox, foot);
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true"); pop.setAttribute("aria-label", "You and your apps");
    const layer = el("div", "ifm-layer", pop);
    layer.addEventListener("pointerdown", (e) => { if (e.target === layer) { e.preventDefault(); close(); } });
    const key = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); anchor.focus?.({ preventScroll: true }); }
      else if (e.key === "Tab") {
        const f = [...pop.querySelectorAll("button, a")];
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    // (the page behind out of reach while it's open: a screen reader stays in the menu. Not the notes' place, so one
    // said meanwhile (a new version's ready) is still read out)
    const behind = [...document.body.children].filter((c) => !c.inert && c.tagName !== "SCRIPT" && c !== sayEl);
    behind.forEach((c) => { c.inert = true; });
    document.body.append(layer);
    // (under your photo, from where it grows; over it, if your photo's low on the screen. Under it, no taller than the
    // screen leaves it, so on a short one (a phone on its side) it scrolls, and its foot's never out of reach below;
    // fitted again as what's in sight changes while it's open: the keyboard going as the menu takes the focus from a
    // field, which left it short, or the phone turned)
    const tall = () => Math.min(window.innerHeight, window.visualViewport?.height || Infinity);
    const r = anchor.getBoundingClientRect(), H = tall(), W = window.innerWidth;
    const left = Math.max(12, Math.min(r.left - 2, W - pop.offsetWidth - 12));
    const below = r.bottom + 10 + pop.offsetHeight <= H - 12 || r.top < H / 2;
    const top = below ? r.bottom + 10 : Math.max(12, r.top - 10 - pop.offsetHeight);
    const fit = () => { if (below) pop.style.maxHeight = `${Math.max(0, tall() - top - 12)}px`; };
    fit();
    window.visualViewport?.addEventListener("resize", fit);
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
    pop.style.transformOrigin = `${r.left + r.width / 2 - left}px ${below ? "-10px" : "calc(100% + 10px)"}`;
    anchor.classList.add("ifm-lit");
    open = { anchor, layer, pop, key, fit, behind, onClose: o.onClose, redraw: (list) => {
      // (the focus kept on the row it was on, by its key)
      const k = document.activeElement?.dataset?.k;
      rowsBox.replaceChildren(...(todayGroup ? [todayGroup] : []), ...drawRows(list));
      if (k) rowsBox.querySelector(`[data-k="${k}"]`)?.focus({ preventScroll: true });
    } };
    requestAnimationFrame(() => requestAnimationFrame(() => { layer.classList.add("open"); pop.classList.add("open"); }));
    card.focus({ preventScroll: true });
  }
  // InFlite's header, the same in every app: your photo (InFlite's menu; signed out, an outline that signs in) · the
  // screen's name, large, with its one line under it (a ▾ after the name when tapping it switches) · the app's actions in
  // one capsule. Scrolled, the same row, compact, on a soft glass band: --p, from 0 to 1 over the first 64px, set on each
  // .ifh in what's scrolled (watch), and again whenever the page is drawn anew (settle)
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  // o: { me: your photo's html (none: signed out), meAttrs, title, pickAttrs (set: the name's a button, with ▾), line: html,
  //      acts: [{ icon: a glyph's name or svg html, label, attrs }] } (attrs: the app's own, as html: data-act="…", id="…")
  function headerHtml(o) {
    const me = `<button type="button" class="ifh-me${o.me ? "" : " out"}" aria-label="${o.me ? "You and your apps" : "Sign in"}" aria-haspopup="${o.me ? "dialog" : "false"}" ${o.meAttrs || ""}>${o.me || svg("person")}</button>`;
    const name = o.pickAttrs != null ? `<button type="button" class="ifh-pick" ${o.pickAttrs}><span>${esc(o.title)}</span>${svg("down", "ifh-down")}</button>` : esc(o.title);
    const acts = (o.acts || []).filter(Boolean).map((a) => `<button type="button" class="ifh-act" aria-label="${esc(a.label)}" title="${esc(a.label)}" ${a.attrs || ""}>${GLYPHS[a.icon] ? svg(a.icon) : a.icon}</button>`).join("");
    return `<header class="ifh${o.cls ? " " + o.cls : ""}">${me}<div class="ifh-t"><h1 class="ifh-name">${name}</h1><span class="ifh-line">${o.line || ""}</span></div><div class="ifh-acts">${acts}</div></header>`;
  }
  // as an element, with what's tapped wired: o.onMe(button), o.onPick(button), each act's onclick(button)
  function header(o) {
    const t = document.createElement("template");
    t.innerHTML = headerHtml({ ...o, pickAttrs: o.onPick ? o.pickAttrs || "" : o.pickAttrs });
    const hd = t.content.firstElementChild;
    if (o.me instanceof Node) { const b = hd.querySelector(".ifh-me"); b.replaceChildren(o.me); b.classList.remove("out"); b.setAttribute("aria-label", "You and your apps"); }
    if (o.onMe) hd.querySelector(".ifh-me").onclick = (e) => o.onMe(e.currentTarget);
    if (o.onPick) hd.querySelector(".ifh-pick").onclick = (e) => o.onPick(e.currentTarget);
    if (o.lineNode) hd.querySelector(".ifh-line").replaceChildren(o.lineNode);
    hd.querySelectorAll(".ifh-act").forEach((b, i) => { const a = (o.acts || []).filter(Boolean)[i]; if (a?.onclick) b.onclick = (e) => a.onclick(e.currentTarget); });
    return hd;
  }
  const watched = new Set();
  function settle(t = window) {
    const y = t === window ? scrollY : t.scrollTop, p = Math.max(0, Math.min(1, y / 64)).toFixed(3);
    for (const hd of (t === window ? document : t).querySelectorAll(".ifh")) { hd.style.setProperty("--p", p); hd.classList.toggle("ifh-up", p > 0); }
  }
  function watch(t = window) {
    if (!watched.has(t)) { watched.add(t); t.addEventListener("scroll", () => settle(t), { passive: true }); }
    settle(t);
  }
  const glyph = (name) => svg(name);

  // (the open menu's rows drawn again, as what they say changes: one that's come or gone)
  const redraw = (rows) => open?.redraw(rows);
  return { header, headerHtml, watch, settle, glyph, APPS, NAME, menu, close, redraw, isOpen: () => !!open, built, note, iconUrl, allow, wantsAllow, todayUrl,
    updates, offer, here, update: () => apply(true), updateReady: () => !!U.ready };
})();
// ==== end of InFlite's menu ====

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const MIN = 60e3;
const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"; } catch { return "Europe/London"; } };
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const clock = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const and2 = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0] || "");
const DEFAULT_LINKS = (() => {
  const live = /(^|\.)inflite\.ai$/.test(location.hostname);
  const at = (n) => (live ? `https://${n}.inflite.ai` : `${location.protocol}//${n}.${location.hostname}${location.port ? ":" + location.port : ""}`);
  return { chat: at("chat"), weather: at("weather"), fitness: at("fitness"), finance: at("finance"), account: at("account"), auth: at("auth") };
})();

// ---------------------------------------------------------------- what the page knows
const S = {
  view: null, // the session view, signed in (2.3): { user, prefs, morning, links }
  links: null,
  prefs: { order: [...CARD_KEYS], hidden: [] },
  answer: null, // the last cards answer (GET /api/today): { at, tz, cards, morning }
  answerAt: 0, // when it came (or was kept)
  kept: false, // drawn from this browser's copy, not yet fresh
  morning: null, // the morning view (2.5), or the session's few words of it
  device: null, // this device's name for the server: the first 16 of b64url(SHA-256(endpoint))
  endpoint: null, // this device's push endpoint (only ever sent in a body)
  loadedAt: 0,
};
let sheetOpen = null, waitingAnswer = null;

// ---------------------------------------------------------------- the account's API, through this site's Worker
async function call(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  if (method !== "GET") headers["X-Inflite"] = "1";
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (standalone()) headers["X-Home-Screen"] = "1";
  let r;
  try {
    r = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw Object.assign(new Error("Couldn’t reach InFlite just now. Try again in a moment."), { status: 0, offline: true });
  }
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    const err = Object.assign(new Error(data?.error || "Something went wrong. Try again."), { status: r.status, field: data?.field });
    // (signed out, here or elsewhere: nothing of anyone's day stays on the page or in this browser)
    if (r.status === 401 && S.view) signedOutNow();
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------- this browser's copy of your day, per account
// Kept so Today opens with your day on a train; drawn only once the account has said it's you (or, with no answer, if
// the last time it said so was you and under 12 hours ago), and gone the moment it's known you've signed out.
const KEPT = "today:session", CARDS_KEY = (id) => `today:cards:${id}`;
const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
function keepSession(view) { try { localStorage.setItem(KEPT, JSON.stringify({ id: view.user.id, at: Date.now(), view })); } catch {} }
function keepCards(answer) {
  const id = S.view?.user?.id;
  if (!id) return;
  try { localStorage.setItem(CARDS_KEY(id), JSON.stringify({ id, at: Date.now(), answer })); } catch {}
}
// every copy (but this account's, if named)
function forgetKept(except = null) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || k === except || k === (except && KEPT)) continue;
      if (k === KEPT || k.startsWith("today:cards:")) localStorage.removeItem(k);
    }
  } catch {}
}
function keptFor(id) {
  const c = readJSON(CARDS_KEY(id));
  return c && c.id === id && c.answer && typeof c.answer === "object" ? c : null;
}

// ---------------------------------------------------------------- signing in, by InFlite's hand-back (as Mail does)
// Signing in happens on InFlite's sign-in page (auth.inflite.ai). Today sends you there with the hash of a word it keeps
// in this tab; the page sends you back with a code that's good once, and only with that word. A Home Screen Today has
// its own cookie jar, so it signs in this way too.
const VERIFIER_KEY = "inflite:signin-verifier";
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
let sessionAsked = null;
async function authOrigin() {
  if (!S.links && sessionAsked) await Promise.race([sessionAsked.catch(() => {}), new Promise((ok) => setTimeout(ok, 3000))]);
  return safe(S.links?.auth) || DEFAULT_LINKS.auth;
}
async function goToAccount(join = false) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const ask = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  try { sessionStorage.setItem(VERIFIER_KEY, verifier); } catch {}
  location.assign(`${await authOrigin()}/#${new URLSearchParams({ [join ? "join" : "signin"]: "today", ask, back: `${location.origin}/` })}`);
}
// Back from the sign-in page with a code: swapped for the account's sign-in. → the session view, or null
async function finishSignIn() {
  const code = new URLSearchParams(location.hash.slice(1)).get("signin");
  if (!code) return null;
  try { history.replaceState(history.state, "", location.pathname + location.search); } catch {}
  let verifier = null;
  try { verifier = sessionStorage.getItem(VERIFIER_KEY); sessionStorage.removeItem(VERIFIER_KEY); } catch {}
  if (!verifier) return null;
  return call("/api/auth/handback", { method: "POST", body: { code, verifier } });
}

// Signing out of Today signs out of the account in this browser, as every app does: this device's morning notification
// stopped first, your day forgotten here, then the sign-in page says so and offers the way back.
async function signOut() {
  try {
    const sub = await currentSub();
    if (sub) {
      await call("/api/push", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch {}
  forgetKept();
  try { localStorage.removeItem("today:push"); } catch {}
  const auth = safe(S.links?.auth) || DEFAULT_LINKS.auth;
  await call("/api/logout", { method: "POST", body: {} }).catch(() => {});
  S.view = null;
  location.assign(`${auth}/#${new URLSearchParams({ signout: "today", back: `${location.origin}/` })}`);
}

// ---------------------------------------------------------------- the two states
function lift() { document.documentElement.classList.remove("boot"); }
function showOut(said = "") {
  sheetOpen && closeSheet();
  IFL.close(true);
  $("#in").hidden = true;
  $("#out").hidden = false;
  $("#outSaid").textContent = said;
  $("#outSaid").hidden = !said;
  $("#out").classList.toggle("said", !!said);
  const L = S.links || DEFAULT_LINKS;
  for (const a of $$(".today-apps a[data-app]")) { const h = safe(L[a.dataset.app]); if (h) a.href = `${h}/`; }
  lift();
}
// signed out, as it's found out: by the account's answer, a 401, or the service worker's word after a notification
function signedOutNow() {
  forgetKept();
  clearTimeout(prefsT); prefsT = 0;
  S.view = null; S.answer = null; S.morning = null; S.kept = false; waitingAnswer = null;
  $("#cards").replaceChildren();
  $("#hd").replaceChildren();
  showOut();
}

function signedIn(view, { offline = false } = {}) {
  if (!view?.user?.id) return signedOutNow();
  const was = S.view?.user?.id;
  S.view = view;
  S.links = view.links || S.links || DEFAULT_LINKS;
  // (the same account's order and hidden cards, unless a change made here is still on its way to the account)
  if (!(was === view.user.id && prefsBusy())) S.prefs = cleanPrefs(view.prefs);
  // (a copy kept for anyone else: gone)
  forgetKept(CARDS_KEY(view.user.id));
  if (!offline) keepSession(view);
  appearance(view.user.appearance);
  if (was !== view.user.id) { S.answer = null; S.kept = false; }
  if (!S.morning || !("lines" in S.morning)) S.morning = view.morning || S.morning;
  $("#out").hidden = true;
  $("#in").hidden = false;
  drawHeader();
  wireLinks();
  if (waitingAnswer) { const a = waitingAnswer; waitingAnswer = null; gotCards(a); }
  else if (!S.answer) {
    const k = keptFor(view.user.id);
    if (k) { S.answer = k.answer; S.answerAt = k.at; S.kept = true; if (k.answer.morning) S.morning = k.answer.morning; }
  }
  drawCards();
  drawMorning();
  lift();
}

// a cards answer: drawn once the account's said who's signed in, and kept for next time
function gotCards(answer) {
  if (!answer || typeof answer !== "object" || !answer.cards) return;
  if (!S.view) { waitingAnswer = answer; return; }
  S.answer = answer; S.answerAt = Date.now(); S.kept = false; S.loadedAt = Date.now();
  if (answer.morning) S.morning = answer.morning;
  keepCards(answer);
  drawCards();
  drawLine();
  drawMorning();
}

// ---------------------------------------------------------------- the header, and InFlite's menu
const ID_OK = (id) => typeof id === "string" && /^[\w-]{8,64}$/.test(id);
function photoHtml(u) {
  const initial = esc([...String(u.first || u.name || u.handle || "?")][0] || "?");
  return u.photoAt && ID_OK(u.id) ? `${initial}<img class="av-img" src="/api/avatar?id=${encodeURIComponent(u.id)}&amp;v=${encodeURIComponent(String(u.photoAt))}" alt="">` : initial;
}
function lineHtml() {
  const tz = S.answer?.tz || browserTz(), now = Date.now(), w = S.answer?.cards?.weather;
  const place = w?.state === "ok" && w.place?.name ? w.place.name : null;
  return `<span class="d-long">${esc(dateLong(now, tz))}</span><span class="d-short">${esc(dateShort(now, tz))}</span>${place ? ` · ${esc(place)}` : ""}`;
}
function drawHeader() {
  const u = S.view.user;
  $("#hd").innerHTML = IFL.headerHtml({ me: photoHtml(u), title: "Today", line: lineHtml(), acts: [{ icon: "Edit", label: "Edit Today: hide and reorder cards", attrs: 'id="edit" data-word' }] });
  $("#hd .ifh-me").addEventListener("click", (e) => openMenu(e.currentTarget));
  $("#edit").addEventListener("click", openEdit);
  IFL.watch();
}
let lineSaid = "";
function drawLine() {
  const el = $("#hd .ifh-line"), html = lineHtml();
  if (el && html !== lineSaid) { el.innerHTML = html; lineSaid = html; }
}
function menuPhoto(u) {
  const s = document.createElement("span");
  s.className = "me-ph";
  s.innerHTML = photoHtml(u);
  return s;
}
function openMenu(anchor) {
  if (!S.view) return;
  const u = S.view.user, m = S.morning || {};
  IFL.menu(anchor, {
    app: "today",
    build: BUILD,
    me: { name: u.name || u.handle || "Your account", line: u.handle ? `@${u.handle}` : "", photo: menuPhoto(u) },
    rows: [
      { icon: "bell", color: "red", label: "Notifications", key: "notify", open: () => openAccount("notify") },
      { icon: "sun", color: "orange", label: matchMedia("(max-width: 360px)").matches ? "Morning" : "Morning Notification", key: "morning", value: m.on ? clock(m.at) : "Off", open: toMorning },
      "-",
      { icon: "sliders", color: "grey", label: "Edit Today", key: "edit", open: openEdit },
    ],
    account: () => openAccount(),
    signOut,
  });
}
// Your account, at the place asked for (open=…). From a Home Screen Today, whose sign-in the browser doesn't share, with
// a code good for a minute that signs the account's page in too (as Markets does)
function accountHref(open) {
  const base = safe(S.links?.account) || DEFAULT_LINKS.account, p = new URLSearchParams({ from: "today" });
  if (open) p.set("open", open);
  return `${base}/#${p}`;
}
async function openAccount(open) {
  if (standalone()) {
    try {
      const { code } = await call("/api/account-link", { method: "POST", body: {} });
      if (code) {
        const p = new URLSearchParams({ handoff: code, from: "today" });
        if (open) p.set("open", open);
        return location.assign(`${safe(S.links?.account) || DEFAULT_LINKS.account}/#${p}`);
      }
    } catch {}
  }
  location.assign(accountHref(open));
}
function wireLinks() {
  const L = S.links || DEFAULT_LINKS, at = (k, path = "/") => (safe(L[k]) ? `${L[k]}${path}` : "#");
  for (const a of $$("[data-account]")) a.href = accountHref(a.dataset.account);
  $("#aLive").href = at("chat", "/tracker");
  $("#aWeather").href = at("weather");
}

// ---------------------------------------------------------------- the cards
const ctx = () => ({ links: S.links || DEFAULT_LINKS, tz: S.answer?.tz || browserTz(), now: Date.now() });
function cleanPrefs(p) {
  const order = (Array.isArray(p?.order) ? p.order : []).filter((k) => CARD_KEYS.includes(k));
  for (const k of CARD_KEYS) if (!order.includes(k)) order.push(k);
  const hidden = (Array.isArray(p?.hidden) ? p.hidden : []).filter((k) => CARD_KEYS.includes(k));
  return { order: [...new Set(order)], hidden: [...new Set(hidden)] };
}
function drawCards(anim) {
  const box = $("#cards");
  if (!S.view) return;
  const shown = S.prefs.order.filter((k) => !S.prefs.hidden.includes(k));
  const was = new Map($$(".tcard", box).map((c) => [c.dataset.app, c.getBoundingClientRect().top]));
  const f = document.activeElement, inside = box.contains(f) ? f : null;
  const fKey = inside ? [inside.closest(".tcard")?.dataset.app, inside.dataset.retry != null ? "retry" : inside.getAttribute("href")] : null;
  if (!shown.length) {
    box.innerHTML = `<div class="empty-cards glass"><p>Everything’s hidden. Choose what Today shows.</p><button class="pill primary" type="button" id="emptyEdit">Edit Today</button></div>`;
    $("#emptyEdit").addEventListener("click", openEdit);
  } else {
    const c = ctx(), cards = S.answer?.cards || {};
    box.innerHTML = shown.map((k) => (cards[k] ? cardHTML(k, cards[k], c) : placeholder(k))).join("");
    applyVars(box);
    if (anim === "move" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const el of $$(".tcard", box)) {
        const dy = (was.get(el.dataset.app) ?? el.getBoundingClientRect().top) - el.getBoundingClientRect().top;
        if (Math.abs(dy) > 2) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 480, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
      }
    }
  }
  // (the focus kept on the same control of the same card, drawn again)
  if (fKey?.[0]) {
    const card = $(`.tcard[data-app="${fKey[0]}"]`, box);
    const again = card && (fKey[1] === "retry" ? $("[data-retry]", card) : $$("a[href]", card).find((a) => a.getAttribute("href") === fKey[1]));
    (again || $(".tc-head", card || box))?.focus?.({ preventScroll: true });
  }
  drawKept();
}
function drawKept() {
  const k = $("#kept"), old = S.kept && Date.now() - S.answerAt > 10 * MIN;
  k.hidden = !old;
  if (old) k.textContent = `Updated ${hm(S.answerAt, S.answer?.tz || browserTz())}`;
}
// the same answer again (with the morning, worked out from the same cards), or one card's alone (Try Again)
async function refresh(only = null) {
  if (!S.view) return;
  const q = new URLSearchParams();
  if (only) q.set("only", only);
  else q.set("with", "morning");
  if (S.device) q.set("device", S.device);
  S.loadedAt = Date.now();
  try {
    const a = await call(`/api/today?${q}`);
    if (!only) return gotCards(a);
    if (!S.answer || !a?.cards?.[only]) return;
    S.answer = { ...S.answer, cards: { ...S.answer.cards, [only]: a.cards[only] } };
    keepCards(S.answer);
    drawCards();
    if (only === "weather") drawLine();
    const card = $(`.tcard[data-app="${only}"]`);
    card?.classList.add("in");
    if (a.cards[only].state === "error") toast(a.cards[only].said || "Still couldn’t get it.");
  } catch (e) {
    if (e.status !== 401 && only) toast(e.message);
  }
}

// ---------------------------------------------------------------- Edit: hide and reorder, kept on your account
function drawEdit() {
  const ord = S.prefs.order, n = ord.length;
  $("#edList").innerHTML = ord.map((k, i) => {
    const name = APP[k].name;
    return `<div class="row ed-row" data-k="${k}"><span class="ic app"><img src="${APP[k].icon}" alt=""></span><span class="tx"><b>${name}</b></span>
      <button class="mv" type="button" data-mv="-1" ${i === 0 ? "disabled" : ""} aria-label="Move ${name} up">${G.up}</button><button class="mv" type="button" data-mv="1" ${i === n - 1 ? "disabled" : ""} aria-label="Move ${name} down">${G.down}</button>
      <input type="checkbox" class="switch" role="switch" data-show="${k}" ${S.prefs.hidden.includes(k) ? "" : "checked"} aria-label="Show ${name}"></div>`;
  }).join("");
}
function openEdit() {
  if (!S.view) return;
  IFL.close(true);
  drawEdit();
  openSheet("sh-edit");
}
// (sent 400 ms after the last change, one at a time, so the account has them in the order they were made. An answer
// becomes the page's only if nothing's changed since it was sent: a newer change, still to go, isn't put back)
let prefsT = 0, prefsEdits = 0, prefsOut = 0, prefsGoing = Promise.resolve();
const prefsBusy = () => !!prefsT || prefsOut > 0;
function prefsChanged(anim = "move") {
  prefsEdits++;
  drawCards(anim);
  clearTimeout(prefsT);
  prefsT = setTimeout(() => {
    prefsT = 0;
    prefsOut++;
    prefsGoing = prefsGoing.catch(() => {}).then(sendPrefs).finally(() => prefsOut--);
  }, 400);
}
async function sendPrefs() {
  if (!S.view) return;
  const sent = prefsEdits;
  try {
    const r = await call("/api/prefs", { method: "PUT", body: { order: S.prefs.order, hidden: S.prefs.hidden } });
    if (r?.prefs && sent === prefsEdits && S.view) {
      const p = cleanPrefs(r.prefs), same = JSON.stringify(p) === JSON.stringify(S.prefs);
      S.prefs = p;
      S.view.prefs = p; keepSession(S.view);
      if (!same) { drawCards(); if (sheetOpen) drawEdit(); }
    }
  } catch (e) {
    if (e.status !== 401) toast(e.message);
  }
}

// ---------------------------------------------------------------- sheets from the foot, and a word after doing something
let sheetClose = null;
function openSheet(id) {
  const s = document.getElementById(id), back = document.activeElement;
  let d = $(".dimmer");
  if (!d) { d = document.createElement("div"); d.className = "dimmer"; document.body.append(d); }
  const FOC = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled])';
  const key = (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeSheet(); return; }
    if (e.key !== "Tab") return;
    const f = $$(FOC, s).filter((x) => x.getClientRects().length);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (!s.contains(document.activeElement)) { e.preventDefault(); f[0].focus(); }
    else if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  };
  sheetClose = () => {
    sheetOpen = null; sheetClose = null;
    s.classList.remove("on"); d.classList.remove("on");
    $("#in").inert = false;
    document.removeEventListener("keydown", key, true);
    back?.focus?.({ preventScroll: true });
  };
  for (const b of $$("[data-close]", s)) b.onclick = closeSheet;
  d.onclick = closeSheet;
  sheetOpen = s;
  s.classList.add("on"); d.classList.add("on");
  $("#in").inert = true;
  document.addEventListener("keydown", key, true);
  setTimeout(() => $("h2", s)?.focus({ preventScroll: true }), 60);
}
function closeSheet() { sheetClose?.(); }
function toast(text) {
  let t = $(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = text;
  t.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("on"), 2600);
}

// ---------------------------------------------------------------- the morning: one notification
const NAMES = { weather: "Weather", fitness: "Fitness", chat: "Chat", markets: "Markets" };
const LINES = [
  ["weather", (m) => (m.place ? `The title: the day in ${m.place}` : "The title: the day where you are")],
  ["fitness", () => "Today’s session and the best time"],
  ["chat", () => "Pigeons on their way to you"],
  ["markets", () => "How your portfolio’s doing"],
];
function lockHtml(m) {
  const tz = m.tz || S.answer?.tz || browserTz(), p = m.preview;
  if (!p) {
    const now = Date.now();
    return { html: `<div class="lk-top"><span class="lk-lock">${G.lock}</span><span class="lk-date">${esc(dateLong(now, tz))}</span><span class="lk-time">${hm(now, tz)}</span></div><div class="lk-note none">${m.on ? "Your morning’s notification shows here" : "Off: turn it on to have it each morning"}</div>`, said: "Lock Screen preview" };
  }
  const at = typeof p.at === "number" ? p.at : Date.now(), lines = (Array.isArray(p.lines) ? p.lines : []).filter((l) => typeof l === "string");
  const when = !m.on ? "Off: turn it on to have it each morning" : p.kind === "sent" ? `This morning’s came at ${hm(at, tz)}`
    : dayKey(at, tz) === dayKey(Date.now(), tz) ? `This morning’s comes at ${hm(at, tz)}` : `Tomorrow’s comes at ${hm(at, tz)}`;
  return {
    html: `<div class="lk-top"><span class="lk-lock">${G.lock}</span><span class="lk-date">${esc(dateLong(at, tz))}</span><span class="lk-time">${hm(at, tz)}</span></div>
      <div class="lk-note"><img src="/icon.svg" alt=""><span class="ln-h"><b>Today</b><span>now</span></span><b class="ln-t">${esc(p.title)}</b>${lines.map((l) => `<span class="ln-l">${esc(l)}</span>`).join("")}</div>
      <span class="lk-when">${G.clock}${esc(when)}</span>`,
    said: `Lock Screen preview, ${hm(at, tz)}: ${p.title || ""}. ${lines.join(". ")}. ${when}`,
  };
}
// (why this device can't have it, in Fitness's words: fitness/app.js pushWhy)
const canPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function pushWhy() {
  if (canPush()) return Notification.permission === "denied" ? "Notifications are blocked for Today in this browser’s settings." : null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return ios && !standalone() ? "Add Today to your Home Screen first (Share, then Add to Home Screen), and turn this on there." : "This browser can’t show notifications.";
}
function drawMorning() {
  const m = S.morning;
  if (!m || !S.view) return;
  const full = m.lines && typeof m.lines === "object";
  const lk = lockHtml(m), lock = $("#lock");
  lock.innerHTML = lk.html;
  lock.setAttribute("aria-label", lk.said);
  lock.classList.toggle("off", !m.on);
  $("#mOn").checked = !!m.on;
  $("#mAtRow").hidden = !m.on;
  const at = Number.isInteger(m.at) ? m.at : 420, sel = $("#mAt"), opts = [];
  for (let x = 360; x <= 600; x += 15) opts.push(x);
  if (!opts.includes(at)) opts.push(at), opts.sort((a, b) => a - b);
  if (sel.dataset.sig !== opts.join()) { sel.dataset.sig = opts.join(); sel.replaceChildren(...opts.map((x) => new Option(clock(x), String(x)))); }
  sel.value = String(at);
  $("#atSaid").textContent = clock(at);
  // (the first that applies: why it can't come here; turned on from Account, on no device yet; on others, not this one)
  const why = pushWhy(), w = $("#mWhy");
  if (why) w.textContent = why;
  else if (m.on && m.devices === 0) w.innerHTML = `Not on any of your devices yet · <button type="button" data-turnon>Turn On Here</button>`;
  else if (m.on && m.devices > 0 && m.thisDevice !== true && full) w.innerHTML = `On your other devices · <button type="button" data-turnon>Turn On Here</button>`;
  else w.textContent = "";
  w.hidden = !w.textContent;
  const lines = full ? m.lines : {};
  $("#lines").innerHTML = LINES.map(([k, sub]) => `<label class="row"><span class="ic app"><img src="${APP[k].icon}" alt=""></span><span class="tx"><b>${NAMES[k]}</b><small>${esc(sub(m))}</small></span><input type="checkbox" class="switch" role="switch" data-line="${k}" ${lines[k] ? "checked" : ""} ${full ? "" : "disabled"} aria-label="${NAMES[k]} in the morning notification"></label>`).join("");
  $("#namesSaid").textContent = m.names ? "On, from Chat" : "Off";
  const out = (Array.isArray(m.preview?.out) ? m.preview.out : []).map((k) => NAMES[k] || String(k));
  $("#mOut").textContent = out.length ? `${and2(out)} ${out.length > 1 ? "have" : "has"} nothing for today yet, so ${out.length > 1 ? "their lines stay" : "its line stays"} out: a line comes only when there’s something to say.` : "";
  $("#mOut").hidden = !out.length;
  const rw = !!m.replaces?.weather, rf = !!m.replaces?.fitness;
  const instead = rw && rf ? " While it’s on, it comes instead of Weather’s morning briefing and Fitness’s morning reminder on your devices; Weather’s briefing email still comes."
    : rw ? " While it’s on, it comes instead of Weather’s morning briefing on your devices; Weather’s briefing email still comes."
    : rf ? " While it’s on, it comes instead of Fitness’s morning reminder on your devices." : "";
  $("#mFoot").textContent = `It comes at its time, whatever your Quiet Hours, as Weather’s morning briefing does. It never carries a word anyone wrote, and names stay off the Lock Screen unless Chat’s are on.${instead}`;
  const tn = $("#tryNow");
  tn.innerHTML = `${G.bell}Show it on this phone`;
  tn.disabled = !(m.thisDevice === true && S.endpoint);
}
async function putMorning(patch) {
  const body = { ...patch, tz: browserTz() };
  if (S.device) body.device = S.device;
  try {
    const m = await call("/api/morning", { method: "PUT", body });
    if (m && typeof m === "object") S.morning = m;
    if (S.view) S.view.morning = { on: !!S.morning.on, at: S.morning.at, devices: S.morning.devices };
    drawMorning();
    return true;
  } catch (e) {
    if (e.status !== 401) toast(e.message);
    drawMorning();
    return false;
  }
}

// ---------------------------------------------------------------- push on this device
const toBytes = (b64) => { const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
const hashOf = async (endpoint) => b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint))).slice(0, 16);
async function swReg() {
  if (!("serviceWorker" in navigator)) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise((ok) => setTimeout(() => ok(null), 8000))]);
}
async function currentSub() {
  if (!canPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  return (await reg?.pushManager?.getSubscription().catch(() => null)) || null;
}
// this device's name for the server, from its subscription (none: no device)
async function findDevice() {
  try {
    const sub = await Promise.race([currentSub(), new Promise((ok) => setTimeout(() => ok(null), 800))]);
    if (!sub) { S.device = S.endpoint = null; return null; }
    S.endpoint = sub.endpoint;
    S.device = await hashOf(sub.endpoint);
    return S.device;
  } catch {
    return null;
  }
}
// Turned on, from a tap: the browser asked first thing (a phone asks only from a tap), then this device's subscription,
// with the account's key, handed to the account, and the morning on. → true once it's on here
async function turnOn() {
  if (!canPush()) { toast(pushWhy()); return false; }
  const asked = Notification.permission === "granted" ? "granted" : await Notification.requestPermission().catch(() => "denied");
  if (asked !== "granted") { toast("Notifications are blocked for Today in this browser’s settings."); drawMorning(); return false; }
  try {
    const reg = await swReg();
    if (!reg) throw new Error("Couldn’t turn it on just now. Try again in a moment.");
    const { key } = await call("/api/push/key");
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) });
    await call("/api/push", { method: "POST", body: { sub: sub.toJSON() } });
    S.endpoint = sub.endpoint;
    S.device = await hashOf(sub.endpoint);
    try { localStorage.setItem("today:push", sub.endpoint); } catch {}
    return await putMorning({ on: true });
  } catch (e) {
    if (e.status !== 401) toast(e.message || "Couldn’t turn it on just now. Try again in a moment.");
    drawMorning();
    return false;
  }
}
async function tryNow() {
  const b = $("#tryNow");
  if (!S.endpoint) return;
  b.disabled = true;
  try {
    const r = await call("/api/morning/try", { method: "POST", body: { endpoint: S.endpoint } });
    toast(r?.sent ? "Sent" : "It didn’t send just now. Try again in a moment.");
  } catch (e) {
    if (e.status !== 401) toast(e.message);
  } finally {
    drawMorning();
  }
}
function toMorning() {
  const sec = $("#morning");
  if (!sec || $("#in").hidden) return;
  sec.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  $("#mh").focus({ preventScroll: true });
}

// ---------------------------------------------------------------- the account's appearance, kept for theme.js
function appearance(a) {
  const t = a === "light" || a === "dark" ? a : null;
  try { if (t) localStorage.setItem("today:appearance", t); else localStorage.removeItem("today:appearance"); } catch {}
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  for (const m of $$('meta[name="theme-color"]')) m.setAttribute("content", t ? (t === "dark" ? "#1b2860" : "#dde3fb") : m.media.includes("dark") ? "#1b2860" : "#dde3fb");
}

// ---------------------------------------------------------------- what's tapped
function wire() {
  $("#signin").addEventListener("click", (e) => { e.preventDefault(); goToAccount(false); });
  $("#join").addEventListener("click", (e) => { e.preventDefault(); goToAccount(true); });
  for (const b of $$(".ifs-btn:empty")) b.innerHTML = G.x;
  for (const c of $$(".row .chev:empty")) c.innerHTML = G.chev;
  $("#icBell").innerHTML = G.bell;
  $("#atChev").innerHTML = G.down;
  $("#tryNow").innerHTML = `${G.bell}Show it on this phone`;
  // (Try Again on a card that couldn't load: that card alone, asked again)
  $("#cards").addEventListener("click", (e) => {
    const r = e.target.closest("[data-retry]");
    if (!r) return;
    r.disabled = true;
    refresh(r.dataset.retry);
  });
  // (a friend's picture that isn't there: their initial, under it, shows)
  document.addEventListener("error", (e) => { if (e.target instanceof HTMLImageElement && e.target.classList.contains("av-img")) e.target.remove(); }, true);
  // (Account's pages: from a Home Screen Today, with a code that signs its page in too)
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-account]");
    if (!a || !standalone() || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    openAccount(a.dataset.account);
  });
  $("#mOn").addEventListener("change", async (e) => {
    const sw = e.target, on = sw.checked;
    sw.disabled = true;
    try {
      // (on here: this device's subscription first, where it can have one; where it can't, on all the same, for the
      // devices that can, and the foot says why not here)
      const ok = on ? (canPush() && Notification.permission !== "denied" ? await turnOn() : await putMorning({ on: true })) : await putMorning({ on: false });
      if (!ok) sw.checked = !on;
    } finally {
      sw.disabled = false;
    }
  });
  $("#mAt").addEventListener("change", (e) => { $("#atSaid").textContent = clock(Number(e.target.value)); putMorning({ at: Number(e.target.value) }); });
  $("#lines").addEventListener("change", (e) => {
    const s = e.target.closest("[data-line]");
    if (s) putMorning({ lines: { [s.dataset.line]: s.checked } });
  });
  $("#mWhy").addEventListener("click", (e) => { if (e.target.closest("[data-turnon]")) turnOn(); });
  $("#tryNow").addEventListener("click", tryNow);
  $("#edList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mv]");
    if (!b) return;
    const ord = [...S.prefs.order], k = b.closest("[data-k]").dataset.k, i = ord.indexOf(k), j = i + Number(b.dataset.mv);
    if (j < 0 || j >= ord.length) return;
    [ord[i], ord[j]] = [ord[j], ord[i]];
    S.prefs = { ...S.prefs, order: ord };
    drawEdit();
    prefsChanged();
    // (the focus stays on the card that moved, on the same arrow if it can still go that way)
    const row = $(`#edList [data-k="${k}"]`), again = $(`[data-mv="${b.dataset.mv}"]`, row);
    (again && !again.disabled ? again : $(`[data-mv="${-b.dataset.mv}"]`, row)).focus();
    $("#edSay").textContent = `${APP[k].name}, ${j + 1} of ${ord.length}`;
  });
  $("#edList").addEventListener("change", (e) => {
    const s = e.target.closest("[data-show]");
    if (!s) return;
    const k = s.dataset.show, hidden = S.prefs.hidden.filter((x) => x !== k);
    if (!s.checked) hidden.push(k);
    S.prefs = { ...S.prefs, hidden };
    prefsChanged();
  });
  $("#edReset").addEventListener("click", () => {
    S.prefs = { order: [...CARD_KEYS], hidden: [] };
    drawEdit();
    prefsChanged();
    toast("Back in the day’s order");
  });
  // (a sign-in's code, come in the address without the page opening afresh: opened afresh, to finish it)
  addEventListener("hashchange", () => (new URLSearchParams(location.hash.slice(1)).get("signin") ? location.reload() : fromHash()));
}
// (opened at a place: #morning, the morning section; #notify, from Account's "Turn On in Today": asked in one tap)
function fromHash() {
  if (!S.view) return;
  if (IFL.wantsAllow()) {
    IFL.allow("today", "Today tells you your day each morning, from all your apps, in one notification. What’s in it is set in Today, under Morning.", turnOn);
    return;
  }
  if (location.hash === "#morning") {
    try { history.replaceState(null, "", location.pathname + location.search); } catch {}
    setTimeout(toMorning, 100);
  }
}

// ---------------------------------------------------------------- the service worker: notifications, and opening offline
function worker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => {
    const d = e.data || {};
    // (a notification came for a device that's been signed out: nothing of anyone's day stays here)
    if (d.ifl === "signedout") return signedOutNow();
    if (typeof d.open === "string") {
      let u;
      try { u = new URL(d.open, location.origin); } catch { return; }
      if (u.origin !== location.origin) return;
      if (u.pathname === location.pathname && u.search === location.search) { history.replaceState(null, "", u.hash || location.pathname); if (u.hash === "#morning") toMorning(); else refresh(); }
      else location.assign(u.href);
    }
  });
}

// ---------------------------------------------------------------- opening
async function load() {
  const devP = findDevice();
  let view = null;
  if (new URLSearchParams(location.hash.slice(1)).get("signin")) {
    try {
      view = await finishSignIn();
    } catch (e) {
      sessionAsked = null;
      showOut(e.status === 0 ? e.message : e.message || "That sign-in didn’t work. Try again.");
      return;
    }
  }
  sessionAsked = view ? Promise.resolve(view) : call("/api/session");
  // (the cards asked at the same time, on this device's name, where it's likely someone's signed in here: just back
  // from signing in, or signed in last time. They're drawn only once the session's said who. Anyone else's are asked
  // once it has, so the way in costs the account one request)
  let asked = false;
  const askCards = () => {
    asked = true;
    return devP.then((device) => {
      const q = new URLSearchParams({ with: "morning" });
      if (device) q.set("device", device);
      S.loadedAt = Date.now();
      return call(`/api/today?${q}`).then(gotCards, () => {});
    });
  };
  if (view || readJSON(KEPT)) askCards();
  try {
    view = await sessionAsked;
  } catch (e) {
    if (e.status === 401) return signedOutNow();
    // (no answer: the copy kept here, if the last answer said it was this account, under 12 hours ago)
    const ks = readJSON(KEPT);
    if (ks?.view?.user?.id && ks.id === ks.view.user.id && Date.now() - ks.at < 12 * 3600e3 && keptFor(ks.id)) {
      signedIn(ks.view, { offline: true });
      return;
    }
    showOut(e.message);
    return;
  }
  if (view?.links) S.links = view.links;
  if (!view?.signedIn) return signedOutNow();
  signedIn(view);
  if (!asked) askCards();
  fromHash();
  const at = IFL.here("today");
  if (at?.y) requestAnimationFrame(() => scrollTo(0, at.y));
}

function start() {
  wire();
  worker();
  IFL.built("today", BUILD, NEWS);
  IFL.updates({ app: "today", build: BUILD, url: "/version", field: "build", busy: () => !!sheetOpen, save: () => ({ y: Math.round(scrollY) }), files: ["/", "/app.js", "/cards.js", "/wxicons.js", "/app.css", "/theme.js"] });
  load();
  // (each minute, with no fetch: the place's clock, the pigeons' times to go, the date, the kept copy's word)
  setInterval(() => {
    if (!S.view) return;
    tick($("#cards"), Date.now());
    drawLine();
    drawKept();
  }, MIN);
  // (every five minutes while it's in view, and on coming back to it after two or more: the day afresh)
  setInterval(() => { if (S.view && document.visibilityState === "visible") refresh(); }, 5 * MIN);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (S.view && Date.now() - S.loadedAt >= 2 * MIN) refresh();
    else if (!S.view && $("#outSaid").textContent) load();
  });
  addEventListener("online", () => { if (!S.view || S.kept) load(); });
}
start();
