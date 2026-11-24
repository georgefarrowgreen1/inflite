import { atlasMarkup } from "../public/atlas/roof/template.js";
const esc = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function atlasPage(nonce) {
 return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark light"><title>Atlas · InFlite</title>
<script nonce="${esc(nonce)}">globalThis.__iflSessionStarted=true;</script><script src="/theme.js"></script><script nonce="${esc(nonce)}">document.documentElement.classList.remove("boot");</script><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/atlas/assets/style.css"><script type="module" src="/roof/wallpaper.js"></script><script type="module" src="/atlas/assets/app.js"></script></head>
<body class="atlas-app session-check">${atlasMarkup()}</body></html>`;
}
