// InFlite, at inflite.ai: one app. Today (your day from all your apps, phase by phase), Apps (each app, opened in this
// window) and You (rules, notifications, this phone, your sign-in) are screens of this one page, on InFlite's framework
// (/roof/, One roof: one header, one tab bar Today · Chats · Apps · You, one sheet, one toast, one search), and so is
// Weather, a module the framework loads in the page at /weather/ (Chats and the other apps are pages beside it, served
// by this site's Worker). And one morning notification instead of one from each app. Everything shown comes from your InFlite account (this site's
// Worker passes your sign-in on to account.inflite.ai: today/src/index.js), worked out there by each app's own rules:
// this page only draws it (day.js, cards.js, apps.js, you.js) and sends what you change. Signed out, it's InFlite's way
// in (index.html's, there without a script too).
import { CARD_KEYS, APP, esc, safe, hm, dateLong, G, cardHTML, placeholder, applyVars, tick } from "/cards.js";
import { createFrame } from "/roof/frame.js";
import { REGISTRY, parse, format } from "/roof/router.js";
import { toast as roofToast } from "/roof/toast.js";

// Today's build, shown in InFlite's menu (raised with each release)
const BUILD = "1.18";
// (what's new in it, said once it's in)
const NEWS = "Today's top card is tidier: each line beside its app's icon, no figure said twice, no Open or Send";

// ==== InFlite's menu, shared: from .tools/inflite/menu.js by node .tools/iflmenu.mjs (change it there) ====
// InFlite's menu: one menu, the same in every app, opened from your photo. You (a tap to your account), the app's own
// few rows, and a foot with its version and Sign Out. With it: the same note in every app after it's updated itself,
// the updater every app shares (updates, below), and the hub (hub, below: every app as a page of inflite.ai).
// (Plain script, no imports: it's the same in a module and in Mail's script. Images only ever blob: or the app's own,
// as each app's rules allow; the apps' icons are drawn here, made blob: once each.)
const IFL = (() => {
  // (no app's page pinched bigger, as no app's is: iPhone takes no notice of a page's viewport saying so, only of its own
  // gesture events refused. A map or a photo still pinches itself, by its touches; menu.css says the rest, touch-action)
  for (const n of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(n, (e) => e.preventDefault(), { passive: false });
  const APPS = [["chat", "Chat"], ["weather", "Weather"], ["fitness", "Fitness"], ["markets", "Markets"], ["mail", "Mail"], ["account", "Account"], ["today", "Today"]];
  const NAME = Object.fromEntries(APPS);
  const ICONS = {"chat":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\".6\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4aa3ff\"/><stop offset=\"1\" stop-color=\"#0055d4\"/></linearGradient><radialGradient id=\"glow\" cx=\"220\" cy=\"120\" r=\"760\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0\"/></radialGradient><linearGradient id=\"low\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\".6\" stop-color=\"#002a80\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#002a80\" stop-opacity=\".25\"/></linearGradient><linearGradient id=\"rim\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".7\"/><stop offset=\".4\" stop-color=\"#fff\" stop-opacity=\".1\"/><stop offset=\".8\" stop-color=\"#fff\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\".25\"/></linearGradient><linearGradient id=\"face\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"1\" stop-color=\"#e6efff\"/></linearGradient><linearGradient id=\"side\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#b9d4fb\"/><stop offset=\"1\" stop-color=\"#7fa9ec\"/></linearGradient><filter id=\"cast\" x=\"-80%\" y=\"-80%\" width=\"260%\" height=\"260%\"><feGaussianBlur stdDeviation=\"22\"/></filter><filter id=\"bevel\" x=\"-5%\" y=\"-5%\" width=\"110%\" height=\"110%\"><feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"5\"/><feOffset dy=\"-9\" result=\"up\"/><feComposite in=\"SourceAlpha\" in2=\"up\" operator=\"out\" result=\"lo\"/><feFlood flood-color=\"#9fbff0\" flood-opacity=\".75\"/><feComposite in2=\"lo\" operator=\"in\" result=\"loS\"/><feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"3\"/><feOffset dy=\"6\" result=\"dn\"/><feComposite in=\"SourceAlpha\" in2=\"dn\" operator=\"out\" result=\"hi\"/><feFlood flood-color=\"#fff\"/><feComposite in2=\"hi\" operator=\"in\" result=\"hiL\"/><feMerge><feMergeNode in=\"SourceGraphic\"/><feMergeNode in=\"loS\"/><feMergeNode in=\"hiL\"/></feMerge></filter><clipPath id=\"sq\"><rect width=\"1024\" height=\"1024\" rx=\"224\"/></clipPath></defs><g clip-path=\"url(#sq)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#g)\"/><rect width=\"1024\" height=\"1024\" fill=\"url(#glow)\"/><rect width=\"1024\" height=\"1024\" fill=\"url(#low)\"/><g filter=\"url(#cast)\" opacity=\".58\"><path transform=\"translate(10 50) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\" fill=\"#001c5c\"/></g><g fill=\"url(#side)\"><path transform=\"translate(0 16) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 14) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 12) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 10) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 8) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 6) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 4) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 2) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/></g><g filter=\"url(#bevel)\"><path transform=\"translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\" fill=\"url(#face)\"/></g></g><rect x=\"4\" y=\"4\" width=\"1016\" height=\"1016\" rx=\"220\" fill=\"none\" stroke=\"url(#rim)\" stroke-width=\"8\"/></svg>","weather":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4f97f8\"/><stop offset=\"1\" stop-color=\"#2b69de\"/></linearGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd44f\"/><stop offset=\"1\" stop-color=\"#f9b929\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#f2f7ff\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"cloudClip\"><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"320\" cy=\"392\" r=\"192\" fill=\"url(#sun)\"/><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\" fill=\"#0b3a9e\" fill-opacity=\"0.16\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#cloudClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"320\" cy=\"392\" r=\"192\" fill=\"url(#sun)\"/></g><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\" fill=\"url(#glass)\"/></g><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","fitness":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ff8457\"/><stop offset=\"1\" stop-color=\"#ee4b2f\"/></linearGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd85a\"/><stop offset=\"1\" stop-color=\"#ffb52e\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#fff4f0\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"wheelClip\"><path clip-rule=\"evenodd\" d=\"M 512 270 A 290 290 0 1 1 511.9 270 Z M 512 380 A 180 180 0 1 0 512.1 380 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"700\" cy=\"330\" r=\"150\" fill=\"url(#sun)\"/><path fill-rule=\"evenodd\" d=\"M 512 270 A 290 290 0 1 1 511.9 270 Z M 512 380 A 180 180 0 1 0 512.1 380 Z\" fill=\"#8f1d0b\" fill-opacity=\"0.18\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#wheelClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"700\" cy=\"330\" r=\"150\" fill=\"url(#sun)\"/></g><rect width=\"1024\" height=\"1024\" fill=\"url(#glass)\"/></g><path fill-rule=\"evenodd\" d=\"M 512 270 A 290 290 0 1 1 511.9 270 Z M 512 380 A 180 180 0 1 0 512.1 380 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","markets":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4fd98d\"/><stop offset=\"1\" stop-color=\"#169a5b\"/></linearGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd85a\"/><stop offset=\"1\" stop-color=\"#ffb52e\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.86\"/><stop offset=\"1\" stop-color=\"#effff5\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"barsClip\"><path d=\"M 294 560 H 346 A 44 44 0 0 1 390 604 V 748 A 44 44 0 0 1 346 792 H 294 A 44 44 0 0 1 250 748 V 604 A 44 44 0 0 1 294 560 Z M 486 442 H 538 A 44 44 0 0 1 582 486 V 748 A 44 44 0 0 1 538 792 H 486 A 44 44 0 0 1 442 748 V 486 A 44 44 0 0 1 486 442 Z M 678 318 H 730 A 44 44 0 0 1 774 362 V 748 A 44 44 0 0 1 730 792 H 678 A 44 44 0 0 1 634 748 V 362 A 44 44 0 0 1 678 318 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"720\" cy=\"300\" r=\"150\" fill=\"url(#sun)\"/><path d=\"M 294 560 H 346 A 44 44 0 0 1 390 604 V 748 A 44 44 0 0 1 346 792 H 294 A 44 44 0 0 1 250 748 V 604 A 44 44 0 0 1 294 560 Z M 486 442 H 538 A 44 44 0 0 1 582 486 V 748 A 44 44 0 0 1 538 792 H 486 A 44 44 0 0 1 442 748 V 486 A 44 44 0 0 1 486 442 Z M 678 318 H 730 A 44 44 0 0 1 774 362 V 748 A 44 44 0 0 1 730 792 H 678 A 44 44 0 0 1 634 748 V 362 A 44 44 0 0 1 678 318 Z\" fill=\"#05502b\" fill-opacity=\"0.2\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#barsClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"720\" cy=\"300\" r=\"150\" fill=\"url(#sun)\"/></g><rect width=\"1024\" height=\"1024\" fill=\"url(#glass)\"/></g><path d=\"M 294 560 H 346 A 44 44 0 0 1 390 604 V 748 A 44 44 0 0 1 346 792 H 294 A 44 44 0 0 1 250 748 V 604 A 44 44 0 0 1 294 560 Z M 486 442 H 538 A 44 44 0 0 1 582 486 V 748 A 44 44 0 0 1 538 792 H 486 A 44 44 0 0 1 442 748 V 486 A 44 44 0 0 1 486 442 Z M 678 318 H 730 A 44 44 0 0 1 774 362 V 748 A 44 44 0 0 1 730 792 H 678 A 44 44 0 0 1 634 748 V 362 A 44 44 0 0 1 678 318 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","mail":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3fd0c6\"/><stop offset=\"1\" stop-color=\"#119a95\"/></linearGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd85a\"/><stop offset=\"1\" stop-color=\"#ffb52e\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#effffd\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"envClip\"><path d=\"M 286 372 H 738 A 78 78 0 0 1 816 450 V 728 A 78 78 0 0 1 738 806 H 286 A 78 78 0 0 1 208 728 V 450 A 78 78 0 0 1 286 372 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"712\" cy=\"330\" r=\"168\" fill=\"url(#sun)\"/><path d=\"M 286 372 H 738 A 78 78 0 0 1 816 450 V 728 A 78 78 0 0 1 738 806 H 286 A 78 78 0 0 1 208 728 V 450 A 78 78 0 0 1 286 372 Z\" fill=\"#05534f\" fill-opacity=\"0.2\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#envClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"712\" cy=\"330\" r=\"168\" fill=\"url(#sun)\"/></g><rect width=\"1024\" height=\"1024\" fill=\"url(#glass)\"/><path d=\"M 240 404 L 512 610 L 784 404\" fill=\"none\" stroke=\"#05534f\" stroke-opacity=\"0.16\" stroke-width=\"22\" stroke-linecap=\"round\" stroke-linejoin=\"round\" filter=\"url(#frost)\" transform=\"translate(0 6)\"/><path d=\"M 240 404 L 512 610 L 784 404\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.95\" stroke-width=\"14\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g><path d=\"M 286 372 H 738 A 78 78 0 0 1 816 450 V 728 A 78 78 0 0 1 738 806 H 286 A 78 78 0 0 1 208 728 V 450 A 78 78 0 0 1 286 372 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","account":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#7186ff\"/><stop offset=\"1\" stop-color=\"#4a45dc\"/></linearGradient><linearGradient id=\"head\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffc38f\"/><stop offset=\"1\" stop-color=\"#ff8d5c\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#f3f4ff\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"bodyClip\"><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"512\" cy=\"367\" r=\"170\" fill=\"url(#head)\"/><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\" fill=\"#1c1a8f\" fill-opacity=\"0.18\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#bodyClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"512\" cy=\"367\" r=\"170\" fill=\"url(#head)\"/></g><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\" fill=\"url(#glass)\"/></g><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","today":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#2e3a70\"/><stop offset=\"1\" stop-color=\"#141938\"/></linearGradient><radialGradient id=\"glow\" cx=\"512\" cy=\"512\" r=\"420\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#ffd44f\" stop-opacity=\"0.28\"/><stop offset=\"1\" stop-color=\"#ffd44f\" stop-opacity=\"0\"/></radialGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd84f\"/><stop offset=\"1\" stop-color=\"#f9b425\"/></linearGradient><linearGradient id=\"sheen\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\"0.38\"/><stop offset=\"0.55\" stop-color=\"#fff\" stop-opacity=\"0.08\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.6\" stop-color=\"#fff\" stop-opacity=\"0.25\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.1\"/></linearGradient><mask id=\"rim\"><rect x=\"-512\" y=\"-512\" width=\"2048\" height=\"2048\" fill=\"url(#rimFade)\"/></mask><filter id=\"shade\" x=\"-30%\" y=\"-30%\" width=\"160%\" height=\"160%\"><feGaussianBlur stdDeviation=\"16\"/></filter><linearGradient id=\"p0\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5aa9ff\"/><stop offset=\"1\" stop-color=\"#2b69de\"/></linearGradient><linearGradient id=\"p1\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ff8f62\"/><stop offset=\"1\" stop-color=\"#ef5236\"/></linearGradient><linearGradient id=\"p2\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4fdcd0\"/><stop offset=\"1\" stop-color=\"#119a95\"/></linearGradient><linearGradient id=\"p3\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9a8cff\"/><stop offset=\"1\" stop-color=\"#5a4fe0\"/></linearGradient></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><rect width=\"1024\" height=\"1024\" fill=\"url(#glow)\"/><g transform=\"rotate(-45 512 512)\"><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"#000\" fill-opacity=\"0.35\" filter=\"url(#shade)\" transform=\"translate(0 14)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#p0)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#sheen)\"/><rect x=\"433\" y=\"143\" width=\"158\" height=\"306\" rx=\"79\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\"0.75\" stroke-width=\"5\" mask=\"url(#rim)\"/></g><g transform=\"rotate(45 512 512)\"><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"#000\" fill-opacity=\"0.35\" filter=\"url(#shade)\" transform=\"translate(0 14)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#p1)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#sheen)\"/><rect x=\"433\" y=\"143\" width=\"158\" height=\"306\" rx=\"79\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\"0.75\" stroke-width=\"5\" mask=\"url(#rim)\"/></g><g transform=\"rotate(135 512 512)\"><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"#000\" fill-opacity=\"0.35\" filter=\"url(#shade)\" transform=\"translate(0 14)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#p2)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#sheen)\"/><rect x=\"433\" y=\"143\" width=\"158\" height=\"306\" rx=\"79\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\"0.75\" stroke-width=\"5\" mask=\"url(#rim)\"/></g><g transform=\"rotate(225 512 512)\"><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"#000\" fill-opacity=\"0.35\" filter=\"url(#shade)\" transform=\"translate(0 14)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#p3)\"/><rect x=\"430\" y=\"140\" width=\"164\" height=\"312\" rx=\"82\" fill=\"url(#sheen)\"/><rect x=\"433\" y=\"143\" width=\"158\" height=\"306\" rx=\"79\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\"0.75\" stroke-width=\"5\" mask=\"url(#rim)\"/></g><circle cx=\"512\" cy=\"530\" r=\"104\" fill=\"#7a4a00\" fill-opacity=\"0.35\" filter=\"url(#shade)\"/><circle cx=\"512\" cy=\"512\" r=\"104\" fill=\"url(#sun)\"/><circle cx=\"512\" cy=\"512\" r=\"101\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\"0.55\" stroke-width=\"5\" mask=\"url(#rim)\"/></svg>"};
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
    bubble: '<path d="M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 21l2-5.4A8.4 8.4 0 1 1 21 11.5Z"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
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
    const rowsBox = el("div", "ifm-rows", ...drawRows(o.rows));
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
      rowsBox.replaceChildren(...drawRows(list));
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

  // ---- the hub: every app a page of inflite.ai, in one window ----
  // At inflite.ai, Today, Apps and You are one page (/, /#apps, /#you), and Chats, Weather, Fitness and Markets are pages
  // beside it (/chats/, /weather/, /fitness/, /markets/), each fetched from the app's own address by the site's Worker,
  // which marks each one it serves with a meta tag named ifl-hub, its content the app's path ("/weather/"; Today's own page has "/"). That
  // marker, and never the address, is what says an app is at the hub: at chat.inflite.ai, chat.localhost or a test's
  // address there's none, and every app is exactly what it was. (Mail stays at its own address, framed at /mail/.)
  //   on, base           the marker's there; what it says ("" where it isn't)
  //   go(url)            an app's own address as the hub's: https://chat.<site>/#x → /chats/#x, weather. → /weather/,
  //                      fitness. → /fitness/, finance. → /markets/, email. → /mail/, <site>/ → /; account., auth. and
  //                      any other site as they are (a test's site, ifl.test, the same way); off the hub, url as it is
  //   href(app, section) an app at a section: ("weather", "radar") → "/weather/#radar", ("markets", "s=TSCO") →
  //                      "/markets/#s=TSCO", ("chat", "open=<id>") → "/chats/#open=<id>"; off the hub, null (the hub's
  //                      paths aren't pages at an app's own address: the app links its own way, as it always has)
  //   tabs(el, current)  Today · Chats · Apps · You, the hub's tab bar, into el; current (its key: today, chats, apps or
  //                      you) marked; off the hub, el left as it is
  //   back()             back where you came from in the window (the breadcrumb, below), else to Apps; never history's
  //                      own back (Mail keeps history of its own, and an app opened from a notification has none). → true;
  //                      off the hub, nothing done: false
  //   chat()             Chat's engine: Chat's own page (/chats/?engine=1) in a frame over this one, unseen until it shows
  //                      its send sheet, which sends a card without leaving. A promise of it (its IFLChat, ready), or of
  //                      null: not ready (signed out of Chats, its key not here yet, locked), or no answer in 15 seconds.
  //                      Made on first use, kept while the page is open, dropped after 10 minutes out of sight
  //   send(words, packed, { to })   a card to a friend: the engine's sheet over this page, else Chats' own, which comes
  //                      back here after (#share=…&card=…&back=<this page>). → a promise of what the engine's sheet says,
  //                      or true once it's gone to Chats'; off the hub, of false, nothing done (the app sends its own
  //                      way, chat.<site>/#share=…, as it always has)
  //   sent(say), closed()           the engine's word that it's sent (the frame put away, and "Sent to Pat. You’re still
  //                      here" said) or that its sheet's shut (put away)
  //   signIn()           a signed-out app at the hub signs in through Chats, and comes back here. → true; off the hub,
  //                      nothing done: false
  //   moved(app, { off })           an old Home Screen icon (off the hub, opened from the Home Screen, filling it: never
  //                      iOS's small browser, which a link from another Home Screen app opens): once, the card saying
  //                      InFlite is one app now, with How to Add and Turn Off Notifications Here (off). → true if shown
  //   degrade(links)     this page of the hub runs as the apps did before it (its Worker can't serve them yet: Today's
  //                      /api/hub says not ready): go, href and the tabs give the apps' own addresses (links: { chat,
  //                      weather, fitness, finance, email }, each an origin; else <app>.<site>), send goes to
  //                      chat.<site>/#share=…, and there's no engine. degraded: whether it does
  // The breadcrumb: where a page of the hub was left from, for its Back (Chat's pages send no Referer). Written, as the
  // page you're on (its path, ≤ 200 characters), by go and href to another page, the tabs and links to one, and a
  // notification opened on another page; read once as a page opens (what it was left from); taken as Back goes, so Back
  // never bounces between two pages.
  // A notification tapped while a page of the hub is open: the root worker (/sw.js) posts { ifl: "open", url } to the
  // window, and the page goes there (a path of this site's only), in the same window; within an app, its hashchange.
  // Sent from Chats' own sheet (send's way through Chats): sessionStorage["ifl-sent"], said once here as the page opens.
  const CRUMB = "ifl-crumb", SENT = "ifl-sent";
  const SUBS = { chat: "/chats/", weather: "/weather/", fitness: "/fitness/", finance: "/markets/", email: "/mail/" };
  const HUB_APPS = { today: "/", chat: "/chats/", chats: "/chats/", weather: "/weather/", fitness: "/fitness/", markets: "/markets/", mail: "/mail/" };
  // (each hub path's app, by its own address's first part: degraded, the way back to it)
  const OWN = { chats: "chat", weather: "weather", fitness: "fitness", markets: "finance", mail: "email" };
  // (keys, not words: no app's copy but Today's names Today as an app, iflmenu.test.mjs)
  const TABS = { today: ["Today", "/", "sun"], chats: ["Chats", "/chats/", "bubble"], apps: ["Apps", "/#apps", "grid"], you: ["You", "/#you", "person"] };
  const marker = typeof document !== "undefined" ? document.querySelector?.('meta[name="ifl-hub"]') : null;
  // (a path of this site's: starts /, not //, no \ and nothing unseen (a tab or a new line, which an address drops, so
  // "/\n/x" would be "//x"), no more than 200 characters)
  const ownPath = (p) => typeof p === "string" && p.length <= 200 && /^\/(?!\/)/.test(p) && !/[\\\u0000-\u001f\u007f]/.test(p);
  const pageOf = (p) => { try { return new URL(p, location.origin).pathname; } catch (_) { return null; } };
  const store = () => { try { return sessionStorage; } catch (_) { return null; } };
  const crumb = () => { const p = location.pathname + location.hash; try { if (ownPath(p)) store()?.setItem(CRUMB, p); } catch (_) {} };
  // (what this page was left from, read as it opens: its own later writes are for the page it goes to next)
  const cameFrom = (() => { try { const c = store()?.getItem(CRUMB); return ownPath(c) ? c : null; } catch (_) { return null; } })();
  const leaving = (p) => ownPath(p) && pageOf(p) !== location.pathname;
  const standalone = () => { try { return navigator.standalone === true || !!matchMedia?.("(display-mode: standalone)").matches; } catch (_) { return false; } };
  // (the app's own Home Screen icon, filling the screen: not iOS's small browser, which a link from another Home Screen
  // app opens it in, "standalone" too but under its own bars and short of the screen, where moved()'s card would cover
  // the page. On an iPhone or iPad (navigator.standalone): filling the screen from top to bottom (upright, its height; on
  // its side, its short side: the small browser's bars leave it short either way), or running up behind the status bar
  // (a top inset: every app's page is viewport-fit=cover); elsewhere, standalone is enough)
  const ownIcon = () => {
    if (navigator.standalone !== true) return true;
    try {
      const w = window.screen?.width || 0, h = window.screen?.height || 0;
      const tall = matchMedia("(orientation: portrait)").matches ? h : (w && h ? Math.min(w, h) : w || h);
      if (tall && innerHeight >= tall - 2) return true;
      const p = document.createElement("div");
      p.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none";
      document.body.append(p);
      const inset = p.offsetHeight;
      p.remove();
      return inset > 0;
    } catch (_) { return true; }
  };
  // degraded: the apps' own addresses (degrade's links, else <app>.<site>), and a hub path back to its app's
  let links = {};
  const origin = (sub) => links[sub] || `${location.protocol}//${sub}.${location.host.replace(/^next\./, "")}`;
  const ownAt = (p) => { const m = /^\/(chats|weather|fitness|markets|mail)(?=$|[/?#])\/?([\s\S]*)$/.exec(p); return m ? `${origin(OWN[m[1]])}/${m[2]}` : null; };
  const stillHere = (say) => (/still here/i.test(say) ? say : `${say.replace(/[.\s]+$/, "")}. You’re still here`);
  const hub = {
    on: !!marker,
    base: marker ? marker.getAttribute("content") || "/" : "",
    degraded: false,
    go(url) {
      if (!hub.on) return url;
      let u;
      try { u = new URL(String(url), location.href); } catch (_) { return url; }
      if (!/^https?:$/.test(u.protocol) || u.username || u.password) return url;
      // (the site: this page's, the staging hub's next. taken off, so its links to the apps' own addresses come here too)
      const site = location.host.replace(/^next\./, ""), rest = u.pathname + u.search + u.hash, sub = /^([a-z]+)\.(.+)$/.exec(u.host);
      let p = null;
      if (u.host === location.host || u.host === site) p = rest;
      else if (sub && sub[2] === site && SUBS[sub[1]]) p = SUBS[sub[1]].slice(0, -1) + rest;
      if (p == null) return url;
      if (hub.degraded) return ownAt(p) || (ownPath(p) ? p : url);
      if (leaving(p)) crumb();
      return p;
    },
    href(app, section = "") {
      if (!hub.on) return null;
      const s = String(section || ""), p = (HUB_APPS[app] || "/") + (!s ? "" : /^[#?]/.test(s) ? s : "#" + s);
      if (hub.degraded) return ownAt(p) || p;
      if (leaving(p)) crumb();
      return p;
    },
    tabs(nav, current) {
      if (!nav || !hub.on) return nav;
      if (nav.tagName !== "NAV") nav.setAttribute("role", "navigation");
      nav.setAttribute("aria-label", "InFlite");
      nav.classList.add("ifl-tabs");
      nav.replaceChildren(...Object.entries(TABS).map(([k, [label, to, icon]]) => {
        const a = document.createElement("a"), href = hub.degraded ? ownAt(to) || to : to;
        a.className = "ifl-tab"; a.href = href; a.dataset.tab = k;
        a.insertAdjacentHTML("afterbegin", svg(icon, "ifl-tab-ic"));
        a.append(el("span", "ifl-tab-l", label));
        if (k === current) a.setAttribute("aria-current", "page");
        a.addEventListener("click", () => { if (!hub.degraded && leaving(to)) crumb(); });
        return a;
      }));
      return nav;
    },
    back() {
      if (!hub.on) return false;
      const to = cameFrom && pageOf(cameFrom) !== location.pathname ? cameFrom : "/#apps";
      try { store()?.removeItem(CRUMB); } catch (_) {}
      location.assign(to);
      return true;
    },
    chat,
    send(words, packed, { to } = {}) {
      if (!hub.on) return Promise.resolve(false);
      const card = typeof packed === "string" && /^[A-Za-z0-9_-]+$/.test(packed) ? "&card=" + packed : "";
      if (hub.degraded) {
        location.assign(`${origin("chat")}/#share=${encodeURIComponent(String(words ?? ""))}${card}`);
        return Promise.resolve(true);
      }
      return hub.chat().then((c) => {
        if (c && c.state === "ready") return c.share(words, packed, { to });
        location.assign("/chats/#share=" + encodeURIComponent(String(words ?? "")) + card + "&back=" + encodeURIComponent(location.pathname + location.hash));
        return true;
      });
    },
    sent(say) { hide(); if (say) toast(stillHere(String(say).slice(0, 200))); },
    closed() { hide(); },
    signIn() {
      if (!hub.on || hub.degraded) return false;
      location.assign("/chats/#signin-start&then=" + encodeURIComponent(location.pathname + location.hash));
      return true;
    },
    moved(app, { off } = {}) {
      if (hub.on || !standalone() || !document.body || !NAME[app] || !ownIcon()) return false;
      const k = `ifl-moved:${app}`;
      try { if (localStorage.getItem(k)) return false; localStorage.setItem(k, String(Date.now())); } catch (_) { return false; }
      movedCard(app, typeof off === "function" ? off : null);
      return true;
    },
    degrade(own = {}) {
      if (!hub.on) return false;
      links = {};
      for (const k of Object.values(OWN)) if (typeof own?.[k] === "string" && /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(own[k])) links[k] = own[k];
      hub.degraded = true;
      dropEngine();
      return true;
    },
  };

  // Chat's engine: /chats/?engine=1 in a frame over the page, its IFLChat once it says it's ready (ifl-chat-ready, on
  // this window), and the frame seen only while it shows its sheet (put away by sent or closed, or when its answer says
  // no sheet is showing). The frame is in a dialog of its own: shown, the dialog's modal, so it's in the top layer, over
  // every sheet of the page's own (a modal one too, which would otherwise make it inert) and the only thing a tap
  // reaches; put away, the dialog's shut but still laid out (unseen, never in the way of a tap: menu.css), so the engine
  // runs on and its sheet opens at once. The frame is never moved (that would load it again)
  const ENGINE_WAIT = 15e3, ENGINE_DROP = 10 * 60e3;
  let engine = null, resting = false;
  function dropEngine() { engine?.box.remove(); engine = null; }
  function hide() {
    const b = engine?.box;
    if (!b) return;
    b.classList.remove("on");
    try { if (b.open) b.close(); } catch (_) {}
  }
  function show() {
    const b = engine?.box;
    if (!b) return;
    b.classList.add("on");
    try { if (!b.open) b.showModal(); } catch (_) {}
  }
  // (the engine as the page uses it: its own calls, the frame shown for its sheet, and put away where nothing's showing:
  // a card refused (false, { ok: false }, { why }); sendTo's one tap sent ({ ok: true, say }: said here too). A sheet
  // that's shown is put away by its own word, sent or closed)
  const none = (r) => r === false || (!!r && typeof r === "object" && (r.ok === false || !!r.why));
  const wrap = (c) => ({
    get state() { return c.state; },
    share(...a) { show(); return Promise.resolve().then(() => c.share(...a)).then((r) => { if (none(r)) hide(); return r; }, (e) => { hide(); throw e; }); },
    sendTo(...a) {
      show();
      return Promise.resolve().then(() => c.sendTo(...a)).then((r) => { if (r?.ok === true) hub.sent(r.say || "Sent"); else if (none(r)) hide(); return r; }, (e) => { hide(); throw e; });
    },
    waiting: (...a) => c.waiting(...a),
    since: (...a) => c.since(...a),
    refresh: (...a) => c.refresh(...a),
    signOut: (...a) => c.signOut(...a),
  });
  const ready = () => { const c = engine?.api; return c && c.state === "ready" ? wrap(c) : null; };
  function chat() {
    if (!hub.on || hub.degraded || resting || !document.body) return Promise.resolve(null);
    if (engine) return engine.api ? Promise.resolve(ready()) : engine.wait;
    const box = document.createElement("dialog"), f = document.createElement("iframe");
    box.className = "ifl-engine-box";
    box.setAttribute("aria-label", "Chats");
    // (shut some other way (Escape, while the page has the focus): put away, as closed() would. Not when it's been shown
    // again since: this word comes a moment after it's shut)
    box.addEventListener("close", () => { if (!box.open) box.classList.remove("on"); });
    f.name = "ifl-chat"; f.className = "ifl-engine"; f.src = "/chats/?engine=1";
    f.setAttribute("title", "Chats");
    box.append(f);
    const e = engine = { box, frame: f, api: null, wait: null };
    e.wait = new Promise((ok) => {
      let t = 0;
      const done = () => {
        clearTimeout(t);
        removeEventListener("ifl-chat-ready", done);
        if (engine !== e) return ok(null);
        let c = null;
        try { c = f.contentWindow?.IFLChat || null; } catch (_) {}
        // (no engine in time: the frame dropped, and for two minutes none asked for again (a Send goes through Chats'
        // own sheet at once meanwhile); after that, the next use asks again)
        if (!c) { dropEngine(); resting = true; setTimeout(() => { resting = false; }, 2 * 60e3); return ok(null); }
        e.api = c;
        ok(ready());
      };
      addEventListener("ifl-chat-ready", done);
      t = setTimeout(done, ENGINE_WAIT);
    });
    document.body.append(box);
    return e.wait;
  }
  // (out of sight for ten minutes, the engine's let go: made again when it's next wanted)
  let hiddenAt = 0, dropT = 0;
  if (hub.on) document.addEventListener("visibilitychange", () => {
    clearTimeout(dropT);
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); dropT = setTimeout(() => { if (document.visibilityState === "hidden") dropEngine(); }, ENGINE_DROP); return; }
    if (hiddenAt && Date.now() - hiddenAt >= ENGINE_DROP) dropEngine();
    hiddenAt = 0;
  });

  // (a link to another of the hub's pages, followed: the breadcrumb, as the page is left, with where it was scrolled to)
  if (hub.on) document.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a[href]");
    if (hub.degraded || !a || a.target === "_blank" || a.hasAttribute("download")) return;
    let u;
    try { u = new URL(a.href, location.href); } catch (_) { return; }
    if (u.origin === location.origin && leaving(u.pathname + u.hash)) crumb();
  }, true);
  // (a notification tapped while this page is open: the root worker's word, to a path of this site's only. Heard, it's
  // said so on the port the worker gave, else the worker opens it some other way: a page that has no ear for it)
  if (hub.on) navigator.serviceWorker?.addEventListener?.("message", (e) => {
    const d = e.data;
    if (!d || d.ifl !== "open" || !ownPath(d.url)) return;
    try { e.ports?.[0]?.postMessage({ ifl: "opened" }); } catch (_) {}
    if (hub.degraded) return location.assign(hub.go(d.url));
    if (leaving(d.url)) crumb();
    location.assign(d.url);
  });
  // (the hub's look: html.ifl-hub, and pages that cross-fade into each other, the tab bar staying put. menu.css asks for
  // it of every page (@view-transition, which can't be kept to html.ifl-hub there, and must be in a stylesheet to be
  // there as the next page's first shown): off the hub, every page lets it go as it's left, so nothing changes there; at
  // the hub, one that can't be done is let go quietly, before it can fail out loud: below)
  if (hub.on) document.documentElement?.classList.add("ifl-hub");
  // (the Home Screen icon's badge, as many notifications as are still showing: counted again by the root worker as a
  // page of the hub opens and each time it's back in sight, so those tapped or cleared meanwhile are gone from it)
  const recount = () => { try { navigator.serviceWorker?.getRegistration?.("/")?.then?.((r) => r?.active?.postMessage({ ifl: "badge" }), () => {}); } catch (_) {} };
  if (hub.on) {
    recount();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") recount(); });
  }
  // A cross-fade that ends on a page that doesn't ask for it (one of this site's that isn't the hub's: an /api/ answer,
  // a 404) is called off in that page, which then says so as an error no script of its own can catch ("Transition was
  // aborted because of invalid state. ViewTransition opt-in disabled"). So a page of the hub lets go of one that's
  // bound anywhere but the hub's own pages (Today, Chats, the apps and Mail's, whose stylesheets all ask for it), as
  // it's left. And the one this page opened with is caught as it starts (document.activeViewTransition): called off
  // before it's shown, it would say so out loud too. This runs from the page's module, which a slow load can bring in
  // after that's happened: Today's page catches it first, as its head is read (the inflite repo's today/public/fade.js),
  // and any page of the hub that loads that script before its module does the same.
  const FADES = /^\/(?:index\.html)?$|^\/(?:chats|weather|fitness|markets|mail)\/(?:index\.html)?$/;
  const fades = (to) => { try { const u = new URL(to, location.href); return u.origin === location.origin && FADES.test(u.pathname); } catch (_) { return false; } };
  const hush = (t) => { if (t) for (const k of ["ready", "finished", "updateCallbackDone"]) t[k]?.catch?.(() => {}); return t; };
  const vt = (e) => {
    const t = hush(e.viewTransition), to = e.type === "pageswap" ? e.activation?.entry?.url : null;
    if (t && (!hub.on || (to && !fades(to)))) t.skipTransition?.();
  };
  try { hush(document.activeViewTransition); } catch (_) {}
  addEventListener("pageswap", vt);
  addEventListener("pagereveal", vt);

  // the card for an old Home Screen icon: InFlite is one app now (as allow's sheet looks)
  function movedCard(app, off) {
    const img = el("img", "ifa-ic"); img.src = iconUrl(app); img.alt = "";
    const how = el("button", "ifa-go", "How to Add"), stop = off ? el("button", "ifa-later ifa-off", "Turn Off Notifications Here") : null, later = el("button", "ifa-later", "Not Now");
    for (const b of [how, stop, later]) if (b) b.type = "button";
    const steps = el("p", "ifa-p ifa-steps", "In Safari, open inflite.ai, tap Share, then Add to Home Screen. Sign in there once, and every app is in it.");
    steps.hidden = true;
    const sheet = el("div", "ifa-sheet", img, el("h2", "ifa-t", "InFlite is one app now"), el("p", "ifa-p", "Today, Chats and every app in one place. Add inflite.ai to your Home Screen."), steps, how, stop, later);
    sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", "InFlite is one app now");
    const layer = el("div", "ifa-layer ifl-moved", sheet), was = document.activeElement;
    const shut = () => { document.removeEventListener("keydown", key, true); layer.classList.remove("on"); setTimeout(() => layer.remove(), 320); was?.focus?.({ preventScroll: true }); };
    // (Escape shuts it; Tab and Shift-Tab go round its buttons, never behind it)
    const key = (e) => {
      if (e.key === "Escape") return shut();
      if (e.key !== "Tab") return;
      const f = [how, stop, later].filter((b) => b && !b.hidden && !b.disabled);
      if (!f.length) return;
      e.preventDefault();
      const i = f.indexOf(document.activeElement);
      f[i < 0 ? (e.shiftKey ? f.length - 1 : 0) : (i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus({ preventScroll: true });
    };
    how.onclick = () => { steps.hidden = false; how.hidden = true; later.textContent = "Done"; later.focus({ preventScroll: true }); };
    if (stop) stop.onclick = async () => {
      stop.disabled = true; stop.textContent = "Turning Off…";
      const done = await Promise.resolve().then(off).then(() => true, () => false);
      if (done) { shut(); note(app, "Notifications off here", "They come to InFlite instead, once it’s on your Home Screen"); }
      else { stop.disabled = false; stop.textContent = "Turn Off Notifications Here"; }
    };
    later.onclick = shut;
    layer.addEventListener("pointerdown", (e) => { if (e.target === layer) shut(); });
    document.addEventListener("keydown", key, true);
    document.body.append(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add("on")));
    how.focus?.({ preventScroll: true });
  }
  // a plain toast: the words alone, said out, gone in a few seconds
  let toastEl = null, toastT = 0;
  function toast(text) {
    toastEl?.remove();
    clearTimeout(toastT);
    const t = toastEl = el("div", "ifm-note ifl-toast", el("span", "ifm-note-tx", el("b", "", text)));
    document.body.append(t);
    if (!sayEl.isConnected) document.body.append(sayEl);
    sayEl.textContent = "";
    requestAnimationFrame(() => requestAnimationFrame(() => { if (toastEl !== t) return; t.classList.add("on"); sayEl.textContent = text; }));
    toastT = setTimeout(() => { t.classList.remove("on"); sayEl.textContent = ""; setTimeout(() => t.remove(), 400); }, 3600);
  }
  // (sent from Chats' own sheet, and back: said once, here)
  if (hub.on) {
    let said = null;
    try { said = store()?.getItem(SENT); store()?.removeItem(SENT); } catch (_) {}
    if (said) toast(stillHere(String(said).slice(0, 200)));
  }

  const api = { header, headerHtml, watch, settle, glyph, APPS, NAME, menu, close, redraw, isOpen: () => !!open, built, note, iconUrl, allow, wantsAllow,
    updates, offer, here, update: () => apply(true), updateReady: () => !!U.ready, hub };
  // (at the hub, the page's IFL on its window too: so Chat's engine, a frame of this page's, can say it's sent or shut its
  // sheet (parent.IFL.hub.sent(say), parent.IFL.hub.closed(), §8.2), and Today's day and cards find the page's own hub.
  // A const at the top of a module or a script is never the window's own. It can be taken back (configurable), so a
  // page's own global IFL never clashes with it, and one put there first (a test's stand-in) is left as it is)
  if (hub.on && typeof window !== "undefined") try { Object.defineProperty(window, "IFL", { value: api, configurable: true, writable: true }); } catch (_) {}
  return api;
})();
// ==== end of InFlite's menu ====
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const MIN = 60e3;
const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"; } catch { return "Europe/London"; } };
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const clock = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const DEFAULT_LINKS = (() => {
  const live = /(^|\.)inflite\.ai$/.test(location.hostname);
  const at = (n) => (live ? `https://${n}.inflite.ai` : `${location.protocol}//${n}.${location.hostname}${location.port ? ":" + location.port : ""}`);
  return { chat: at("chat"), weather: at("weather"), fitness: at("fitness"), finance: at("finance"), email: at("email"), account: at("account"), auth: at("auth") };
})();

// ---------------------------------------------------------------- what the page knows
const S = {
  view: null, // the session view, signed in (2.3): { user, prefs, morning, links, quiet, apps, hubPush }
  links: null,
  prefs: { order: CARD_KEYS.filter((k) => k !== "mail"), hidden: [] },
  answer: null, // the last cards answer (GET /api/today?v=2): { at, tz, cards, morning } and, from an account side that
  //               knows Today First, v: 2 with the day (phase, tops, waiting, upcoming, acts, apps, …)
  answerAt: 0, // when it came (or was kept)
  skew: 0, // how far this device's clock was behind the account's, as the last answer came (never less than 0)
  kept: false, // drawn from this browser's copy, not yet fresh
  morning: null, // the morning view (2.5), or the session's few words of it
  device: null, // this device's name for the server: the first 16 of b64url(SHA-256(endpoint))
  endpoint: null, // this device's push endpoint (only ever sent in a body)
  loadedAt: 0, // when the day was last asked for
  hub: false, // the hub's Worker can serve the apps here (GET /api/hub): else Today runs as it did before (degraded)
  roof: false, // and Weather is the framework's, in this page (GET /api/hub's roof === true, One roof D14); else
  //              /weather/ is milestone 1's page of the hub, a normal navigation
  apps: {}, // each module's switch, as /api/hub's apps says ({ weather, markets, fitness, mail }: booleans; s24 §2),
  //           ANDed with hub; a Worker from before says only roof: { weather: roof }
  dayLine: null, // the header's line, as the day (day.js) says it for its phase
  asked5: false, // the one fetch 5 seconds after an answer still being planned, made
  boundary: 0, // the until whose crossing has had its fetch put in hand
};
// (the page's own sheet that's open, as the frame's sheet handle, and its dialog's id; the frame, made once signed in)
let sheetOpen = null, sheetId = null, waitingAnswer = null, F = null;

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
// (a route this account side doesn't have yet: an older one, or one not built yet. Either way, that part isn't there)
const missing = (e) => e?.status === 404 || e?.status === 501;

// ---------------------------------------------------------------- the hub: whether this site's Worker serves the apps
// Asked once a visit (GET /api/hub, kept in sessionStorage): ready, the tab bar's Chats, the Apps tiles and every Send are
// the hub's (/chats/, /weather/, …, Chat's engine over the page); not ready (its key not set yet), Today runs as it did
// before: each app at its own address, Send through chat.<site>/#share=, no engine, and You without the rows only the
// hub has (IFL.hub.degrade). Three ways (One roof D23): "yes" ({ ready: true }), "no" (an explicit { ready: false }, a
// 404 or a 503) or "unknown" (no answer in 1.5 s, or no network); only yes and no are kept. At / an unknown is as
// before (the apps' own addresses until a later answer, kept for the visit's next page); on a /weather/ boot it counts
// as ready with roof on, as the document is the framework only because the Worker served it with roof on (or the root
// worker the kept / offline). And roof (D14): Weather in this page, read as j.roof === true (a Worker from before, or
// none said: off, milestone 1's Weather page), kept beside it as ifl-roof ("1" | "0"; one without the other is asked
// again)
const HUB_KEY = "ifl-hub-ready", ROOF_KEY = "ifl-roof", BOUNCE_KEY = "ifl-roof-bounce", APPS_KEY = "ifl-roof-apps";
const ss = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
  del: (k) => { try { sessionStorage.removeItem(k); } catch {} },
};
// (this document is a module's address: /weather/ or /weather/index.html, which the Worker answers with this page while
// Weather is the framework's)
const BOOT_APP = Object.values(REGISTRY).find((r) => location.pathname === r.path || location.pathname === r.path + "index.html") || null;
let roofSaid = false, appsSaid = {}, hubAt = 0;
// (each module's switch from an answer: its apps, booleans only; one from before says only roof, Weather's)
const appsFrom = (a, roof) => { const o = {}; for (const k of Object.keys(REGISTRY)) o[k] = a && typeof a === "object" ? a[k] === true : k === "weather" && !!roof; return o; };
const keptApps = () => { let a = null; try { a = JSON.parse(ss.get(APPS_KEY)); } catch {} return appsFrom(a, ss.get(ROOF_KEY) === "1"); };
// (one module's kept switch: true, false, or null where nothing's kept for it)
const keptApp = (app) => { let a = null; try { a = JSON.parse(ss.get(APPS_KEY)); } catch {} return a && typeof a === "object" && typeof a[app] === "boolean" ? a[app] : app === "weather" && ss.get(ROOF_KEY) ? ss.get(ROOF_KEY) === "1" : null; };
// (what /api/hub said, as it said it: kept, and the old workers of the modules on let go of as soon as that's known,
// signed in or not. The bounce marker goes only where this document's module is on (or it's no module's): a framework
// served at an off module's path, from the worker's kept /, would otherwise bounce for ever)
function heard(state, roof, apps = appsFrom(null, roof)) {
  roofSaid = state === "yes" && roof;
  appsSaid = state === "yes" ? apps : {};
  if (state === "unknown") return;
  hubAt = Date.now();
  ss.set(HUB_KEY, state === "yes" ? "1" : "0");
  ss.set(ROOF_KEY, roof ? "1" : "0");
  ss.set(APPS_KEY, JSON.stringify(apps));
  if (state === "yes") { retireOld(); if (!BOOT_APP || apps[BOOT_APP.app]) ss.del(BOUNCE_KEY); }
}
function askHub() {
  return fetch("/api/hub", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } }).then(async (r) => {
    const j = r.ok ? await r.json().catch(() => null) : null;
    const state = typeof j?.ready === "boolean" ? (j.ready ? "yes" : "no") : r.status === 404 || r.status === 503 ? "no" : "unknown";
    heard(state, j?.roof === true, appsFrom(j?.apps, j?.roof === true));
    return state;
  }, () => "unknown");
}
// → "yes" | "no" | "unknown" (waited for 1.5 s at most, beside the session's own request). On a /weather/ boot only a
// kept yes with roof on is taken as it is: anything else kept is asked afresh, as this document is the framework only
// because the Worker (or the root worker, offline) had roof on, so a kept no or roof off may be from before a switch
// back on; only an answer that says so now bounces or leaves (D14, D23), and no answer counts as ready with roof on
async function hubReady() {
  const v = ss.get(HUB_KEY), r = ss.get(ROOF_KEY), a = keptApps();
  const trusted = BOOT_APP ? v === "1" && a[BOOT_APP.app] === true : (v === "1" || v === "0") && (r === "1" || r === "0");
  if (trusted) {
    roofSaid = v === "1" && r === "1";
    appsSaid = v === "1" ? a : {};
    if (v === "1") retireOld();
    return v === "1" ? "yes" : "no";
  }
  const asked = askHub();
  const state = await Promise.race([asked, new Promise((ok) => setTimeout(() => ok("unknown"), 1500))]);
  // (no answer in time: the answer, once it's in, as an ask again's, after the page has gone by the unknown; so a
  // /weather/ boot that went ahead is told roof's off by its own ask, the D14 bounce, not only by the next one)
  if (state === "unknown") asked.then((late) => { if (late !== "unknown") said.then(() => setTimeout(() => applyHub(late))); });
  return state;
}
// Asked again (D14): as the page comes back in sight, at most every 5 minutes (within 0: back from the bfcache), and
// right before Weather's module is loaded, at most every 30 seconds (the frame's ask: once a page, as the module's
// kept, but not twice at a /weather/ boot that's only just asked). A change is the frame's (F.setRoof): Weather let go
// of, its links normal navigations, its screen sent to the hub's page
let againAt = 0, againP = null;
function hubAgain(within = 5 * MIN) {
  if (againP) return againP;
  if (Date.now() - Math.max(againAt, hubAt) < within) return Promise.resolve();
  againAt = Date.now();
  againP = askHub().then(applyHub).finally(() => { againP = null; });
  return againP;
}
// (an answer after the first: the hub's explicit no degrading the page, each module as its switch now says (one turned
// off let go of, one turned on found in-page from now); an unknown changes nothing)
function applyHub(state) {
  if (state === "unknown") return;
  if (state === "no" && S.hub) { S.hub = false; IFL.hub.degrade(ownLinks()); }
  const on = S.hub && roofSaid, apps = S.hub ? { ...appsSaid } : {};
  if (on !== S.roof || JSON.stringify(apps) !== JSON.stringify(S.apps)) { S.roof = on; S.apps = apps; F?.setRoof(on, apps); }
}
// (each module's own old worker at the hub, at scope /<app>/ from milestone 1: unregistered once its switch is known on,
// so /<app>/ comes to this page, D10, S2-D14)
const retired = new Set();
function retireOld() {
  if (!navigator.serviceWorker?.getRegistrations) return;
  const go = Object.keys(appsSaid).filter((a) => appsSaid[a] && !retired.has(a));
  if (!go.length) return;
  for (const a of go) retired.add(a);
  navigator.serviceWorker.getRegistrations().then((rs) => {
    for (const r of rs) { try { const p = new URL(r.scope).pathname; if (go.some((a) => p === REGISTRY[a].path)) r.unregister().catch(() => {}); } catch {} }
  }, () => {});
}
const ownLinks = () => { const L = S.links || DEFAULT_LINKS; return { chat: L.chat, weather: L.weather, fitness: L.fitness, finance: L.finance, email: L.email || DEFAULT_LINKS.email }; };
// (where Sign in comes back to: this screen, as its path and hash say, never its query)
const thenHere = () => encodeURIComponent(location.pathname + location.hash);
let saidOk = null;
const said = new Promise((ok) => { saidOk = ok; });
function hubSays(state) {
  S.hub = state === "yes" || (state === "unknown" && !!BOOT_APP);
  S.roof = S.hub && (state === "unknown" || roofSaid);
  // (no answer at a module's address: Weather on as stage 1 had it, and the boot app on (the Worker served this page for
  // it) unless this tab's kept answer says it's off: the root worker serves its kept / there too when the hub's own page
  // fails)
  S.apps = !S.hub ? {} : state === "unknown" ? { ...keptApps(), weather: true, [BOOT_APP.app]: BOOT_APP.app === "weather" || keptApp(BOOT_APP.app) !== false } : { ...appsSaid };
  if (!S.hub) IFL.hub.degrade(ownLinks());
  // (signed out: the way in's second way, Today's own, only beside Chats' trip)
  $("#alsoRow").hidden = !S.hub;
  signinHref();
  saidOk();
}
// (Sign in's address, as the click goes: written at boot and again whenever the way in's shown, as the screen may have
// moved in the page since, RI15)
function signinHref() {
  $("#signin").href = S.hub ? `/chats/#signin-start&then=${thenHere()}` : `${safe(S.links?.auth) || DEFAULT_LINKS.auth}/`;
}
// A /weather/ document that reached this page (D13, D14): with the hub explicitly not ready, Weather's own address (same
// path, query and hash); with roof off, milestone 1's page of the hub, asked for once (the marker, never a path or a
// query), and Weather's own address if it's this page again. → true when the page is on its way elsewhere
function bootGone(state) {
  if (!BOOT_APP) return false;
  const rest = location.pathname + location.search + location.hash;
  if (state === "no") {
    IFL.hub.degrade(ownLinks());
    location.replace(IFL.hub.go(rest));
    return true;
  }
  if (state === "yes" && !appsSaid[BOOT_APP.app]) {
    const ln = BOOT_APP.link || BOOT_APP.app;
    if (ss.get(BOUNCE_KEY) === "1") location.replace((safe(S.links?.[ln]) || DEFAULT_LINKS[ln]) + rest.slice(BOOT_APP.path.length - 1));
    else {
      ss.set(BOUNCE_KEY, "1");
      // (the same address again, from the server: a reload where it's this one already, as a replace to it would only
      // move to its hash)
      const to = location.pathname + location.hash;
      if (to === location.pathname + location.search + location.hash) location.reload(); else location.replace(to);
    }
    return true;
  }
  return false;
}
// A module's files asked for ahead (D2, s2 §4.6): its connector, then a modulepreload for each of its files. On a
// module's boot, at once (beside /api/session) where the hub's known ready; else once Today's drawn, at idle, where the
// app's been used here (USED's key kept), or as a link to it is touched
const USED = { weather: "wx:places", markets: "markets:last", fitness: "fitness:meAt" };
const preloaded = new Set();
function preload(app) {
  if (preloaded.has(app)) return;
  preloaded.add(app);
  import("/roof/modules.js").then((m) => m.preload(app)).catch(() => {});
}
let armed = false;
function preloadSoon() {
  if (armed || !S.hub) return;
  armed = true;
  const on = (a) => S.hub && !!S.apps[a];
  for (const a of Object.keys(REGISTRY)) {
    let used = false;
    try { used = !!USED[a] && localStorage.getItem(USED[a]) != null; } catch {}
    if (used && on(a)) idle(() => { if (on(a)) preload(a); });
  }
  const touched = (e) => {
    const a = e.target?.closest?.("a[href^='/']"), app = a && Object.keys(REGISTRY).find((k) => a.getAttribute("href").startsWith(REGISTRY[k].path));
    if (app && on(app)) preload(app);
  };
  document.addEventListener("pointerdown", touched, true);
  document.addEventListener("focusin", touched, true);
}

// ---------------------------------------------------------------- this browser's copy of your day, per account
// Kept so Today opens with your day on a train; drawn only once the account has said it's you (or, in a Home Screen
// Today with no answer at all, if the last time it said so was you and under 12 hours ago), and gone the moment it's
// known you've signed out.
const KEPT = "today:session", CARDS_KEY = (id) => `today:cards:${id}`;
const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
function keepSession(view) { try { localStorage.setItem(KEPT, JSON.stringify({ id: view.user.id, at: Date.now(), view })); } catch {} }
// (only the four cards' answer, as version 1 has it: none of a version 2 answer's day, which is fetched afresh; no
// pigeon's place, which a Chat place is; no Markets card, whose figures are money, so offline its place is held until
// it's back; no Mail card, which is Mail's answer now or none (s4/spec §2.5); and of the morning, its settings, not how the next one reads, which says the portfolio's worth. Kept under
// today:*, none of them is)
const MORNING_KEPT = ["on", "at", "tz", "lines", "names", "devices", "thisDevice", "place"];
function keptOf(answer) {
  const m = answer.morning && typeof answer.morning === "object" ? Object.fromEntries(MORNING_KEPT.filter((k) => k in answer.morning).map((k) => [k, answer.morning[k]])) : null;
  const a = { at: answer.at, tz: answer.tz, cards: { ...(answer.cards || {}) }, ...(m ? { morning: m } : {}) }, chat = a.cards.chat;
  delete a.cards.markets;
  delete a.cards.mail;
  if (chat && typeof chat === "object") {
    const noPlace = (l, k) => (Array.isArray(l) ? l.map((p) => (p && typeof p === "object" ? { ...p, [k]: null } : p)) : l);
    a.cards.chat = { ...chat, inbound: noPlace(chat.inbound, "from"), mine: noPlace(chat.mine, "to") };
  }
  return a;
}
function keepCards(answer) {
  const id = S.view?.user?.id;
  if (!id || !answer) return;
  try { localStorage.setItem(CARDS_KEY(id), JSON.stringify({ id, at: Date.now(), answer: keptOf(answer) })); } catch {}
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
// The apps' copies of you, kept at this address. At the hub, Chats and every app are pages of inflite.ai, so what each
// keeps of you is kept here (§11.5): signing out of InFlite lets go of what each lets go of as you sign out of it on its
// own (Markets' forget(), Fitness's and Weather's signOutHere, Chat's forget), so none of it is drawn for whoever opens
// it next. Weather's places and settings are the phone's, as Weather's own Sign Out keeps them: only its copy of your
// account goes. Each app's look (its appearance, theme) stays too. (todaykept.test.mjs reads each app's own sign-out
// lists and checks every key in them is here.)
const APP_KEPT = [
  "mail:replies", "mail:unsent", "mail:outbox", "mail:remote-images", "mail:lens",
  "markets:last", "markets:years", "markets:recent", "markets:newsRead", "markets:newsHide", "markets:newsSeen", "markets:plan",
  "wx:acct",
  "fitness:hk", "fitness:today-sent", "fitness:today-swaps", "fitness:meAt", "fitness:files", "fitness:morning", "fitness:sums",
  "inflight-lock", "inflight-badges", "inflight-pushsub", "inflight-opened",
];
// (and what a module keeps for this tab only: Mail's sign-in word while its trip's under way)
const APP_SESSION_KEPT = ["mail:signin-verifier"];
// (an app's IndexedDB store at this address, changed by fn, if the app keeps one here; never made here where it doesn't,
// as there's nothing to let go of then. However it ends, within a few seconds: iOS can leave an open hanging)
function inStore(name, store, fn) {
  return new Promise((done) => {
    let r = null;
    const late = setTimeout(done, 2500), end = () => { clearTimeout(late); done(); };
    try { r = indexedDB.open(name); } catch { return end(); }
    r.onupgradeneeded = () => { try { r.transaction.abort(); } catch {} };
    r.onerror = end; r.onblocked = end;
    r.onsuccess = () => {
      const db = r.result;
      try {
        const tx = db.transaction(store, "readwrite");
        tx.oncomplete = tx.onerror = tx.onabort = () => { db.close(); end(); };
        fn(tx.objectStore(store));
      } catch { try { db.close(); } catch {} end(); }
    };
  });
}
// chat: Chat's sign-in on this phone too, when its own engine didn't sign out here (no engine, or no answer from it)
async function forgetApps({ chat = true } = {}) {
  try { for (const k of APP_KEPT) localStorage.removeItem(k); } catch {}
  try { for (const k of APP_SESSION_KEPT) sessionStorage.removeItem(k); } catch {}
  await Promise.all([
    // Fitness's copies of your activities' files, and of you (me:last), as its own Sign Out clears them
    inStore("fitness", "files", (s) => s.clear()),
    // Chat's sign-in and key, and its kept copy of your chats, as its forget() lets them go (and your pinned chats, once
    // the account keeps them too: pinsup); what you'd written and not sent stays, sealed, for when you're back in as you
    // (forget(true), as the engine's signOut does)
    chat ? inStore("inflight", "kv", (s) => {
      const q = s.get("session");
      q.onsuccess = () => {
        const id = q.result?.me?.id;
        s.delete("session");
        if (!id) return;
        s.delete(`cache:${id}`);
        const up = s.get(`pinsup:${id}`);
        up.onsuccess = () => { if (up.result) { s.delete(`pins:${id}`); s.delete(`pinsup:${id}`); } };
      };
    }) : null,
  ]);
}
function keptFor(id) {
  const c = readJSON(CARDS_KEY(id));
  return c && c.id === id && c.answer && typeof c.answer === "object" ? c : null;
}

// ---------------------------------------------------------------- signing in
// Chat first (the hub's): Sign in goes to Chats' own trip (/chats/#signin-start&then=/), which signs in Chats, Today and
// every app at once and comes back here. Beside it, quietly, Today's own trip (Sign In Without Chats), which never
// waits on Chat's key: InFlite's hand-back, as Mail does. Today sends you to InFlite's sign-in page (auth.inflite.ai) with
// the hash of a word it keeps in this tab; the page sends you back with a code that's good once, and only with that word.
// A Home Screen Today has its own cookie jar, so it signs in this way too. Where the hub can't serve Chats yet, Sign in is
// Today's own trip.
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

// Signing out of InFlite (You, or the menu): this device's notifications stopped first (in every app's table), Chat's
// sign-in and key on this phone gone too where its engine's here, the account's sign-in ended, your day forgotten here,
// then the sign-in page says so and offers the way back (§11.5)
async function signOut() {
  // (first, what you wrote in a module saved to its app (C10, s24 §10); where something couldn't be, asked before going on)
  const fl = await Promise.resolve(F?.flush?.()).catch(() => null);
  if (fl?.lost > 0 && !(await anyway())) return;
  try {
    const sub = await currentSub();
    if (sub) {
      await call("/api/device", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch((e) => (missing(e) ? call("/api/push", { method: "DELETE", body: { endpoint: sub.endpoint } }) : null)).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch {}
  const chatOut = S.hub && await Promise.race([
    IFL.hub.chat().then(async (c) => { if (typeof c?.signOut !== "function") return false; await c.signOut(); return true; }).catch(() => false),
    new Promise((ok) => setTimeout(() => ok(false), 4000)),
  ]);
  const auth = safe(S.links?.auth) || DEFAULT_LINKS.auth;
  await call("/api/logout", { method: "POST", body: {} }).catch(() => {});
  forgetKept();
  // (the frame let go of first: a module's own closing (Mail's unsent message) writes before its copies are wiped, never after)
  unframe();
  // (and the apps' copies of you at this address: the hub's, so every app's)
  await forgetApps({ chat: !chatOut });
  try { localStorage.removeItem("today:push"); } catch {}
  S.view = null;
  location.assign(`${auth}/#${new URLSearchParams({ signout: "today", back: `${location.origin}/` })}`);
}

// (Sign Out Anyway? → true to go on; Cancel, Escape or the cross → false)
function anyway() {
  if (!F) return Promise.resolve(true);
  return new Promise((ok) => {
    let yes = false, h = null;
    h = F.sheet.open({ sheet: "confirm", title: "Sign Out Anyway?", app: "inflite",
      body: F.ui.el("p", { class: "ifl-sub", text: "Something you wrote couldn’t be saved to its app. Sign Out Anyway?" }),
      acts: [{ label: "Cancel", act: "cancel", run: () => h.close() }, { label: "Sign Out", act: "signout", destructive: true, primary: true, run: () => { yes = true; h.close(); } }],
      onClose: () => ok(yes) });
  });
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
  signinHref();
  lift();
}
// signed out, as it's found out: by the account's answer, a 401, or the service worker's word. sure: the account itself
// said so (/api/session's 401 or signedIn false, or the frame's lost(), which asks it first)
function signedOutNow(sure) {
  // (signed out elsewhere, confirmed: the apps' copies of you here go too; Chat's own engine signs itself out, S2-D10. Any
  // other 401 or word asks the account afresh first: a stray 401 never wipes them)
  // (the frame let go of first, so nothing a module writes as it closes outlives the wipe)
  unframe();
  if (sure === true) forgetApps({ chat: false }).catch(() => {});
  else { sessionCheck = null; checkSession().then((inn) => inn === false && forgetApps({ chat: false })).catch(() => {}); }
  forgetKept();
  clearTimeout(prefsT); prefsT = 0;
  S.view = null; S.answer = null; S.morning = null; S.kept = false; S.dayLine = null; waitingAnswer = null;
  letDayGo();
  you?.forgetYou?.();
  for (const id of ["#top", "#waiting", "#coming", "#rest", "#apps", "#you", "#hd"]) $(id).replaceChildren();
  showOut();
}

function signedIn(view, { offline = false } = {}) {
  if (!view?.user?.id) return signedOutNow();
  const was = S.view?.user?.id;
  S.view = view;
  S.links = view.links || S.links || DEFAULT_LINKS;
  if (!S.hub) IFL.hub.degrade(ownLinks());
  // (the same account's order and hidden cards, unless a change made here is still on its way to the account)
  if (!(was === view.user.id && prefsBusy())) S.prefs = cleanPrefs(view.prefs, view);
  // (a copy kept for anyone else: gone)
  forgetKept(CARDS_KEY(view.user.id));
  if (!offline) keepSession(view);
  appearance(view.user.appearance);
  if (was !== view.user.id) { S.answer = null; S.kept = false; S.dayLine = null; if (was) you?.forgetYou?.(); }
  if (!S.morning || !("lines" in S.morning)) S.morning = view.morning || S.morning;
  $("#out").hidden = true;
  $("#in").hidden = false;
  frame();
  if (waitingAnswer) { const a = waitingAnswer; waitingAnswer = null; gotCards(a); }
  else if (!S.answer) {
    const k = keptFor(view.user.id);
    if (k) { S.answer = k.answer; S.answerAt = k.at; S.kept = true; if (k.answer.morning) S.morning = k.answer.morning; }
  }
  drawCards();
  drawMorning();
  lift();
  // (Chat's engine, made once the day's first drawn, when the page has a moment: for Waiting for You's words)
  if (S.hub && !offline) idle(() => { if (S.view) IFL.hub.chat(); });
  preloadSoon();
}
const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1200));

// a cards answer: drawn once the account's said who's signed in, and kept for next time
function gotCards(answer) {
  if (!answer || typeof answer !== "object" || !answer.cards) return;
  if (!S.view) { waitingAnswer = answer; return; }
  S.answer = answer; S.answerAt = Date.now(); S.kept = false;
  S.skew = Math.max(0, (Number.isFinite(answer.at) ? answer.at : 0) - Date.now());
  if (answer.morning) S.morning = answer.morning;
  if (answer.v !== 2) S.dayLine = null;
  keepCards(answer);
  drawCards();
  drawLine();
  drawMorning();
  if (on("apps")) drawAppsNow();
  // (the day still being worked out on the account: asked once more, 5 seconds on; once an answer's no longer planning,
  // the next that is gets its own)
  if (!answer.planning) S.asked5 = false;
  else if (!S.asked5) { S.asked5 = true; setTimeout(() => refresh(), 5000); }
  // (the minute's tick put to this answer's moments: its until may come sooner)
  nextMinute();
}

// ---------------------------------------------------------------- the screens: Today, Apps and You, on the framework
// The frame (/roof/frame.js, One roof §3.2) is made once signed in: it owns the header (#hd), the tab bar (#tabs), the
// screens in #views and the page's history (/, /#apps, /#you, /#you=<section>, and Weather at /weather/…), and draws
// each of Today, Apps and You from its spec here: its header (crumb, title, line, acts) and what to do as it's shown.
// Apps and You are drawn as they're first shown (apps.js and you.js, loaded then). Signed out, it's let go of (F.destroy)
const on = (tab) => F?.route?.kind === "tab" && F.route.tab === tab;
// (a module said its data changed, fw.changed(): Today's cards asked for again as Today's next shown, RI3)
let cardsStale = false;
// (Today's header: the date above its title, and the day's line under it: the phase's, else where the weather is)
const crumbOf = () => dateLong(Date.now(), S.answer?.tz || browserTz());
function lineOf() {
  if (S.dayLine) return S.dayLine;
  const w = S.answer?.cards?.weather;
  return w?.state === "ok" && w.place?.name ? String(w.place.name) : "";
}
const EDIT = { icon: "edit", label: "Edit Today: hide and reorder cards", run: () => openEdit() };
const SCREENS = {
  today: { el: $("#today"), title: () => "Today", crumb: crumbOf, line: lineOf, acts: [EDIT], onShow() { drawLine(true); if (cardsStale) { cardsStale = false; refresh(); } }, onHide() {} },
  apps: { el: $("#apps"), title: () => "Apps", crumb: () => "", line: () => "Each one here, in this window", acts: [], onShow() { drawAppsNow(); }, onHide() {} },
  you: { el: $("#you"), title: () => "You", crumb: () => "", line: () => (S.view?.user?.handle ? `@${S.view.user.handle}` : ""), acts: [], onShow(route) { drawYouNow(route?.arg ?? null); }, onHide() {} },
};
function frame() {
  if (F) return F;
  F = createFrame({
    root: $("#in"), header: $("#hd"), views: $("#views"), tabs: $("#tabs"),
    session: () => ({ view: S.view, hub: S.hub, roof: S.roof, apps: S.apps, links: S.links || DEFAULT_LINKS }),
    lost: () => signedOutNow(true), checkSession, hubAgain: () => hubAgain(30e3), save, changed: () => { cardsStale = true; },
    onMe: (button) => openMenu(button), me: () => photoNode(S.view?.user || {}),
    today: SCREENS.today, apps: SCREENS.apps, you: SCREENS.you,
  });
  for (const k of Object.keys(SCREENS)) F.screen(k, SCREENS[k]);
  // (the page's own sheets' close button: the framework's cross, as every sheet it builds has; the ✕ is for no script)
  for (const b of $$(".ifl-sheet .ifs-btn[data-close]")) b.replaceChildren(F.ui.icon("x"));
  provide();
  return F;
}
// (signed out: the frame let go of, Weather's module unmounted, its sheets shut; made afresh at the next sign-in)
function unframe() {
  const f = F;
  F = null;
  try { f?.destroy(); } catch (e) { console.error(e); }
}
let apps = null, you = null;
function drawAppsNow() {
  import("/apps.js").then((m) => { apps = m; if (S.view && F) m.drawApps($("#apps"), appsCtx()); }, () => {});
}
function drawYouNow(arg = null) {
  import("/you.js").then((m) => {
    you = m;
    if (!S.view || !F) return;
    const c = youCtx(), drawn = m.drawYou($("#you"), c);
    if (arg) m.goTo?.($("#you"), c, arg, drawn);
  }, () => {});
}
// (Today's answer's minis, through the framework's connectors: loaded as Apps or You needs them)
const connectors = () => import("/roof/connectors.js");
const appsCtx = () => ({ answer: S.answer, view: S.view, hub: S.hub, roof: S.roof, href: (app, section) => IFL.hub.href(app, section), icon: (app) => IFL.iconUrl(app), ui: F?.ui, connectors, frame: F });
const youCtx = () => ({
  view: S.view, hub: S.hub, roof: S.roof, call, missing, toast, get morning() { return S.morning; }, endpoint: () => S.endpoint, device: () => S.device,
  kept: () => { try { return localStorage.getItem("today:push"); } catch { return null; } }, photo: (u) => photoHtml(u),
  sub: currentSub, turnOn: () => turnOn(), turnOff: () => turnOff(), fanOut, toMorning, openAccount, signOut, canPush, pushWhy,
  chatSettings: () => location.assign(S.hub ? "/chats/#account" : `${safe(S.links?.chat) || DEFAULT_LINKS.chat}/#account`),
  openSheet, closeSheet, BUILD,
  frame: F, connectors, connector: (app) => connectors().then((m) => F && m.openConnector(F, app)), go: (path) => F?.nav.go(path), href: (app, section) => IFL.hub.href(app, section),
  icon: (app) => { try { return IFL.iconUrl(app) || ""; } catch { return ""; } },
});

// (signed out, or not? For the framework's session.lost(), D3: a module's 401 is believed only once /api/session says
// so. One read shared for 30 s; no answer is "still signed in", as nothing says otherwise)
let sessionCheck = null;
function checkSession() {
  if (sessionCheck) return sessionCheck;
  const headers = { Accept: "application/json" };
  if (standalone()) headers["X-Home-Screen"] = "1";
  sessionCheck = fetch("/api/session", { credentials: "same-origin", cache: "no-store", headers }).then(async (r) => {
    if (r.status === 401) return false;
    if (!r.ok) return true;
    const j = await r.json().catch(() => null);
    return j?.signedIn !== false;
  }, () => true);
  setTimeout(() => { sessionCheck = null; }, 30e3);
  return sessionCheck;
}

// ---------------------------------------------------------------- search: Today's and Settings' (One roof §3.10)
// What the framework's search finds on this page, on this device only: the day's tops, Coming Up and the cards by their
// titles, the people waiting for you by name (→ their chat); and You's rows. The query is never kept, sent or written
const SETTINGS = [
  ["Notifications", "notify", "Each app’s, and Today’s morning"], ["Weather Notifications", "notify-weather", "Rain and warnings for the places you choose"],
  ["Quiet Hours", "quiet", "Every app, but warnings"], ["Rules", "rules", "What Today does for you"], ["This Phone", "phone", "Notifications here"],
  ["Connected Apps", "apps", "What each app shares with InFlite"], ["Account", "account", "Password, Passkeys and Devices"], ["Sign Out", "signout", "Of InFlite, on this device"],
  // (Mail's, for the site's admin alone: s4/spec §2.4)
  ["Mail Notifications", "notify-mail", "Through InFlite, and which addresses notify you", (view) => view?.apps?.mail === true],
];
const found = (q, ...xs) => xs.some((x) => typeof x === "string" && x.toLowerCase().includes(q));
// (an address from the answer, as this page goes there: the hub's path, or the app's own where it's degraded. Worked
// out here, not by IFL.hub.go, which leaves the breadcrumb: nothing's written as you type)
const SUBS = { chat: "/chats", weather: "/weather", fitness: "/fitness", finance: "/markets", email: "/mail" };
const OWN = { chats: "chat", weather: "weather", fitness: "fitness", markets: "finance", mail: "email" };
function pathOf(h) {
  if (typeof h !== "string" || !h) return null;
  let u;
  try { u = new URL(h, location.origin); } catch { return null; }
  let p;
  if (u.origin === location.origin) p = u.pathname + u.search + u.hash;
  else if (u.protocol === "https:" && SUBS[/^([a-z]+)\./.exec(u.host)?.[1]]) p = SUBS[/^([a-z]+)\./.exec(u.host)[1]] + u.pathname + u.search + u.hash;
  else return null;
  if (S.hub) return p;
  const m = /^\/(chats|weather|fitness|markets|mail)(?=$|[/?#])\/?([\s\S]*)$/.exec(p);
  return m ? `${safe(ownLinks()[OWN[m[1]]]) || DEFAULT_LINKS[OWN[m[1]]]}/${m[2]}` : p;
}
function todayHits(q) {
  const a = S.answer, out = [];
  if (!q || !a || !S.view) return out;
  const list = (x) => (Array.isArray(x) ? x : []);
  if (a.v === 2 && !S.kept) {
    for (const p of list(a.waiting)) if (p && typeof p.first === "string" && /^[\w-]{8,64}$/.test(String(p.id)) && found(q, p.first))
      out.push({ title: p.first, sub: "Waiting for you", avatar: p.first, href: pathOf(`/chats/#open=${encodeURIComponent(p.id)}`) });
    const tops = a.tops && typeof a.tops === "object" ? Object.values(a.tops) : [];
    for (const t of tops) if (t && found(q, t.title, t.chip)) out.push({ title: String(t.title || t.chip), sub: t.chip ? String(t.chip) : "Today", icon: APP[t.kind] ? t.kind : undefined, href: pathOf(list(t.buttons).find((b) => b?.href)?.href) || "/" });
    for (const u of list(a.upcoming)) if (u && found(q, u.title, u.sub)) out.push({ title: String(u.title), sub: u.sub ? String(u.sub) : "Coming up", icon: APP[u.app] ? u.app : undefined, href: pathOf(u.href) || "/" });
  }
  const cards = a.cards || {};
  for (const k of CARD_KEYS) if (cards[k] && !S.prefs.hidden.includes(k) && found(q, APP[k].name, k === "weather" ? cards[k].place?.name : null))
    out.push({ title: APP[k].name, sub: "On Today", icon: k, href: pathOf(k === "weather" ? cards[k].href : `/${k === "chat" ? "chats" : k}/`) || "/" });
  return out.slice(0, 12);
}
function settingsHits(q) {
  if (!q || !S.view) return [];
  return SETTINGS.filter(([t, , sub, only]) => (!only || only(S.view)) && found(q, t, sub)).map(([title, id, sub]) => ({ title, sub, href: `/#you=${id}` }));
}
// (an entry for the screen already showing: the search closed, no navigation, so Back never meets a twin)
const notHere = (list) => list.map((e) => (e.href && here(e.href) ? { title: e.title, sub: e.sub, icon: e.icon, avatar: e.avatar, run: () => {} } : e));
function provide() {
  F.search.provide({ id: "today", group: "Today", order: 20, search: (q) => notHere(todayHits(String(q || "").trim().toLowerCase())) });
  F.search.provide({ id: "settings", group: "Settings", order: 40, search: (q) => notHere(settingsHits(String(q || "").trim().toLowerCase())) });
}

// ---------------------------------------------------------------- the header, and InFlite's menu
const ID_OK = (id) => typeof id === "string" && /^[\w-]{8,64}$/.test(id);
function photoHtml(u) {
  const initial = esc([...String(u.first || u.name || u.handle || "?")][0] || "?");
  return u.photoAt && ID_OK(u.id) ? `${initial}<img class="av-img" src="/api/avatar?id=${encodeURIComponent(u.id)}&amp;v=${encodeURIComponent(String(u.photoAt))}" alt="">` : initial;
}
// (your photo, as a node: for the frame's header, and InFlite's menu)
function photoNode(u) {
  const s = document.createElement("span");
  s.className = "me-ph";
  s.innerHTML = photoHtml(u);
  return s;
}
// Today's header line and date, as the day goes (the frame's header, patched, only while Today's showing)
let lineSaid = null;
function drawLine(force = false) {
  if (!F || !on("today")) return;
  const crumb = crumbOf(), line = lineOf(), said = `${crumb}\n${line}`;
  if (!force && said === lineSaid) return;
  lineSaid = said;
  F.header.set({ back: null, crumb: { text: crumb }, title: "Today", line, pick: null, acts: SCREENS.today.acts, sections: null });
}
function openMenu(anchor) {
  if (!S.view) return;
  const u = S.view.user, m = S.morning || {};
  IFL.menu(anchor, {
    app: "today",
    build: BUILD,
    me: { name: u.name || u.handle || "Your account", line: u.handle ? `@${u.handle}` : "", photo: photoNode(u) },
    rows: [
      { icon: "bell", color: "red", label: "Notifications", key: "notify", open: () => go("/#you") },
      { icon: "sun", color: "orange", label: matchMedia("(max-width: 360px)").matches ? "Morning" : "Morning Notification", key: "morning", value: m.on ? clock(m.at) : "Off", open: toMorning },
      { icon: "link", color: "blue", label: "Connected Apps", key: "apps", open: () => go("/#you=apps") },
      "-",
      { icon: "sliders", color: "grey", label: "Edit Today", key: "edit", open: () => { go("/"); openEdit(); } },
    ],
    account: () => openAccount(),
    signOut,
  });
}
// (a screen of the framework's, from anywhere in the page: none where it's the one showing, so Back never meets a twin;
// You at another of its own places, in its own entry)
const here = (path) => { const r = parse(path, { roof: S.hub ? S.apps : false }); return !!r && !!F?.route && format(r) === format(F.route); };
function go(path) {
  if (!F || here(path)) return;
  F.nav.go(path, { replace: on("you") && parse(path)?.tab === "you" });
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
  for (const a of $$("[data-account]")) a.href = accountHref(a.dataset.account);
}

// ---------------------------------------------------------------- the day
// (now, for anything worked out from the answer: never before the answer's own moment, where this device's clock is
// behind the account's, so a pigeon that's landed is never said to land, nor one landed this morning tomorrow)
const nowish = () => Math.max(Date.now() + S.skew, Number.isFinite(S.answer?.at) ? S.answer.at : 0);
const ctx = () => ({ links: S.links || DEFAULT_LINKS, tz: S.answer?.tz || browserTz(), now: nowish(), hub: IFL.hub });
// (the cards this account can have: Mail's only for the site's admin, view.apps.mail, s4/spec §2.5, S4-D21)
const cardKeys = (view = S.view) => CARD_KEYS.filter((k) => k !== "mail" || view?.apps?.mail === true);
function cleanPrefs(p, view = S.view) {
  const keys = cardKeys(view);
  const order = (Array.isArray(p?.order) ? p.order : []).filter((k) => keys.includes(k));
  for (const k of keys) if (!order.includes(k)) order.push(k);
  const hidden = (Array.isArray(p?.hidden) ? p.hidden : []).filter((k) => keys.includes(k));
  return { order: [...new Set(order)], hidden: [...new Set(hidden)] };
}
// Today's day: a version 2 answer (Today First's, phase by phase) drawn by /day.js into #today (its top card, Waiting for
// You, Coming Up, and The Rest of Today: the four cards); an answer without v (an account side from before it, or this
// browser's copy) as the four cards, in #rest, as Today always drew them. day.js not loading, or failing, the four cards
// all the same.
function drawCards(anim) {
  if (!S.view) return;
  if (S.answer?.v === 2 && !S.kept) return drawDayNow(anim);
  drawFour(anim);
}
// (#today taken back from day.js: nothing more timed or drawn there from it)
function letDayGo() {
  try { day?.stopDay?.($("#today")); } catch {}
  delete $("#today").dataset.phase;
}
function drawFour(anim) {
  const box = $("#rest");
  letDayGo();
  for (const id of ["#top", "#waiting", "#coming"]) $(id).replaceChildren();
  box.className = "cards";
  box.hidden = false;
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
// Today First's day, drawn by /day.js once it's loaded: only if it's still the answer by then. ctx: now() (the answer's
// clock), hub (the page's own IFL.hub: the hub's paths and Chat's engine, or the apps' own addresses where it's degraded),
// prefs (Edit's order and hidden cards, for The Rest of Today), links, tz, call(path, o) (the page's own requests, so a
// 401 from Undo, Take or Keep signs the page out at once), toast(text), refresh() (the day asked again: after Undo, Take
// or Keep), line(text) (the header's line for the phase; null: the date), drawFour() (the four cards, as an answer
// without v draws them), timers: false (nothing timed in day.js: the page's own minute, below, ticks it, and only while
// it's signed in with this answer, so a day forgotten here stays forgotten)
let day = null;
const dayCtx = () => ({ now: nowish, hub: IFL.hub, prefs: S.prefs, links: S.links || DEFAULT_LINKS, tz: S.answer?.tz || browserTz(), call, toast, refresh: () => refresh(),
  line: (text) => { if (S.view) { S.dayLine = text == null ? null : String(text).slice(0, 120); drawLine(); } }, drawFour: () => drawFour(), timers: false });
function drawDayNow() {
  const answer = S.answer;
  $("#rest").className = "";
  import("/day.js").then((m) => {
    day = m;
    if (S.answer !== answer || !S.view) return;
    try { m.drawDay($("#today"), answer, dayCtx()); } catch (e) { console.error(e); drawFour(); }
    drawKept();
  }, () => { if (S.answer === answer) drawFour(); });
}
function drawKept() {
  const k = $("#kept"), old = S.kept && Date.now() - S.answerAt > 10 * MIN;
  k.hidden = !old;
  if (old) k.textContent = `Updated ${hm(S.answerAt, S.answer?.tz || browserTz())}`;
}
// each minute, on the minute (the answer's clock), or at the answer's next moment if that's sooner (its until, a step of
// its timeline, a Coming Up row's time, an Undo's end), with no request: the day's next phase at its minute (from the
// answer's tops), passed rows gone, the pigeons' times, the date, the kept copy's word; then, past a phase's end, the day
// asked again a little later, in the background
let minuteT = 0;
function nextMinute() {
  clearTimeout(minuteT);
  const now = nowish(), a = S.answer?.v === 2 && !S.kept ? S.answer : null;
  const list = (x) => (Array.isArray(x) ? x : []);
  const due = a ? [a.until, ...list(a.timeline).map((x) => x?.at), ...list(a.upcoming).map((x) => x?.at), ...list(a.acts).map((x) => x?.undoUntil)].filter((x) => Number.isFinite(x) && x > now) : [];
  const next = Math.min((Math.floor(now / MIN) + 1) * MIN, ...due);
  minuteT = setTimeout(() => { minute(); nextMinute(); }, Math.max(250, next - now + 20));
}
function minute() {
  if (!S.view) return;
  const now = nowish(), a = S.answer;
  if (a?.v === 2 && !S.kept && day) { try { day.tickDay($("#today"), a, now); } catch (e) { console.error(e); } }
  else tick($("#rest"), now);
  drawLine();
  drawKept();
  if (a?.v === 2 && Number.isFinite(a.until) && now >= a.until && S.boundary !== a.until) {
    S.boundary = a.until;
    setTimeout(() => { if (S.answer === a) refresh(); }, 90e3);
  }
  // (every five minutes while it's in sight, every two while a ride's near or on)
  const every = a?.v === 2 && (a.phase === "preride" || a.phase === "riding") ? 2 * MIN : 5 * MIN;
  if (document.visibilityState === "visible" && Date.now() - S.loadedAt >= every) refresh();
}
// the same answer again (with the morning, worked out from the same cards), or one card's alone (Try Again)
async function refresh(only = null) {
  if (!S.view) return;
  const q = new URLSearchParams();
  if (only) q.set("only", only);
  else { q.set("v", "2"); q.set("with", "morning"); }
  if (S.device) q.set("device", S.device);
  if (!only) S.loadedAt = Date.now();
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
// (back to the page: the day afresh, and Chat's engine caught up; at most once in a few seconds)
let backAt = 0;
function back() {
  if (!S.view || Date.now() - backAt < 3000) return;
  backAt = Date.now();
  refresh();
  if (S.hub) IFL.hub.chat().then((c) => c?.refresh?.()).catch(() => {});
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
      if (!same) { drawCards(); if (sheetId === "sh-edit") drawEdit(); }
    }
  } catch (e) {
    if (e.status !== 401) toast(e.message);
  }
}

// ---------------------------------------------------------------- sheets from the foot, and a word after doing something
// The page's own sheets (index.html: Morning, Every App's, Edit Today, Weather Notifications) are InFlite's sheet, opened
// by the frame (F.sheet.openEl: a modal <dialog>, Escape and the close button, no history), one at a time; the toast
// is the framework's (signed out, before the frame's made, its own)
const handles = new Map(); // id → its handle, open or still shutting
function openSheet(id, { onClose } = {}) {
  const s = document.getElementById(id);
  if (!s || !F) return null;
  // (already open: kept as it is; still shutting (closed under 340 ms ago): shut at once, and opened afresh once the
  // dialog's own close event has gone by (it comes a task later, and would shut the new one), rather than end shut with
  // the closing one)
  if (sheetOpen && sheetId === id && !s.classList.contains("closing")) return sheetOpen;
  if (sheetOpen) closeSheet();
  const old = handles.get(id);
  if (old) {
    const wasOpen = s.open;
    old.now(); handles.delete(id);
    const again = () => { if (F && !handles.has(id) && !s.open) openSheet(id, { onClose }); };
    if (wasOpen) s.addEventListener("close", () => setTimeout(again), { once: true });
    else again();
    return null;
  }
  const h = F.sheet.openEl(s, {
    onClose: () => {
      if (handles.get(id) === h) handles.delete(id);
      if (sheetOpen === h) { sheetOpen = null; sheetId = null; }
      if (id === "morning" && on("you")) drawYouNow();
      onClose?.();
    },
  });
  handles.set(id, h);
  sheetOpen = h; sheetId = id;
  return h;
}
function closeSheet() {
  const h = sheetOpen;
  sheetOpen = null; sheetId = null;
  try { h?.close(); } catch {}
}
function toast(text, o) { return F ? F.toast(text, o) : roofToast(text, o); }

// ---------------------------------------------------------------- the morning: one notification
const NAMES = { weather: "Weather", fitness: "Fitness", chat: "Chat", markets: "Markets" };
const LINES = [
  ["weather", (m) => (m.place ? `The title: the day in ${m.place}` : "The title: the day where you are")],
  ["fitness", () => "Today’s session and the best time"],
  ["chat", () => (S.answer?.cards?.chat?.pigeons === false ? "Letters on their way to you" : "Pigeons on their way to you")],
  ["markets", () => "How your portfolio’s doing"],
];
// (why this device can't have it, in Fitness's words: fitness/app.js pushWhy)
const canPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function pushWhy() {
  if (canPush()) return Notification.permission === "denied" ? "Notifications are blocked for InFlite in this browser’s settings." : null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return ios && !standalone() ? "Add InFlite to your Home Screen first (Share, then Add to Home Screen), and turn this on there." : "This browser can’t show notifications.";
}
function drawMorning() {
  const m = S.morning;
  if (!m || !S.view) return;
  const full = m.lines && typeof m.lines === "object";
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

// ---------------------------------------------------------------- push on this device: the one subscription (§11.3)
// The root worker's (/sw.js, scope /) is this phone's one subscription for InFlite. Turned on (You → This Phone, the
// morning's switch): Today's morning only (POST /api/device {sub, tz}: td_push). Every app's notifications come here only
// from a tap on Get Every App's Notifications Here (fanOut: POST /api/device {sub, fan: true}); never on its own, never
// on first run. An account side from before (404 or 501): POST /api/push, the morning only, as Today always did.
const toBytes = (b64) => { const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
const hashOf = async (endpoint) => b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint))).slice(0, 16);
async function swReg() {
  if (!("serviceWorker" in navigator)) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise((ok) => setTimeout(() => ok(null), 8000))]);
}
async function currentSub() {
  if (!canPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/").catch(() => null);
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
// (this device's subscription to the account: the device route, else Today's own as before: a renewed one (was) moved in
// Today's own table, as the root worker does, else added)
async function postDevice(sub, extra = {}) {
  try {
    return await call("/api/device", { method: "POST", body: { sub: sub.toJSON(), tz: browserTz(), ...extra } });
  } catch (e) {
    if (!missing(e) || extra.fan) throw e;
    if (extra.was) {
      const moved = await call("/api/push/move", { method: "POST", body: { sub: sub.toJSON(), was: extra.was } }).catch(() => null);
      if (moved?.moved) return moved;
    }
    return call("/api/push", { method: "POST", body: { sub: sub.toJSON() } });
  }
}
// the subscription itself, from a tap (a phone asks only from a tap): the browser asked first, then the account's key
async function subscribe() {
  if (!canPush()) { toast(pushWhy()); return null; }
  const asked = Notification.permission === "granted" ? "granted" : await Notification.requestPermission().catch(() => "denied");
  if (asked !== "granted") { toast("Notifications are blocked for InFlite in this browser’s settings."); drawMorning(); return null; }
  const reg = await swReg();
  if (!reg) throw new Error("Couldn’t turn it on just now. Try again in a moment.");
  const { key } = await call("/api/push/key");
  return (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) }));
}
async function kept(sub) {
  S.endpoint = sub.endpoint;
  S.device = await hashOf(sub.endpoint);
  try { localStorage.setItem("today:push", sub.endpoint); } catch {}
}
// Turned on, from a tap: this device's subscription handed to the account, and the morning on. → true once it's on here
async function turnOn() {
  try {
    const sub = await subscribe();
    if (!sub) return false;
    await postDevice(sub);
    await kept(sub);
    return await putMorning({ on: true });
  } catch (e) {
    if (e.status !== 401) toast(e.message || "Couldn’t turn it on just now. Try again in a moment.");
    drawMorning();
    return false;
  }
}
// This Phone, off: its subscription taken out of every table (and Today's own, on an older account side); kept, so
// turning it on again is one tap. What's known here of it says so at once (the morning's thisDevice, this browser's
// today:push), as the account now does, so You's switch stays off
async function turnOff() {
  const sub = await currentSub();
  if (!sub) return true;
  try {
    await call("/api/device", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch((e) => { if (missing(e)) return call("/api/push", { method: "DELETE", body: { endpoint: sub.endpoint } }); throw e; });
    try { localStorage.removeItem("today:push"); } catch {}
    if (S.morning && typeof S.morning === "object") S.morning = { ...S.morning, thisDevice: false };
    drawMorning();
    return true;
  } catch (e) {
    if (e.status !== 401) toast(e.message);
    return false;
  }
}
// Get Every App's Notifications Here: only ever from its own tap (You). → the account's answer ({ ok, tables })
async function fanOut() {
  const sub = await subscribe();
  if (!sub) return null;
  const r = await postDevice(sub, { fan: true });
  await kept(sub);
  return r;
}
// (the browser changed this device's subscription while Today was shut, and its worker couldn't say so: said now)
async function deviceMoved() {
  let was = null;
  try { was = localStorage.getItem("today:push"); } catch {}
  const sub = was ? await currentSub() : null;
  if (!sub || sub.endpoint === was) return;
  try { await postDevice(sub, { was }); await kept(sub); } catch {}
}
// (the morning's settings: a sheet, opened from the menu or You)
function toMorning() {
  if (!S.view || $("#in").hidden) return;
  IFL.close(true);
  drawMorning();
  // (open already: only drawn again; any other sheet's shut by openSheet)
  if (sheetId === "morning" && !$("#morning").classList.contains("closing")) return;
  openSheet("morning");
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
  // (Sign in: Chats' trip, which signs in everything, where the hub serves Chats; else, and Sign In Without Chats, Today's own)
  $("#signin").addEventListener("click", (e) => { e.preventDefault(); if (S.hub) location.assign(`/chats/#signin-start&then=${thenHere()}`); else goToAccount(false); });
  $("#signinToday").addEventListener("click", (e) => { e.preventDefault(); goToAccount(false); });
  $("#join").addEventListener("click", (e) => { e.preventDefault(); goToAccount(true); });
  for (const b of $$(".ifs-btn:empty")) b.innerHTML = G.x;
  for (const c of $$(".row .chev:empty")) c.innerHTML = G.chev;
  $("#atChev").innerHTML = G.down;
  // (Try Again on a card that couldn't load: that card alone, asked again)
  $("#today").addEventListener("click", (e) => {
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
    S.prefs = { order: cardKeys(), hidden: [] };
    drawEdit();
    prefsChanged();
    toast("Back in the day’s order");
  });
  // (a sign-in's code, come in the address without the page opening afresh: opened afresh, to finish it; #morning or
  // #notify, as they say. A screen's address is the frame's: its popstate draws it)
  addEventListener("hashchange", () => {
    if (new URLSearchParams(location.hash.slice(1)).get("signin")) return location.reload();
    fromHash();
  });
}
// (opened at a place: #morning, the morning's settings; #notify, from Account's "Turn On in Today": asked in one tap)
function fromHash() {
  if (!S.view) return;
  if (IFL.wantsAllow()) {
    IFL.allow("today", "Today tells you your day each morning, from all your apps, in one notification. What’s in it is set in You, under This Phone.", turnOn);
    return;
  }
  if (location.hash === "#morning") {
    // (the address put back as the screen's own, its history entry kept as the frame wrote it)
    try { history.replaceState(history.state, "", location.pathname + location.search); } catch {}
    F?.restamp();
    setTimeout(toMorning, 100);
  }
}

// ---------------------------------------------------------------- the root service worker: notifications, and offline
// (its words to the page: a Chat push came, so Chat's engine catches up and the day's asked again; a notification tapped
// is IFL.hub's, { ifl: "open", url }; an older worker's { open } and { ifl: "signedout" } still understood)
let syncT = 0;
function worker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.ifl === "signedout") return signedOutNow();
    if (d.inflight === "sync") {
      if (S.hub) IFL.hub.chat().then((c) => c?.refresh?.()).catch(() => {});
      clearTimeout(syncT);
      syncT = setTimeout(() => refresh(), 1500);
      return;
    }
    if (typeof d.open === "string") {
      let u;
      try { u = new URL(d.open, location.origin); } catch { return; }
      if (u.origin !== location.origin) return;
      if (u.hash === "#morning" && u.pathname === "/") { if (F?.route?.kind === "app") F.nav.go("/"); toMorning(); return; }
      // (the framework's own screens in the page, as any route; anywhere else, gone there)
      if (F) { F.nav.go(u.pathname + u.search + u.hash, { from: "notification" }); refresh(); }
      else location.assign(u.href);
    }
  });
}

// ---------------------------------------------------------------- opening
const hubAsked = hubReady();
// (a notification tapped while the hub couldn't serve its app (before its key, or rolled back): the root worker opens
// Today with #go=<the app's path here>, and it's gone there from here, the hub's way where it's ready, else the app's own
// address, as Today 1.08 would. Only a path of this site's)
function goFromHash() {
  const p = new URLSearchParams(location.hash.slice(1)).get("go");
  if (p == null) return false;
  try { history.replaceState(history.state, "", location.pathname + location.search); } catch {}
  F?.restamp();
  if (!/^\/(?![/\\])[^\\\s\u0000-\u001f\u007f]{0,300}$/.test(p)) return false;
  hubAsked.then((state) => {
    const ready = state === "yes";
    if (!ready) IFL.hub.degrade(ownLinks());
    location.replace(ready ? p : IFL.hub.go(p));
  });
  return true;
}
// (the hub's answer, once it's in: false where a /weather/ document is on its way elsewhere for it, bootGone)
async function hubKnown() {
  const state = await hubAsked;
  if (bootGone(state)) return false;
  hubSays(state);
  if (BOOT_APP && S.apps[BOOT_APP.app]) preload(BOOT_APP.app);
  return true;
}
async function load() {
  const devP = findDevice();
  S.asked5 = false;
  let view = null;
  // (a /weather/ boot: Weather's files asked for at once, beside the session, unless the hub's known not to serve them)
  if (BOOT_APP && ss.get(HUB_KEY) !== "0" && keptApp(BOOT_APP.app) !== false) preload(BOOT_APP.app);
  // (a code at Mail's /mail/ is Mail's own hand-back, S4-D12: left in the address for Mail's module to swap at Mail's
  // /api/auth/handback with the word it kept; Today's own always comes back to /)
  if (new URLSearchParams(location.hash.slice(1)).get("signin") && BOOT_APP?.app !== "mail") {
    try {
      view = await finishSignIn();
    } catch (e) {
      sessionAsked = null;
      if (!(await hubKnown())) return;
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
      const q = new URLSearchParams({ v: "2", with: "morning" });
      if (device) q.set("device", device);
      S.loadedAt = Date.now();
      return call(`/api/today?${q}`).then(gotCards, () => {});
    });
  };
  if (view || readJSON(KEPT)) askCards();
  try {
    view = await sessionAsked;
  } catch (e) {
    if (!(await hubKnown())) return;
    if (e.status === 401) return signedOutNow(true);
    // (no answer at all (no network, not an error from the account), in a Home Screen Today, whose sign-in is its own and
    // so can't be ended by another app without Today knowing: the copy kept here, if the last answer said it was this
    // account, under 12 hours ago. In a browser tab, another InFlite app may have signed out meanwhile: no one's day, then)
    const ks = e.status === 0 && standalone() ? readJSON(KEPT) : null;
    if (ks?.view?.user?.id && ks.id === ks.view.user.id && Date.now() - ks.at < 12 * 3600e3 && keptFor(ks.id)) {
      signedIn(ks.view, { offline: true });
      return;
    }
    showOut(e.message);
    return;
  }
  if (view?.links) S.links = view.links;
  if (!(await hubKnown())) return;
  if (!view?.signedIn) return signedOutNow(true);
  signedIn(view);
  wireLinks();
  if (!asked) askCards();
  fromHash();
  devP.then(deviceMoved);
  const at = IFL.here("today");
  if (at?.y) requestAnimationFrame(() => scrollTo(0, at.y));
}

// (where the page was: what the updater's reload, and the frame's reload for a new Weather (D21), bring back)
const save = () => ({ y: Math.round(scrollY) });
const ROOF_FILES = ["frame", "router", "header", "tabs", "sheet", "toast", "ui", "search", "send", "modules", "connectors"].map((f) => `/roof/${f}.js`);
function start() {
  if (goFromHash()) return;
  wire();
  worker();
  IFL.built("today", BUILD, NEWS);
  IFL.updates({ app: "today", build: BUILD, url: "/version", field: "build", busy: () => !!F?.busy() || !!sheetOpen, save,
    files: ["/", "/app.js", "/cards.js", "/day.js", "/apps.js", "/you.js", "/wxicons.js", "/app.css", "/day.css", "/theme.js", ...ROOF_FILES, "/roof/roof.css"] });
  load();
  nextMinute();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (S.view) { back(); hubAgain(); }
    else if ($("#outSaid").textContent) load();
  });
  // (back from the browser's own cache of the page (bfcache): the day, and whether the hub serves Weather, asked again)
  addEventListener("pageshow", (e) => { if (e.persisted && S.view) { back(); hubAgain(0); } });
  addEventListener("online", () => { if (!S.view || S.kept) load(); });
}
start();
