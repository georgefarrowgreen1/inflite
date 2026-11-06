// Mail's viewer, loaded the first time it's needed (app.js: part("viewer")): a conversation's pictures, PDFs and videos,
// full screen, swiped through, pinched to zoom. Given what it uses of Mail's own (M: app.js partsContext); what it gives
// back is what app.js calls.
export default (M) => {
  const { icon, h, fmtSize, S, toast, kindOf, downloadUrl, dataBlob } = M;

  // (everything in the conversation that opens here, oldest first, as it reads)
  function conversationMedia() {
    const out = [];
    for (const m of [...(S.thread?.messages || [])].reverse()) for (const a of S.bodies.get(m.id)?.attachments || []) if (kindOf(a)) out.push(a);
    return out;
  }

  function openViewer(a, from) {
    if (M.viewer) return;
    let items = conversationMedia();
    if (!items.some((x) => x.id === a.id)) items = [a];
    let index = items.findIndex((x) => x.id === a.id);
    const appEl = document.getElementById("app");
    const opener = from || document.activeElement;

    const titleEl = h("div.v-name");
    const countEl = h("div.v-count");
    const track = h("div.v-track");
    const slides = items.map((x) => h("div.v-slide", { class: `k-${kindOf(x)}`, "data-id": x.id }));
    track.append(...slides);
    const thumbs =
      items.length > 1
        ? h(
            "div.v-thumbs",
            { role: "tablist", "aria-label": "Files" },
            items.map((x, i) =>
              h(
                "button.v-thumb",
                { type: "button", role: "tab", "aria-label": x.filename, onclick: () => go(i) },
                kindOf(x) === "image" ? h("img", { src: x.url, alt: "", loading: "lazy" }) : h("span", kindOf(x) === "pdf" ? "PDF" : icon("play"))
              )
            )
          )
        : null;
    const prev = items.length > 1 ? h("button.v-arrow.prev.glass", { type: "button", "aria-label": "Previous", onclick: () => go(index - 1) }, icon("chevronLeft")) : null;
    const next = items.length > 1 ? h("button.v-arrow.next.glass", { type: "button", "aria-label": "Next", onclick: () => go(index + 1) }, icon("chevronRight")) : null;
    const closeBtn = h("button.gbtn.glass.v-close", { type: "button", "aria-label": "Close", onclick: () => close() }, icon("x"));
    const shareBtn = h("button.gbtn.glass", { type: "button", "aria-label": "Share or Save", onclick: () => share(items[index]) }, icon("share"));
    const bg = h("div.v-bg");
    const stage = h("div.v-stage", track, prev, next);
    const el = h(
      "div.viewer",
      { role: "dialog", "aria-modal": "true", "aria-label": "Attachments" },
      bg,
      stage,
      h("div.v-bar", closeBtn, h("div.v-title", titleEl, countEl), shareBtn),
      thumbs
    );
    document.body.append(el);
    if (appEl) appEl.inert = true;

    // The file shown, had as it's shown (from what its slide has just loaded), so Share hands it over within the tap:
    // iOS lets a tap share only for a moment, and a file still coming over mobile data would outlast it. One at a time;
    // a video (not loaded to be shown, only its first moments) only once it's asked for
    let kept = null;
    function ready(x, asked) {
      if (!navigator.canShare || !navigator.share) return null;
      if (kept?.x === x) return kept.p;
      if (!asked && kindOf(x) === "video") return null;
      const k = (kept = { x, file: null });
      // (a data: address, the demo's, made here rather than fetched: the page's own rules don't let fetch read one)
      k.p = (x.url.startsWith("data:") ? Promise.resolve().then(() => dataBlob(x.url)) : fetch(x.url, { credentials: "same-origin" })
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("Couldn’t get that file.")))))
        .then((blob) => (k.file = new File([blob], x.filename || "attachment", { type: x.type || blob.type })));
      k.p.catch(() => kept === k && (kept = null));
      return k.p;
    }

    // each slide's content, made when it's near (so a long gallery doesn't load every file at once)
    const zoom = items.map(() => ({ s: 1, x: 0, y: 0 }));
    function fill(i) {
      const slide = slides[i];
      if (!slide || slide.firstChild) return;
      const x = items[i];
      const kind = kindOf(x);
      if (kind === "image") slide.append(h("img.v-img", { src: x.url, alt: x.filename, draggable: "false", decoding: "async" }));
      else if (kind === "video") slide.append(h("video.v-video", { src: x.url, controls: true, playsinline: true, preload: "metadata" }));
      else
        slide.append(
          h("iframe.v-pdf", { src: x.url, title: x.filename, onload: (e) => (e.currentTarget.dataset.loaded = "1") }),
          h("a.v-open.glass", { href: x.url, target: "_blank", rel: "noopener" }, "Open in Browser", icon("arrowRight"))
        );
    }

    function apply(i, animate) {
      const img = slides[i]?.querySelector(".v-img");
      if (!img) return;
      const z = zoom[i];
      img.style.transition = animate ? "transform 0.35s var(--ease)" : "none";
      img.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
      slides[i].classList.toggle("zoomed", z.s > 1.01);
    }

    function place(animate, dx = 0) {
      track.style.transition = animate ? "transform 0.42s var(--ease)" : "none";
      track.style.transform = `translateX(calc(${-index * 100}% + ${dx}px))`;
    }

    function go(i, { animate = true } = {}) {
      i = Math.max(0, Math.min(items.length - 1, i));
      if (i !== index) {
        // (left as it was: unzoomed, a video paused)
        zoom[index] = { s: 1, x: 0, y: 0 };
        apply(index, false);
        slides[index].querySelector("video")?.pause();
      }
      index = i;
      [i - 1, i, i + 1].forEach(fill);
      place(animate);
      const x = items[i];
      // (once what the slide shows has come, so it's had from there rather than fetched a second time)
      const media = slides[i].querySelector(".v-img, .v-pdf");
      if (media && !(media.complete || media.dataset.loaded)) media.addEventListener("load", () => index === i && ready(x), { once: true });
      else ready(x);
      titleEl.textContent = x.filename;
      countEl.textContent = items.length > 1 ? `${i + 1} of ${items.length}` : fmtSize(x.size);
      slides.forEach((sl, j) => sl.setAttribute("aria-hidden", String(j !== i)));
      thumbs?.querySelectorAll(".v-thumb").forEach((t, j) => {
        t.classList.toggle("on", j === i);
        t.setAttribute("aria-selected", String(j === i));
      });
      thumbs?.children[i]?.scrollIntoView({ inline: "center", block: "nearest", behavior: animate ? "smooth" : "auto" });
      if (prev) prev.disabled = i === 0;
      if (next) next.disabled = i === items.length - 1;
      // (an arrow gone at the end: the focus not lost with it)
      if (document.activeElement?.disabled) (i === 0 ? next : prev)?.focus({ preventScroll: true });
    }

    // Opening: from the picture tapped, growing into place
    go(index, { animate: false });
    el.classList.add("opening");
    const firstImg = slides[index].querySelector(".v-img");
    const fromImg = from?.querySelector?.("img");
    const grow = () => {
      el.classList.remove("opening");
      el.classList.add("open");
      if (!firstImg || !fromImg || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const a = fromImg.getBoundingClientRect();
      const b = contained(firstImg);
      if (!b || !a.width) return;
      firstImg.animate(
        [
          { transform: `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${Math.max(a.width / b.width, a.height / b.height)})`, clipPath: clipFor(a, b) },
          { transform: "none", clipPath: "inset(0 round 0)" },
        ],
        { duration: 420, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }
      );
    };
    if (firstImg && !firstImg.complete) firstImg.decode().then(grow, grow);
    else requestAnimationFrame(grow);
    closeBtn.focus({ preventScroll: true });

    // the picture's box as shown (contained in its slide), for growing from and shrinking back to the thumbnail
    function contained(img) {
      const r = img.getBoundingClientRect();
      if (!img.naturalWidth || !r.width) return null;
      const k = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
      const w = img.naturalWidth * k;
      const hh = img.naturalHeight * k;
      return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - hh) / 2, width: w, height: hh };
    }
    // (cropped to the thumbnail's square while it grows, as Photos does)
    function clipFor(a, b) {
      const s = Math.max(a.width / b.width, a.height / b.height);
      const cw = (b.width * s - a.width) / 2 / s;
      const ch = (b.height * s - a.height) / 2 / s;
      return `inset(${ch}px ${cw}px round ${12 / s}px)`;
    }

    function close() {
      if (!M.viewer) return;
      M.viewer = null;
      document.removeEventListener("keydown", onKey, true);
      slides.forEach((sl) => sl.querySelector("video")?.pause());
      el.classList.remove("open");
      el.classList.add("closing");
      if (appEl) appEl.inert = false;
      // (back into its thumbnail, when the one open is the one tapped and it's still on screen)
      const img = slides[index].querySelector(".v-img");
      const thumb = items[index].id === a.id ? fromImg : null;
      const tr = thumb?.isConnected && thumb.getBoundingClientRect();
      const b = img && contained(img);
      // (shrinking back into its thumbnail, unless motion's turned down: then it simply fades)
      if (tr && tr.width && b && zoom[index].s <= 1.01 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const z = zoom[index];
        img.style.transition = "none";
        img.animate(
          [
            { transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})` },
            { transform: `translate(${tr.left + tr.width / 2 - (b.left + b.width / 2)}px, ${tr.top + tr.height / 2 - (b.top + b.height / 2)}px) scale(${Math.max(tr.width / b.width, tr.height / b.height)})`, clipPath: clipFor(tr, b) },
          ],
          { duration: 360, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "forwards" }
        );
      }
      setTimeout(() => el.remove(), 380);
      if (opener?.isConnected) opener.focus?.({ preventScroll: true });
    }

    async function share(x) {
      try {
        if (navigator.canShare && navigator.share) {
          const file = kept?.x === x && kept.file ? kept.file : await ready(x, true);
          if (navigator.canShare({ files: [file] })) {
            try {
              return await navigator.share({ files: [file] });
            } catch (err) {
              // (it took longer to come than the tap lasts: it's here now, a tap away)
              if (err?.name !== "NotAllowedError") throw err;
              return toast("Ready to Share", { icon: "share", actionLabel: "Share", duration: 8000, action: () => navigator.share({ files: [file] }).catch(() => {}) });
            }
          }
        }
        const link = h("a", { href: downloadUrl(x.url), download: x.filename || "" });
        document.body.append(link);
        link.click();
        link.remove();
      } catch (err) {
        if (err?.name !== "AbortError") toast(err.message || "Couldn't share that file.", { error: true });
      }
    }

    function onKey(e) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "Tab") {
        // (kept within the viewer)
        const f = [...el.querySelectorAll("button:not(:disabled), a[href], video, iframe")].filter((n) => n.offsetParent);
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
      } else {
        // (and nothing behind it answers a key while it's open)
        e.stopPropagation();
        return;
      }
      e.stopPropagation();
      if (e.key !== "Tab") e.preventDefault();
    }
    document.addEventListener("keydown", onKey, true);

    // Gestures: swipe across for the next, down to close; pinch or double-tap a picture to zoom, then drag it about
    const pts = new Map();
    let g = null;
    let lastTap = 0;
    const W = () => stage.clientWidth;
    function clampZoom(i) {
      const img = slides[i].querySelector(".v-img");
      const b = img && contained(img);
      const z = zoom[i];
      if (!b) return;
      const mx = Math.max(0, (b.width * z.s - W()) / 2);
      const my = Math.max(0, (b.height * z.s - stage.clientHeight) / 2);
      z.x = Math.max(-mx, Math.min(mx, z.x));
      z.y = Math.max(-my, Math.min(my, z.y));
    }
    stage.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button, a, video, iframe")) return;
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const z = zoom[index];
      if (pts.size === 2 && kindOf(items[index]) === "image") {
        const [p, q] = [...pts.values()];
        g = { mode: "pinch", d: Math.hypot(p.x - q.x, p.y - q.y), s: z.s, x: z.x, y: z.y, cx: (p.x + q.x) / 2, cy: (p.y + q.y) / 2 };
        place(true);
        return;
      }
      if (pts.size === 1) g = { mode: null, x0: e.clientX, y0: e.clientY, t0: performance.now(), zx: z.x, zy: z.y };
    });
    stage.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId) || !g) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const z = zoom[index];
      if (g.mode === "pinch") {
        if (pts.size < 2) return;
        const [p, q] = [...pts.values()];
        const s = Math.max(1, Math.min(5, (g.s * Math.hypot(p.x - q.x, p.y - q.y)) / g.d));
        // (about the point between the fingers)
        const r = stage.getBoundingClientRect();
        const ox = g.cx - r.left - r.width / 2;
        const oy = g.cy - r.top - r.height / 2;
        const mx = (p.x + q.x) / 2 - g.cx;
        const my = (p.y + q.y) / 2 - g.cy;
        z.s = s;
        z.x = ox - ((ox - g.x) * s) / g.s + mx;
        z.y = oy - ((oy - g.y) * s) / g.s + my;
        apply(index, false);
        return;
      }
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.mode) {
        if (Math.hypot(dx, dy) < 8) return;
        g.mode = z.s > 1.01 ? "pan" : Math.abs(dx) > Math.abs(dy) ? "swipe" : dy > 0 ? "dismiss" : "none";
      }
      if (g.mode === "pan") {
        z.x = g.zx + dx;
        z.y = g.zy + dy;
        clampZoom(index);
        apply(index, false);
      } else if (g.mode === "swipe") {
        // (resisting past the ends)
        const edge = (index === 0 && dx > 0) || (index === items.length - 1 && dx < 0);
        place(false, edge ? dx / 3 : dx);
      } else if (g.mode === "dismiss") {
        const k = Math.min(1, dy / 400);
        slides[index].style.transition = "none";
        slides[index].style.transform = `translate(${dx * 0.5}px, ${dy}px) scale(${1 - k * 0.25})`;
        bg.style.opacity = String(1 - k);
        el.classList.add("dragging");
      }
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (!g) return;
      const z = zoom[index];
      if (g.mode === "pinch") {
        if (pts.size) {
          // (one finger left on: carry on as a drag from here)
          const [p] = [...pts.values()];
          g = { mode: z.s > 1.01 ? "pan" : "none", x0: p.x, y0: p.y, t0: performance.now(), zx: z.x, zy: z.y };
          return;
        }
        if (z.s < 1.05) zoom[index] = { s: 1, x: 0, y: 0 };
        else clampZoom(index);
        apply(index, true);
        g = null;
        return;
      }
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      const dt = Math.max(1, performance.now() - g.t0);
      if (!g.mode) {
        // a tap: twice, quickly, zooms a picture in (to where it was tapped) or back out; once shows or hides the bars
        const now = performance.now();
        if (now - lastTap < 300 && kindOf(items[index]) === "image") {
          lastTap = 0;
          clearTimeout(M.viewer?.tapTimer);
          if (z.s > 1.01) zoom[index] = { s: 1, x: 0, y: 0 };
          else {
            const r = stage.getBoundingClientRect();
            const s = 2.5;
            zoom[index] = { s, x: -(e.clientX - r.left - r.width / 2) * (s - 1), y: -(e.clientY - r.top - r.height / 2) * (s - 1) };
            clampZoom(index);
          }
          apply(index, true);
        } else {
          lastTap = now;
          if (M.viewer) M.viewer.tapTimer = setTimeout(() => el.classList.toggle("bare"), 280);
        }
      } else if (g.mode === "swipe") {
        const fast = Math.abs(dx) / dt > 0.5;
        if (Math.abs(dx) > W() * 0.2 || fast) go(index + (dx < 0 ? 1 : -1));
        else place(true);
      } else if (g.mode === "dismiss") {
        el.classList.remove("dragging");
        if (dy > 120 || dy / dt > 0.6) {
          slides[index].style.transition = "transform 0.3s var(--ease), opacity 0.3s";
          slides[index].style.transform = `translate(${dx * 0.5}px, ${dy + 200}px) scale(0.7)`;
          slides[index].style.opacity = "0";
          bg.style.transition = "opacity 0.3s";
          bg.style.opacity = "0";
          close();
        } else {
          slides[index].style.transition = "transform 0.4s var(--ease)";
          slides[index].style.transform = "";
          bg.style.transition = "opacity 0.4s";
          bg.style.opacity = "";
        }
      }
      g = null;
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    // (a mouse or trackpad: scrolled sideways, the next; with ctrl (a pinch on a trackpad), zoomed)
    stage.addEventListener(
      "wheel",
      (e) => {
        if (kindOf(items[index]) !== "image") return;
        e.preventDefault();
        if (e.ctrlKey) {
          const z = zoom[index];
          z.s = Math.max(1, Math.min(5, z.s * Math.exp(-e.deltaY / 100)));
          if (z.s <= 1.01) zoom[index] = { s: 1, x: 0, y: 0 };
          else clampZoom(index);
          apply(index, false);
        } else if (zoom[index].s > 1.01) {
          zoom[index].x -= e.deltaX;
          zoom[index].y -= e.deltaY;
          clampZoom(index);
          apply(index, false);
        }
      },
      { passive: false }
    );

    M.viewer = { close, el };
  }

  return { openViewer };
};
