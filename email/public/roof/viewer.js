// Mail's pictures viewer under the roof (One roof stage 4, s4/spec S4-D17, §2.2; app.js openViewer 5287–5680, pictures
// only). Lazy, kept offline (connector.lazy, s24-contracts §8). One framework sheet, data-sheet=mail-viewer: the
// conversation's pictures, swiped through, pinched or double-tapped to zoom, Share with navigator.share({ files })
// where the browser offers it.
// Frozen: openViewer(ctx, files, i) → sheet Handle | null. files: [{ id, filename, type, size, url? }] (url: a blob: the
//   reader already made for its gallery, left to the reader to revoke); only S4-D17's raster types are shown, the rest
//   dropped. A picture is fetched by ctx.api.picture(id) (CORS, raster only on Mail's server too), re-typed as its own
//   listed type and shown only in <img src>; every blob: URL made here is revoked when the sheet closes.
// PICTURES: the types (roofmailviews.test pins it to S4-D17's list).
export const PICTURES = /^image\/(png|jpeg|gif|webp|avif|heic|bmp)$/i;
export const isPicture = (a) => !!a && /^[\w-]{1,64}$/.test(String(a.id || "")) && PICTURES.test(String(a.type || ""));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtSize = (n) => (!n ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export function openViewer(ctx, files, i = 0) {
  const { fw, api } = ctx, ui = fw.ui;
  const items = (files || []).filter(isPicture);
  if (!items.length) return null;
  let at = clamp(items.findIndex((x) => x.id === files?.[i]?.id), 0, items.length - 1);
  const made = [], blobs = new Map(), zoom = items.map(() => ({ s: 1, x: 0, y: 0 }));
  let gone = false;
  const count = ui.el("span", { class: "mv-count", "aria-live": "polite" });
  const track = ui.el("div", { class: "mv-track" });
  const slides = items.map((x) => ui.el("div", { class: "mv-slide", data: { id: x.id } }));
  track.append(...slides);
  const prev = items.length > 1 ? ui.iconBtn("back", { label: "Previous Picture", run: () => go(at - 1) }) : null;
  const next = items.length > 1 ? ui.iconBtn("chev", { label: "Next Picture", run: () => go(at + 1) }) : null;
  const stage = ui.el("div", { class: "mv-stage" }, track, prev ? ui.el("span", { class: "mv-prev" }, prev) : null, next ? ui.el("span", { class: "mv-next" }, next) : null);
  const canShare = typeof navigator !== "undefined" && !!navigator.share && !!navigator.canShare;

  // (each picture once: its bytes re-typed as its listed type, never another, and a blob: of them)
  function get(x) {
    if (blobs.has(x.id)) return blobs.get(x.id);
    const p = (async () => {
      const type = String(x.type).toLowerCase();
      if (!PICTURES.test(type)) throw new Error("not a picture");
      const blob = new Blob([await (await api.picture(x.id)).arrayBuffer()], { type });
      if (gone) throw new Error("closed");
      const url = URL.createObjectURL(blob);
      made.push(url);
      return { url, blob };
    })();
    blobs.set(x.id, p);
    p.catch(() => blobs.delete(x.id));
    return p;
  }
  const urlOf = (x) => (x.url && /^blob:/.test(x.url) ? Promise.resolve(x.url) : get(x).then((o) => o.url));
  function fill(k) {
    const s = slides[k], x = items[k];
    if (!s || s.firstChild) return;
    s.append(ui.el("div", { class: "mv-wait", "aria-hidden": "true" }));
    Promise.resolve(urlOf(x)).then((u) => {
      if (gone) return;
      const img = ui.el("img", { class: "mv-img", alt: x.filename || "Picture", draggable: "false", decoding: "async" });
      img.src = u;
      s.replaceChildren(img);
    }, () => { if (!gone) s.replaceChildren(ui.empty({ title: "Couldn’t show this picture", body: navigator.onLine === false ? "It needs a connection." : "Try again in a moment." })); });
  }
  function apply(k) {
    const z = zoom[k], s = slides[k];
    if (!s) return;
    s.style.setProperty("--zs", String(z.s)); s.style.setProperty("--zx", `${z.x}px`); s.style.setProperty("--zy", `${z.y}px`);
    s.classList.toggle("zoomed", z.s > 1.01);
  }
  function place(dx = 0, still = false) {
    track.style.setProperty("--i", String(at));
    track.style.setProperty("--dx", `${dx}px`);
    track.classList.toggle("still", still);
  }
  function go(k) {
    k = clamp(k, 0, items.length - 1);
    if (k !== at) { zoom[at] = { s: 1, x: 0, y: 0 }; apply(at); }
    at = k;
    [k - 1, k, k + 1].forEach(fill);
    place();
    const x = items[k];
    h.el.querySelector(".ifs-head h2").textContent = x.filename || "Picture";
    count.textContent = items.length > 1 ? `${k + 1} of ${items.length}` : fmtSize(x.size);
    slides.forEach((s, j) => s.setAttribute("aria-hidden", String(j !== k)));
    if (prev) prev.disabled = k === 0;
    if (next) next.disabled = k === items.length - 1;
  }
  async function share() {
    const x = items[at];
    try {
      const { url, blob } = await get(x);
      const file = new File([blob], x.filename || "picture", { type: blob.type });
      if (canShare && navigator.canShare({ files: [file] })) return await navigator.share({ files: [file] });
      const a = ui.el("a", { href: url, download: x.filename || "picture" });
      document.body.append(a); a.click(); a.remove();
    } catch (e) {
      if (e?.name !== "AbortError") fw.toast("Couldn’t share that picture.");
    }
  }

  // ---- gestures: swipe across for the next, pinch or double-tap to zoom, drag a zoomed picture about
  const pts = new Map();
  let g = null, lastTap = 0;
  const W = () => stage.clientWidth || 1;
  function bound(k) {
    const z = zoom[k], mx = (W() * (z.s - 1)) / 2, my = ((stage.clientHeight || 1) * (z.s - 1)) / 2;
    z.x = clamp(z.x, -mx, mx); z.y = clamp(z.y, -my, my);
  }
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest?.("button")) return;
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const z = zoom[at];
    if (pts.size === 2) { const [p, q] = [...pts.values()]; g = { pinch: true, d: Math.hypot(p.x - q.x, p.y - q.y) || 1, s: z.s }; return; }
    g = { x0: e.clientX, y0: e.clientY, zx: z.x, zy: z.y, t0: Date.now(), moved: false };
  });
  stage.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId) || !g) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const z = zoom[at];
    if (g.pinch) {
      if (pts.size < 2) return;
      const [p, q] = [...pts.values()];
      z.s = clamp((g.s * Math.hypot(p.x - q.x, p.y - q.y)) / g.d, 1, 5);
      bound(at); apply(at);
      return;
    }
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (Math.abs(dx) + Math.abs(dy) > 8) g.moved = true;
    if (z.s > 1.01) { z.x = g.zx + dx; z.y = g.zy + dy; bound(at); apply(at); }
    else place(dx, true);
  });
  const end = (e) => {
    pts.delete(e.pointerId);
    if (!g || pts.size) return;
    const z = zoom[at], dx = e.clientX - g.x0;
    if (!g.pinch && z.s <= 1.01 && g.moved) {
      if (dx < -W() / 5 && at < items.length - 1) return (g = null), go(at + 1);
      if (dx > W() / 5 && at > 0) return (g = null), go(at - 1);
      place();
    } else if (!g.pinch && !g.moved) {
      // (a double tap: in to 2×, or back out)
      if (Date.now() - lastTap < 300) { zoom[at] = z.s > 1.01 ? { s: 1, x: 0, y: 0 } : { s: 2, x: 0, y: 0 }; apply(at); lastTap = 0; }
      else lastTap = Date.now();
    }
    if (z.s < 1.01) { zoom[at] = { s: 1, x: 0, y: 0 }; apply(at); }
    g = null;
  };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);
  stage.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); go(at - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(at + 1); }
  });
  stage.tabIndex = 0;
  stage.setAttribute("aria-label", "Pictures: swipe or use the arrow keys");

  const acts = [{ label: canShare ? "Share" : "Save", act: "share", run: share }];
  const h = fw.sheet.open({
    sheet: "mail-viewer", title: items[at].filename || "Picture", acts,
    body: ui.el("div", { class: "mv" }, stage, count),
    onClose: () => { gone = true; for (const u of made.splice(0)) URL.revokeObjectURL(u); },
  });
  go(at);
  return h;
}
