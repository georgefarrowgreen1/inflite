/* Mail: inflite's Liquid Glass mail client for iPhone and iPad. */
(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  const NS = "http://www.w3.org/2000/svg";

  const ICONS = {
    inbox:
      '<path d="M3.5 13.5h4.6l1.4 2.5h5l1.4-2.5h4.6"/><path d="M6.2 5h11.6a1 1 0 0 1 .95.68L21 13v4.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5V13l2.25-7.32A1 1 0 0 1 6.2 5z"/>',
    sent: '<path d="M20.5 3.5 10.2 13.8"/><path d="M20.5 3.5 14 20.5l-3.8-6.7-6.7-3.8z"/>',
    drafts:
      '<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z"/><path d="M14 3.5V8h4.5"/><path d="M9 13h6M9 16.5h4"/>',
    archive:
      '<rect x="3" y="4" width="18" height="4.5" rx="1.2"/><path d="M5 8.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5"/><path d="M10 12.5h4"/>',
    trash:
      '<path d="M4 6.5h16"/><path d="M9 6.5V4.8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.7"/><path d="m6 6.5.9 12.6a1.6 1.6 0 0 0 1.6 1.4h7a1.6 1.6 0 0 0 1.6-1.4L18 6.5"/><path d="M10 10.5v6M14 10.5v6"/>',
    flag: '<path d="M5.5 21V4.5"/><path d="M5.5 4.5c4-2 7 2 13 0v9c-6 2-9-2-13 0"/>',
    flagFill: '<path d="M5.5 21V4.5"/><path fill="currentColor" d="M5.5 4.5c4-2 7 2 13 0v9c-6 2-9-2-13 0"/>',
    chevronLeft: '<path d="M15 4.5 7.5 12l7.5 7.5"/>',
    chevronRight: '<path d="m9 4.5 7.5 7.5L9 19.5"/>',
    chevronUp: '<path d="M4.5 15 12 7.5l7.5 7.5"/>',
    chevronDown: '<path d="M4.5 9 12 16.5 19.5 9"/>',
    compose:
      '<path d="M11.5 4h-5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-5"/><path d="M17.6 3.6a2 2 0 0 1 2.8 2.8l-8 8-3.6.9.9-3.6z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/>',
    reply: '<path d="M9.5 15 4 9.5 9.5 4"/><path d="M4 9.5h10.5a5.5 5.5 0 0 1 5.5 5.5v5"/>',
    replyAll:
      '<path d="M8 15 2.5 9.5 8 4"/><path d="M12.5 15 7 9.5 12.5 4"/><path d="M7 9.5h8a5.5 5.5 0 0 1 5.5 5.5v5"/>',
    forward: '<path d="M14.5 15 20 9.5 14.5 4"/><path d="M20 9.5H9.5A5.5 5.5 0 0 0 4 15v5"/>',
    more:
      '<circle cx="5.5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
    filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
    x: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
    arrowUp: '<path d="M12 19.5v-15M5.5 11 12 4.5l6.5 6.5"/>',
    arrowRight: '<path d="M4.5 12h15M13 5.5l6.5 6.5-6.5 6.5"/>',
    clip: '<path d="m20.5 11.2-8.3 8.3a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.7-7.7"/>',
    sidebar: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M9.5 4.5v15"/><path d="M5.5 8.5H7M5.5 11.5H7"/>',
    envelope: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    envelopeBadge:
      '<path d="M14 5H5.5A2.5 2.5 0 0 0 3 7.5v9A2.5 2.5 0 0 0 5.5 19h13a2.5 2.5 0 0 0 2.5-2.5V11"/><path d="m3.5 7.5 8.5 6 3-2.1"/><circle cx="19" cy="5.5" r="2.6" fill="currentColor" stroke="none"/>',
    envelopeOpen: '<path d="M3 10.5 12 4l9 6.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m3.5 11 8.5 6 8.5-6"/>',
    folder:
      '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2 2.2h7.4A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
    signout: '<path d="M14.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3.5"/><path d="M10 16.5 14.5 12 10 7.5"/><path d="M14.5 12h-11"/>',
    photo: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m21 15.5-5-5L5.5 19.5"/>',
    doc: '<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z"/><path d="M14 3.5V8h4.5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    download: '<path d="M12 4v11.5M7 11l5 5 5-5"/><path d="M5 20h14"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    share: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M8.5 10.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5a2 2 0 0 0-2-2h-1.5"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5v-3a4 4 0 0 1 8 0v3"/>',
    person: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6"/>',
    news: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M7 9h10M7 12.5h10M7 16h6"/>',
    pin: '<path d="M9 4h6l-1 5 3 3v1.5H7V12l3-3z"/><path d="M12 13.5V20"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><circle cx="12" cy="16.5" r=".9" fill="currentColor" stroke="none"/>',
  };

  function icon(name, cls = "") {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", `i ${cls}`.trim());
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = ICONS[name] || "";
    return s;
  }

  function h(tag, props, ...kids) {
    const [name, ...classes] = tag.split(".");
    const el = document.createElement(name || "div");
    if (classes.length) el.className = classes.join(" ");
    if (props == null || typeof props !== "object" || props instanceof Node || Array.isArray(props)) {
      kids.unshift(props);
      props = null;
    }
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === "class") el.className = `${el.className} ${v}`.trim();
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else if (k === "html") el.innerHTML = v;
        else if (k === "value" || k === "disabled" || k === "checked") el[k] = v;
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    append(el, kids);
    return el;
  }

  // Like replaceChildren, but skips null/false (which the DOM would print as text).
  function setKids(el, ...kids) {
    el.replaceChildren();
    append(el, kids);
  }

  function append(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false) continue;
      el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
  }

  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function hue(str) {
    let x = 0;
    for (const ch of String(str || "")) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    return x % 360;
  }

  function initials(name, email) {
    const src = (name || "").replace(/["'()]/g, "").trim() || (email || "?").split("@")[0];
    const parts = src.split(/[\s._-]+/).filter(Boolean);
    const s = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : src.slice(0, 2);
    return s.toUpperCase();
  }

  // (your own: your account's photo, when it has one, over your initials, which show if it can't be had)
  function avatar(person, cls = "") {
    const el = h(`div.avatar${cls ? "." + cls : ""}`, { "aria-hidden": "true" }, initials(person.name, person.email));
    el.style.setProperty("--h", hue(person.email || person.name));
    const src = (person.me || isMine(person.email)) && myPhoto();
    if (src) {
      const img = h("img", { src, alt: "", decoding: "async" });
      img.addEventListener("error", () => img.remove());
      el.append(img);
    }
    return el;
  }

  const myPhoto = () => (S.me?.account?.photoAt && !DEMO ? `/api/photo?v=${S.me.account.photoAt}` : null);
  const isMine = (email) => !!email && (S.me?.identities || []).includes(String(email).toLowerCase());

  const displayName = (p) => (p ? p.name || p.email || "" : "");

  const locale = navigator.language || "en-GB";
  const dayMs = 86400000;
  const startOfDay = (t) => new Date(new Date(t).toDateString()).getTime();

  function fmtListDate(ts) {
    const today = startOfDay(Date.now());
    if (ts >= today) return new Date(ts).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
    if (ts >= today - dayMs) return "Yesterday";
    if (ts >= today - 6 * dayMs) return new Date(ts).toLocaleDateString(locale, { weekday: "long" });
    return new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "numeric", year: "2-digit" });
  }

  function fmtLongDate(ts) {
    const d = new Date(ts);
    const today = startOfDay(Date.now());
    const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
    if (ts >= today) return `Today at ${time}`;
    if (ts >= today - dayMs) return `Yesterday at ${time}`;
    return `${d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })} at ${time}`;
  }

  function fmtQuoteDate(ts) {
    const d = new Date(ts);
    return `${d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })} at ${d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}`;
  }

  // A file's name cut in the middle when it's long, as in Mail, so its end (and type) still shows
  function attName(name) {
    const n = String(name || "");
    const tail = n.length > 10 ? n.slice(-8) : "";
    return h("div.att-name", { title: n }, h("span.att-a", tail ? n.slice(0, -8) : n), tail ? h("span.att-b", tail) : null);
  }

  function fmtSize(n) {
    if (!n) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function fmtUpdated(ts) {
    if (!ts) return "";
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return "Updated Just Now";
    const m = Math.round(s / 60);
    if (m < 60) return `Updated ${m} minute${m === 1 ? "" : "s"} ago`;
    return `Updated ${new Date(ts).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}`;
  }

  const debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // History can be unavailable in sandboxed frames; navigation still works without it.
  function hist(method, state) {
    try {
      history[method](state, "");
    } catch {}
  }

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(`inflite:${k}`);
        return v == null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(`inflite:${k}`, JSON.stringify(v));
      } catch {}
    },
  };

  function linkify(escaped) {
    return escaped.replace(
      /\b(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
  }

  function textToHtml(text) {
    return linkify(escapeHtml(text || "")).replace(/\r?\n/g, "<br>");
  }

  function htmlToText(html) {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    doc.querySelectorAll("script,style,head").forEach((n) => n.remove());
    doc.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
    doc.querySelectorAll("p,div,tr,li,h1,h2,h3,h4,blockquote").forEach((n) => n.append("\n"));
    return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  }

  function bodyInner(html) {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    doc.querySelectorAll("script,iframe,object,embed,form").forEach((n) => n.remove());
    return doc.body.innerHTML;
  }

  function parseAddress(s) {
    s = String(s || "")
      .trim()
      .replace(/[,;]+$/, "");
    const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    if (m) return { name: m[1].trim(), email: m[2].trim() };
    return { name: "", email: s };
  }

  const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

  function fileToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  // ---------------------------------------------------------------------------
  // API (real backend or in-memory demo)
  // ---------------------------------------------------------------------------

  const DEMO = !!window.INFLITE_DEMO || new URLSearchParams(location.search).has("demo");

  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  function realApi() {
    async function req(method, path, body, opts = {}) {
      const res = await fetch(path, {
        method,
        credentials: "same-origin",
        keepalive: opts.keepalive,
        headers: {
          "X-Inflite": "1",
          ...(STANDALONE && { "X-Home-Screen": "1" }),
          ...(body !== undefined && { "Content-Type": "application/json" }),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let data = null;
      try {
        data = await res.json();
      } catch {}
      if (!res.ok) {
        if (res.status === 401 && data?.access) onSignedOut(data.access);
        throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
      }
      return data;
    }
    const qs = (o) =>
      new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false)).toString();
    return {
      session: () => req("GET", "/api/session"),
      handback: (code, verifier) => req("POST", "/api/auth/handback", { code, verifier }),
      logout: () => req("POST", "/api/logout", {}),
      me: () => req("GET", "/api/me"),
      version: () => req("GET", "/api/version"),
      counts: () => req("GET", "/api/counts"),
      threads: ({ view, category, address, q, before }) => req("GET", `/api/threads?${qs({ view, category, address, q, before })}`),
      thread: (id) => req("GET", `/api/threads/${id}`),
      threadAction: (id, body) => req("POST", `/api/threads/${id}`, body),
      threadBatch: (body) => req("POST", "/api/threads/batch", body),
      emptyTrash: () => req("POST", "/api/trash/empty", {}),
      pushKey: () => req("GET", "/api/push/key"),
      unsubInfo: (id) => req("GET", `/api/unsubscribe/${id}`),
      unsubscribe: (id) => req("POST", `/api/unsubscribe/${id}`, {}),
      pushSubscribe: (sub) => req("POST", "/api/push/subscribe", sub),
      pushUnsubscribe: (endpoint) => req("POST", "/api/push/unsubscribe", { endpoint }),
      message: (id) => req("GET", `/api/messages/${id}`),
      remove: (id) => req("DELETE", `/api/messages/${id}`),
      contacts: (q) => req("GET", `/api/contacts?${qs({ q })}`),
      send: (payload, opts) => req("POST", "/api/send", payload, opts),
      saveDraft: (draft) => req("POST", "/api/drafts", draft),
      rawUrl: (id) => `/api/messages/${id}/raw`,
    };
  }

  function demoApi() {
    const now = Date.now();
    const min = 60000;
    const hr = 60 * min;
    const ME = { name: "George Farrow-Green", email: "hello@inflite.ai" };
    const P = {
      maya: { name: "Maya Chen", email: "maya@studio-north.co" },
      leo: { name: "Leo Martins", email: "leo.martins@fastmail.com" },
      priya: { name: "Priya Shah", email: "priya@lumen.vc" },
      cf: { name: "Cloudflare", email: "noreply@notify.cloudflare.com" },
      alex: { name: "Alex Rivera", email: "alex@rivera.photo" },
      sam: { name: "Sam Okafor", email: "sam@okafor.dev" },
      nw: { name: "Northwind Airlines", email: "trips@northwind-air.example" },
      byte: { name: "The Weekly Byte", email: "editor@weeklybyte.example" },
      parcel: { name: "Parcel & Co", email: "updates@parcel.example" },
      jo: { name: "Jo Whitfield", email: "jo@whitfield.studio" },
    };
    const card = (title, body, cta) => `
      <div style="background:#f4f5f8;padding:28px 12px;font-family:-apple-system,Helvetica,Arial,sans-serif">
        <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden">
          <tr><td style="background:linear-gradient(135deg,#f6821f,#fbad41);height:6px"></td></tr>
          <tr><td style="padding:28px 28px 8px"><h1 style="margin:0;font-size:22px;color:#111">${title}</h1></td></tr>
          <tr><td style="padding:8px 28px 8px;color:#444;font-size:15px;line-height:1.55">${body}</td></tr>
          ${cta ? `<tr><td style="padding:12px 28px 30px"><a href="https://dash.cloudflare.com" style="display:inline-block;background:#0a84ff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">${cta}</a></td></tr>` : ""}
        </table>
      </div>`;
    let seq = 0;
    const mk = (folder, from, subject, text, ago, extra = {}) => ({
      id: `demo-${++seq}`,
      folder,
      threadId: `t-${seq}`,
      mailbox: extra.mailbox || ME.email,
      category: extra.category || "people",
      snoozeUntil: null,
      from,
      to: extra.to || [ME],
      cc: extra.cc || [],
      bcc: [],
      subject,
      snippet: (text || htmlToText((extra.html || "").split(/<blockquote/i)[0])).replace(/\s+/g, " ").slice(0, 200),
      text,
      html: extra.html || "",
      date: now - ago,
      unread: !!extra.unread,
      starred: !!extra.starred,
      hasAttachments: !!extra.attachments?.length,
      attachments: extra.attachments || [],
      messageId: `demo-${seq}@inflite.ai`,
      references: null,
      replyTo: null,
      compose: extra.compose || null,
    });
    const swatch = (c1, c2) =>
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>`)}`;

    // (a small PDF, made here, so the demo's viewer has one to show)
    const demoPdf = (() => {
      try {
        const text = "BT /F1 28 Tf 60 720 Td (October investor update) Tj /F1 14 Tf 0 -40 Td (Activation up 41% month on month.) Tj ET";
        const objs = [
          "<< /Type /Catalog /Pages 2 0 R >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
          `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
          "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        ];
        let pdf = "%PDF-1.4\n";
        const at = objs.map((o, i) => {
          const n = pdf.length;
          pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
          return n;
        });
        const x = pdf.length;
        pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
        return URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
      } catch {
        return "#";
      }
    })();

    const msgs = [
      mk("inbox", P.maya, "Liquid Glass explorations — round 2", "Hi George,\n\nAttached are the updated explorations for the mail client. I pushed the glass a little further on the toolbar and softened the rim highlight so it reads better over photos.\n\nThe sidebar on iPad now floats with a 10pt inset, which feels much closer to the system apps. Let me know what you think before Thursday's review.\n\nMaya", 6 * min, {
        unread: true,
        starred: true,
        attachments: [
          { id: "a1", filename: "Toolbar-v2.png", type: "image/png", size: 842113, url: swatch("#6fb1ff", "#6a3bff") },
          { id: "a2", filename: "Sidebar-iPad.png", type: "image/png", size: 1210331, url: swatch("#19d3c5", "#3a7bff") },
        ],
      }),
      mk("inbox", P.cf, "inflite.ai is ready for Email Sending", "", 38 * min, {
        unread: true,
        category: "updates",
        html: card(
          "Your domain is verified",
          "<p>Good news — <b>inflite.ai</b> passed DNS verification and can now send email through Cloudflare Email Service.</p><p>Bind <code>send_email</code> in your Worker to start sending. Your daily quota is <b>1,000 messages</b> while the service is in beta.</p>",
          "Open dashboard"
        ),
      }),
      mk("inbox", P.leo, "Re: Dinner Friday?", "", 2 * hr, {
        unread: true,
        html: '<div dir="ltr">Brilliant, booked for six at 8. See you there!</div><div dir="ltr"><br></div><div dir="ltr">Leo</div><div dir="ltr"><br><blockquote type="cite">On 27 Oct 2026, at 18:02, George Farrow-Green &lt;hello@inflite.ai&gt; wrote:<br><br></blockquote></div><blockquote type="cite"><div dir="ltr">Count me in! Can you book for six?</div><div dir="ltr"><br><blockquote type="cite">On 27 Oct 2026, at 17:40, Leo Martins wrote:<br><br>A few of us are going to that new place on Columbia Road on Friday around 8. Fancy it?</blockquote></div></blockquote>',
      }),
      mk("sent", ME, "Re: Dinner Friday?", "Count me in! Can you book for six?", 3 * hr, { to: [P.leo] }),
      mk("inbox", P.priya, "Re: Investor update draft", "This reads really well. Two small notes:\n\n1. Lead with the activation numbers — they're the headline.\n2. The roadmap slide can go in the appendix.\n\nHappy to jump on a call tomorrow if useful.\n\nPriya\n\n> On Monday, George wrote:\n> Here's the first draft of the October update…", 5 * hr, {
        starred: true,
        attachments: [
          { id: "a6", filename: "October-update-notes.pdf", type: "application/pdf", size: 184320, url: demoPdf },
          { id: "a7", filename: "Roadmap-appendix.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 48211, url: "#" },
        ],
      }),
      mk("inbox", P.alex, "Photos from the weekend", "Here are a few favourites from Saturday. Full gallery link to follow once I've finished the edit!", 22 * hr, {
        attachments: [
          { id: "a3", filename: "IMG_2041.jpg", type: "image/jpeg", size: 3204112, url: swatch("#ff9a8b", "#ff6a88") },
          { id: "a4", filename: "IMG_2058.jpg", type: "image/jpeg", size: 2876433, url: swatch("#fbc2eb", "#a6c1ee") },
          { id: "a5", filename: "IMG_2077.jpg", type: "image/jpeg", size: 3011876, url: swatch("#84fab0", "#8fd3f4") },
        ],
      }),
      mk("inbox", P.nw, "Your trip to Lisbon is confirmed", "", 26 * hr, {
        category: "updates",
        html: `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px 16px">
          <div style="font-size:13px;letter-spacing:.08em;color:#0a84ff;font-weight:700">BOOKING CONFIRMED</div>
          <h1 style="font-size:26px;margin:6px 0 18px">London → Lisbon</h1>
          <table width="100%" style="border-collapse:collapse;font-size:15px">
            <tr><td style="padding:10px 0;color:#666">Flight</td><td style="text-align:right;font-weight:600">NW 482</td></tr>
            <tr><td style="padding:10px 0;color:#666;border-top:1px solid #eee">Departs</td><td style="text-align:right;border-top:1px solid #eee">Fri 14 Nov · 07:40 LHR</td></tr>
            <tr><td style="padding:10px 0;color:#666;border-top:1px solid #eee">Arrives</td><td style="text-align:right;border-top:1px solid #eee">10:25 LIS</td></tr>
            <tr><td style="padding:10px 0;color:#666;border-top:1px solid #eee">Seat</td><td style="text-align:right;border-top:1px solid #eee">14A</td></tr>
          </table>
          <p style="color:#666;font-size:13px;margin-top:22px">Check-in opens 24 hours before departure.</p></div>`,
      }),
      mk("inbox", P.sam, "Quick question about the API", "Hey George — is the /messages endpoint paginated by cursor or offset? Want to make sure the sync job doesn't double-count.\n\nCheers,\nSam", 2 * dayMs + 3 * hr, { mailbox: "support@inflite.ai", unread: true }),
      mk("inbox", P.byte, "Issue #142: The quiet return of the web app", "", 3 * dayMs, {
        category: "updates",
        unread: true,
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:24px 18px;color:#222">
          <div style="font-family:-apple-system,Helvetica,sans-serif;font-size:12px;letter-spacing:.12em;color:#888">THE WEEKLY BYTE · ISSUE 142</div>
          <h1 style="font-size:30px;line-height:1.15;margin:10px 0 14px">The quiet return of the web app</h1>
          <p style="font-size:17px;line-height:1.6">Home-screen web apps have grown up. With edge runtimes doing the heavy lifting, a single HTML file can feel as native as anything in the App Store…</p>
          <p style="font-size:17px;line-height:1.6">This week: why the best new tools ship as URLs first, and what that means for the rest of us.</p></div>`,
      }),
      mk("inbox", P.parcel, "Your parcel is out for delivery", "Good news! Your parcel is with our driver and will arrive today between 13:00 and 15:00.", 4 * dayMs, { category: "updates" }),
      mk("sent", { name: ME.name, email: "support@inflite.ai" }, "Re: Quick question about the API", "Cursor-based — pass the date of the last message as `before`. Shout if anything looks off.\n\nG", 2 * dayMs, { to: [P.sam], mailbox: "support@inflite.ai" }),
      mk("sent", ME, "Investor update draft", "Hi Priya,\n\nHere's the first draft of the October update. Would love your eyes on it before it goes out.\n\nThanks,\nGeorge", 3 * dayMs, { to: [P.priya] }),
      mk("drafts", ME, "Thursday review agenda", "1. Toolbar glass\n2. iPad sidebar\n3. Compose sheet motion", 1 * hr, {
        to: [P.maya],
        compose: { from: ME.email, to: [P.maya], cc: [], bcc: [], subject: "Thursday review agenda", text: "1. Toolbar glass\n2. iPad sidebar\n3. Compose sheet motion" },
      }),
      mk("archive", P.jo, "Brand guidelines v3", "Final guidelines attached — thanks for all the feedback!", 9 * dayMs),
      mk("trash", P.parcel, "Rate your delivery", "How did we do? Tap a star to rate your delivery.", 6 * dayMs, { category: "updates" }),
    ];
    // (Priya's reply and the message it answers are one conversation)
    const priya = msgs.find((x) => x.subject === "Re: Investor update draft"), sentDraft = msgs.find((x) => x.subject === "Investor update draft");
    if (priya && sentDraft) priya.threadId = sentDraft.threadId;
    const leoIn = msgs.find((x) => x.folder === "inbox" && x.subject === "Re: Dinner Friday?"), leoOut = msgs.find((x) => x.folder === "sent" && x.subject === "Re: Dinner Friday?");
    if (leoIn && leoOut) leoIn.threadId = leoOut.threadId;
    const samIn = msgs.find((x) => x.subject === "Quick question about the API"), samOut = msgs.find((x) => x.subject === "Re: Quick question about the API");
    if (samIn && samOut) samOut.threadId = samIn.threadId;
    const contacts = Object.values(P);
    const delay = () => wait(140 + Math.random() * 160);
    const summary = ({ text, html, attachments, compose, ...m }) => m;

    // The server's conversations (src/threads.js), worked out here from the messages above
    const cleanSubject = (s) => (s || "").replace(/^((re|fwd?)\s*:\s*)+/i, "").trim();
    function threadOf(tid, ms) {
      ms = ms.slice().sort((a, b) => b.date - a.date);
      const latest = ms[0], incoming = ms.find((m) => m.folder !== "sent") || latest, people = [];
      for (const m of ms) {
        const who = m.folder === "sent" ? { name: "You", email: m.from.email, me: true } : m.from;
        if (!people.some((p) => p.email === who.email && !!p.me === !!who.me)) people.push(who);
      }
      const now = Date.now(), snooze = Math.max(0, ...ms.map((m) => m.snoozeUntil || 0));
      return {
        id: tid,
        subject: cleanSubject(latest.subject) || "(No Subject)",
        latest: summary(latest),
        from: incoming.from,
        people,
        count: ms.length,
        unread: ms.filter((m) => m.folder === "inbox" && m.unread).length,
        starred: ms.some((m) => m.starred),
        hasAttachments: ms.some((m) => m.hasAttachments),
        category: ms.some((m) => m.category === "people") ? "people" : "updates",
        done: !ms.some((m) => m.folder === "inbox"),
        trashed: latest.folder === "trash",
        snoozeUntil: snooze > now ? snooze : null,
        mailbox: incoming.mailbox,
        canUnsub: incoming.category === "updates" && /byte|github|stripe|parcel|cloudflare/i.test(incoming.from.email || ""),
        date: latest.date,
        messages: ms.map(summary),
      };
    }
    function allThreads(trash) {
      const map = new Map();
      for (const m of msgs) {
        if (m.folder === "drafts" || (trash ? m.folder !== "trash" : m.folder === "trash")) continue;
        if (!map.has(m.threadId)) map.set(m.threadId, []);
        map.get(m.threadId).push(m);
      }
      return [...map].map(([tid, ms]) => threadOf(tid, ms)).sort((a, b) => b.date - a.date);
    }
    function matches(m, q) {
      return q.split(/\s+/).filter(Boolean).every((t) => {
        const [op, ...rest] = t.split(":"), v = rest.join(":").toLowerCase();
        if (!rest.length) return [m.subject, m.snippet, m.from.name, m.from.email, ...m.to.map((x) => x.email), ...(m.attachments || []).map((a) => a.filename)].join(" ").toLowerCase().includes(t.toLowerCase());
        if (op === "from") return (m.from.name + m.from.email).toLowerCase().includes(v);
        if (op === "to") return [m.mailbox, ...m.to.map((x) => x.email + x.name)].join(" ").toLowerCase().includes(v);
        if (op === "file") return (m.attachments || []).some((a) => a.filename.toLowerCase().includes(v));
        if (op === "has")
          return /^(image|photo)/.test(v)
            ? (m.attachments || []).some((a) => /^image\//.test(a.type))
            : /^pdf/.test(v)
              ? (m.attachments || []).some((a) => a.type === "application/pdf")
              : m.hasAttachments;
        if (op === "is") return v === "unread" ? m.unread : v === "flagged" ? m.starred : v === "done" ? m.folder === "archive" : true;
        return true;
      });
    }
    const threadMsgs = (id) => msgs.filter((m) => m.threadId === id && m.folder !== "drafts");
    return {
      async session() {
        return { access: "ok", accountOrigin: "", user: { name: ME.name, handle: "george", email: ME.email, admin: true } };
      },
      async logout() {
        return { ok: true };
      },
      async me() {
        return { displayName: ME.name, domain: "inflite.ai", defaultFrom: ME.email, identities: [ME.email, "support@inflite.ai"] };
      },
      async version() {
        return { v: String(Date.now()), build: null };
      },
      async unsubInfo(id) {
        const t = threadOf(id, threadMsgs(id));
        const all = msgs.filter((m) => m.from.email === t.from.email);
        return { sender: t.from, opened: all.filter((m) => !m.unread).length, of: all.length, how: "oneclick" };
      },
      async unsubscribe(id) {
        await delay();
        const from = threadOf(id, threadMsgs(id)).from.email;
        for (const m of msgs) if (m.from.email === from && m.folder === "inbox") m.folder = "archive";
        return { ok: true };
      },
      async counts() {
        const out = { people: { threads: 0, unread: 0 }, updates: { threads: 0, unread: 0 }, flagged: 0, snoozed: 0, done: 0 };
        for (const t of allThreads()) {
          if (!t.done && t.snoozeUntil) out.snoozed++;
          else if (!t.done) {
            out[t.category].threads++;
            if (t.unread) out[t.category].unread++;
          } else out.done++;
          if (t.starred) out.flagged++;
        }
        out.trash = allThreads(true).length;
        out.drafts = msgs.filter((m) => m.folder === "drafts").length;
        const addr = new Map();
        for (const m of msgs) if (["inbox", "archive"].includes(m.folder)) addr.set(m.mailbox, (addr.get(m.mailbox) || 0) + (m.folder === "inbox" && m.unread ? 1 : 0));
        out.addresses = [...addr].map(([address, unread]) => ({ address, unread }));
        out.inbox = { unread: out.people.unread };
        const later = allThreads().filter((t) => !t.done && t.snoozeUntil).sort((a, b) => a.snoozeUntil - b.snoozeUntil)[0];
        if (later) out.nextLater = { id: later.id, at: later.snoozeUntil, from: later.from, subject: later.subject };
        out.updatesFrom = allThreads().filter((t) => !t.done && !t.snoozeUntil && t.category === "updates").slice(0, 4).map((t) => t.from);
        return out;
      },
      async threads({ view, category, address, q }) {
        await delay();
        let list;
        if (q) list = allThreads().filter((t) => threadMsgs(t.id).some((m) => matches(m, q)));
        else if (view === "trash") list = allThreads(true);
        else {
          list = allThreads().filter((t) =>
            view === "unread" ? t.unread && !t.done && !t.snoozeUntil : view === "flagged" ? t.starred : view === "attachments" ? t.hasAttachments : view === "done" ? t.done : view === "later" ? !t.done && t.snoozeUntil : !t.done && !t.snoozeUntil
          );
          if (category) list = list.filter((t) => t.category === category);
        }
        if (address) list = list.filter((t) => threadMsgs(t.id).some((m) => m.mailbox === address));
        const drafts = view === "all" && category !== "updates" && !q && !address ? msgs.filter((m) => m.folder === "drafts").map(summary) : [];
        return { threads: list.map(({ messages, ...t }) => t), drafts, hasMore: false };
      },
      async thread(id) {
        await delay();
        const ms = threadMsgs(id);
        const live = ms.filter((m) => m.folder !== "trash");
        if (!ms.length) throw new ApiError(404, "Conversation not found");
        return threadOf(id, live.length ? live : ms);
      },
      async threadAction(id, { action, category, sender, until }) {
        const ms = threadMsgs(id), latestIn = ms.filter((m) => ["inbox", "archive"].includes(m.folder)).sort((a, b) => b.date - a.date)[0];
        if (action === "snooze" && !ms.some((m) => m.folder === "inbox")) for (const m of ms) if (m.folder === "archive") m.folder = "inbox";
        for (const m of ms) {
          if (action === "done" && m.folder === "inbox") Object.assign(m, { folder: "archive", snoozeUntil: null });
          if (action === "inbox" && m.folder === "archive") m.folder = "inbox";
          if (action === "read") m.unread = false;
          if (action === "unflag") m.starred = false;
          if (action === "trash" && m.folder !== "trash") Object.assign(m, { prevFolder: m.folder, folder: "trash", snoozeUntil: null });
          if (action === "restore" && m.folder === "trash") Object.assign(m, { folder: m.prevFolder || "inbox", prevFolder: null });
          if (action === "category") m.category = category;
          if (action === "snooze") m.snoozeUntil = m.folder === "inbox" ? until : m.snoozeUntil;
          if (action === "unsnooze") m.snoozeUntil = null;
        }
        if (action === "unread" && latestIn) latestIn.unread = true;
        if (action === "flag") ms.sort((a, b) => b.date - a.date)[0].starred = true;
        if (action === "category" && sender && latestIn) for (const m of msgs) if (m.from.email === latestIn.from.email) m.category = category;
        if (action === "delete") for (const m of ms) msgs.splice(msgs.indexOf(m), 1);
        return { ok: true };
      },
      async threadBatch({ ids, ...body }) {
        for (const id of ids) await this.threadAction(id, body);
        return { ok: true };
      },
      async emptyTrash() {
        for (const m of msgs.filter((x) => x.folder === "trash")) msgs.splice(msgs.indexOf(m), 1);
        return { ok: true };
      },
      async message(id) {
        await delay();
        const m = msgs.find((x) => x.id === id);
        if (!m) throw new ApiError(404, "Message not found");
        return { ...m };
      },
      async remove(id) {
        const i = msgs.findIndex((x) => x.id === id);
        if (i >= 0) msgs.splice(i, 1);
        return { ok: true };
      },
      async contacts(q) {
        const s = (q || "").toLowerCase();
        return { contacts: contacts.filter((c) => (c.name + c.email).toLowerCase().includes(s)).slice(0, 6) };
      },
      async send(p) {
        await wait(600);
        const parent = p.inReplyTo && msgs.find((x) => x.messageId === p.inReplyTo);
        const m = mk("sent", { name: ME.name, email: p.from }, p.subject, p.text, 0, { to: p.to, cc: p.cc, html: p.html });
        if (parent) {
          m.threadId = parent.threadId;
          for (const x of msgs) if (x.threadId === parent.threadId) x.unread = false;
        }
        msgs.unshift(m);
        if (p.draftId) await this.remove(p.draftId);
        return { ok: true, id: m.id };
      },
      async saveDraft(d) {
        let m = d.id && msgs.find((x) => x.id === d.id);
        if (!m) {
          m = mk("drafts", ME, d.subject, d.text, 0, { to: d.to });
          msgs.unshift(m);
        }
        Object.assign(m, { subject: d.subject, text: d.text, to: d.to, snippet: d.text.slice(0, 200), date: Date.now(), compose: d });
        return { ok: true, id: m.id };
      },
      rawUrl: () => "#",
    };
  }

  const STANDALONE = (() => {
    try {
      return navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
    } catch {
      return false;
    }
  })();

  // On the Home Screen, iOS can lay the page out shorter than the screen (the height a Safari toolbar would take), so
  // the tab bar sits high with a band under it: there, filling the window, size Mail to the screen itself
  let viewH = () => window.innerHeight;
  if (STANDALONE && screen.width && screen.height) {
    const fit = () => {
      const portrait = window.innerHeight >= window.innerWidth;
      const w = portrait ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
      const h = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
      // (only when the window is the whole screen, not an iPad window beside another app)
      const short = Math.abs(window.innerWidth - w) < 2 && h - window.innerHeight > 1 && h - window.innerHeight < 200;
      const root = document.documentElement;
      root.classList.toggle("fullscreen-fix", short);
      if (short) root.style.setProperty("--screen-h", `${h}px`);
    };
    fit();
    viewH = () => (document.documentElement.classList.contains("fullscreen-fix") ? document.body.clientHeight : window.innerHeight);
    window.addEventListener("resize", fit);
    // (the page now taller than iOS's window, it could be scrolled, by focus or script: kept where it belongs)
    window.addEventListener("scroll", () => {
      if (window.scrollY && document.documentElement.classList.contains("fullscreen-fix")) window.scrollTo(0, 0);
    });
    window.addEventListener("orientationchange", () => setTimeout(fit, 300));
  }

  const api = DEMO ? demoApi() : realApi();

  // The look, as the account has it (its page's Appearance, for every app on the site): Automatic, Light or Dark, kept
  // in this browser too, so theme.js has it for the first frame next time
  const THEME_COLOR = { dark: "#1b2860", light: "#dde3fb" };
  function lookOf(v) {
    v = v === "light" || v === "dark" ? v : "auto";
    const root = document.documentElement;
    if (root.dataset.theme === (v === "auto" ? undefined : v)) return;
    if (v === "auto") delete root.dataset.theme;
    else root.dataset.theme = v;
    try {
      localStorage.setItem("mail:appearance", v);
    } catch {}
    for (const m of document.querySelectorAll('meta[name="theme-color"]'))
      m.setAttribute("content", v === "auto" ? THEME_COLOR[m.media.includes("dark") ? "dark" : "light"] : THEME_COLOR[v]);
    // (email bodies are drawn for one look or the other)
    if (S.thread) renderDetail({ keepScroll: true });
  }
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  };
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (!document.documentElement.dataset.theme && S.thread) renderDetail({ keepScroll: true });
  });

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // One stream of conversations, narrowed by views (the chips) rather than kept in folders
  const VIEWS = {
    all: { chip: "All", title: "Inbox" },
    unread: { chip: "Unread", title: "Unread" },
    flagged: { chip: "Flagged", title: "Flagged" },
    attachments: { chip: "Attachments", title: "Attachments" },
    later: { chip: "Later", title: "Later" },
    done: { chip: "Done", title: "Done" },
    trash: { chip: "Trash", title: "Trash" },
  };

  const S = {
    me: null,
    counts: {},
    // (where you are: a lens, and whether only unread mail shows; the view and category the server is asked for follow)
    lens: "people",
    filter: "all",
    failedSends: [],
    offline: false,
    view: "all",
    pushOn: false,
    category: "people",
    address: null,
    query: "",
    threads: [],
    drafts: [],
    hasMore: false,
    loading: false,
    loadingMore: false,
    searching: false,
    selectedId: null,
    thread: null,
    bodies: new Map(),
    expanded: new Set(),
    depth: 0,
    updatedAt: 0,
    layout: "phone",
    remoteImages: store.get("remoteImages", false),
    listToken: 0,
    detailToken: 0,
    swiping: false,
    newIds: new Set(),
  };

  const els = {};

  // ---------------------------------------------------------------------------
  // Glass interaction: a specular highlight follows the finger.
  // ---------------------------------------------------------------------------

  // (its box measured once per touch, and moved at most once a frame)
  // No pinch zoom in Safari (which goes by its own gesture events rather than the viewport or touch-action)
  const noZoom = (e) => e.preventDefault();
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, noZoom, { passive: false });

  let litEl = null, litRect = null, litPos = null, litFrame = 0;
  function light(e) {
    litPos = [e.clientX - litRect.left, e.clientY - litRect.top];
    litFrame ||= requestAnimationFrame(() => {
      litFrame = 0;
      if (!litEl || !litPos) return;
      litEl.style.setProperty("--px", `${litPos[0]}px`);
      litEl.style.setProperty("--py", `${litPos[1]}px`);
    });
  }
  document.addEventListener(
    "pointerdown",
    (e) => {
      const g = e.target.closest?.(".glass");
      if (!g) return;
      litEl = g;
      litRect = g.getBoundingClientRect();
      light(e);
      g.classList.add("lit");
    },
    { passive: true }
  );
  document.addEventListener("pointermove", (e) => litEl && light(e), { passive: true });
  const unlight = () => {
    litEl?.classList.remove("lit");
    litEl = null;
  };
  document.addEventListener("pointerup", unlight, { passive: true });
  document.addEventListener("pointercancel", unlight, { passive: true });

  // ---------------------------------------------------------------------------
  // Menus & toasts
  // ---------------------------------------------------------------------------

  let menuState = null;

  function showMenu(anchor, items, { title } = {}) {
    closeMenu(true);
    const layer = h("div.menu-layer");
    const menu = h(
      "div.menu",
      { role: "menu" },
      title && h("div.menu-title", title),
      items.filter(Boolean).map((it) =>
        it === "-"
          ? h("div.menu-sep")
          : h(
              "button.menu-item",
              {
                role: "menuitem",
                class: [it.destructive && "destructive", it.checked && "checked"].filter(Boolean).join(" ") || null,
                disabled: it.disabled,
                onclick: () => {
                  closeMenu();
                  it.action?.();
                },
              },
              it.checked !== undefined && icon("check", "check"),
              h("span.lbl", it.label),
              it.hint && h("span.hint", it.hint),
              it.icon && icon(it.icon)
            )
      )
    );
    layer.addEventListener("pointerdown", (e) => {
      if (e.target === layer) closeMenu();
    });
    layer.append(menu);
    document.body.append(layer);

    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const vw = window.innerWidth;
    const vh = viewH();
    const below = r.bottom + 8 + mh < vh - 12 || r.top < vh / 2;
    let top = below ? r.bottom + 8 : r.top - 8 - mh;
    top = Math.max(12, Math.min(top, vh - mh - 12));
    let left = r.left + r.width / 2 < vw / 2 ? r.left : r.right - mw;
    left = Math.max(12, Math.min(left, vw - mw - 12));
    Object.assign(menu.style, { top: `${top}px`, left: `${left}px` });
    menu.style.transformOrigin = `${r.left + r.width / 2 - left}px ${r.top + r.height / 2 - top}px`;
    requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add("open")));
    // (never a destructive choice first, so Return can't delete anything by accident)
    const choices = () => [...menu.querySelectorAll("button:not(:disabled)")];
    (choices().find((b) => !b.classList.contains("destructive")) || choices()[0])?.focus({ preventScroll: true });
    menu.addEventListener("keydown", (e) => {
      const list = choices();
      const i = list.indexOf(document.activeElement);
      const go = (j) => (e.preventDefault(), list[(j + list.length) % list.length]?.focus({ preventScroll: true }));
      if (e.key === "ArrowDown") go(i + 1);
      else if (e.key === "ArrowUp") go(i - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(list.length - 1);
      else if (e.key === "Tab") (e.preventDefault(), closeMenu());
    });
    menuState = { layer, menu, opener: anchor };
  }

  function closeMenu(immediate) {
    if (!menuState) return;
    const { layer, menu, opener, onClose } = menuState;
    menuState = null;
    onClose?.();
    layer.classList.remove("open");
    // (back to what opened it, as a menu does)
    if (opener?.isConnected && (menu.contains(document.activeElement) || document.activeElement === document.body)) opener.focus?.({ preventScroll: true });
    if (immediate) return layer.remove();
    menu.classList.remove("open");
    menu.classList.add("closing");
    layer.style.pointerEvents = "none";
    setTimeout(() => layer.remove(), 260);
  }

  let toastEl = null;
  let toastTimer = null;

  function toast(message, { icon: ic = "check", actionLabel, action, duration = 2600, error } = {}) {
    if (!toastEl) {
      toastEl = h("div.toast.glass.strong", { role: "status", "aria-live": "polite" });
      document.body.append(toastEl);
    }
    clearTimeout(toastTimer);
    toastEl.className = `toast glass strong${error ? " error" : ""}`;
    setKids(toastEl, 
      icon(error ? "alert" : ic),
      h("span.msg", message),
      actionLabel &&
        h(
          "button.gbtn",
          {
            onclick: () => {
              hide();
              action?.();
            },
          },
          actionLabel
        )
    );
    if (!actionLabel) toastEl.style.paddingRight = "20px";
    else toastEl.style.paddingRight = "";
    requestAnimationFrame(() => requestAnimationFrame(() => toastEl.classList.add("show")));
    const hide = () => {
      clearTimeout(toastTimer);
      toastEl.classList.remove("show");
    };
    toastTimer = setTimeout(hide, duration);
    return { hide };
  }

  // ---------------------------------------------------------------------------
  // Layout: on iPhone the stream, and a conversation pushed over it; on iPad and Mac, the two side by side
  // ---------------------------------------------------------------------------

  function updateLayout() {
    const w = window.innerWidth;
    const phone = w < 700;
    const body = document.body;
    const was = S.layout;
    S.layout = phone ? "phone" : "pad";
    // (an iPad window made narrow with a conversation open: still open, now pushed over the list)
    if (phone && was === "pad" && S.thread && S.depth === 0) {
      S.depth = 1;
      hist("pushState", { depth: 1 });
    }
    body.classList.toggle("phone", phone);
    body.classList.toggle("pad", !phone);
    body.style.setProperty("--list-left", "0px");
    if (!phone) body.style.setProperty("--list-w", `${Math.round(Math.min(440, Math.max(340, w * 0.36)))}px`);
    setPositions();
    renderNavButtons();
    if (was && was !== S.layout) markSelectedRow();
  }

  let movingTimer;
  function setPositions() {
    // (panes made solid while they slide, so one doesn't show through the other)
    if (S.layout === "phone" && els.list?.dataset.pos && els.detail.dataset.pos !== (S.depth ? "current" : "ahead")) {
      document.body.classList.add("moving");
      clearTimeout(movingTimer);
      movingTimer = setTimeout(() => document.body.classList.remove("moving"), 560);
    }
    [els.list, els.detail].forEach((p, i) => {
      if (S.layout !== "phone") {
        p.removeAttribute("data-pos");
        p.inert = false;
        return;
      }
      p.dataset.pos = i < S.depth ? "behind" : i === S.depth ? "current" : "ahead";
      p.inert = i !== S.depth;
    });
  }

  function pushDepth(depth) {
    if (S.layout !== "phone") return;
    S.depth = depth;
    hist("pushState", { depth });
    setPositions();
  }

  function goBack() {
    if (S.layout !== "phone") return;
    if ((history.state?.depth ?? 0) > 0 && history.state.depth === S.depth) history.back();
    else {
      S.depth = Math.max(0, S.depth - 1);
      setPositions();
      if (S.depth === 0) focusRow(S.selectedId);
    }
  }

  window.addEventListener("popstate", (e) => {
    if (sheetState) {
      // Back gesture while composing closes the sheet instead.
      hist("pushState", { depth: S.depth });
      return requestCloseCompose();
    }
    S.depth = e.state?.depth ?? 0;
    setPositions();
    if (S.depth === 0) focusRow(S.selectedId);
  });

  // (back in the list: on the row that was open, for keyboards and VoiceOver)
  function focusRow(id) {
    if (!id) return;
    setTimeout(() => els.rows?.querySelector(`.row[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }), 60);
  }

  // Interactive edge swipe to go back on iPhone.
  function setupEdgeSwipe() {
    // (once: it listens on the document, which outlives the app built again after signing back in)
    if (setupEdgeSwipe.done) return;
    setupEdgeSwipe.done = true;
    let g = null;
    const W = () => window.innerWidth;
    document.addEventListener(
      "touchstart",
      (e) => {
        if (S.layout !== "phone" || S.depth === 0 || sheetState || menuState) return;
        const t = e.touches[0];
        if (t.clientX > 24) return;
        g = { x0: t.clientX, y0: t.clientY, dx: 0, active: false, lastX: t.clientX, lastT: performance.now(), v: 0 };
        // (held only while a touch starts at the edge, so ordinary scrolling never waits on script)
        document.addEventListener("touchmove", move, { passive: false });
      },
      { passive: true }
    );
    const move = (e) => {
        if (!g) return;
        const t = e.touches[0];
        const dx = t.clientX - g.x0;
        const dy = t.clientY - g.y0;
        if (!g.active) {
          if (Math.abs(dy) > 12 && Math.abs(dy) > dx) return (g = null);
          if (dx < 8) return;
          g.active = true;
          document.body.classList.add("dragging");
        }
        e.preventDefault();
        const now = performance.now();
        g.v = (t.clientX - g.lastX) / Math.max(1, now - g.lastT);
        g.lastX = t.clientX;
        g.lastT = now;
        g.dx = Math.max(0, dx);
        const p = g.dx / W();
        els.detail.style.transform = `translateX(${g.dx}px)`;
        els.list.style.transform = `translateX(${-28 * (1 - p)}%)`;
        els.list.style.opacity = String(Math.min(1, p * 1.4));
    };
    const end = () => {
      document.removeEventListener("touchmove", move, { passive: false });
      if (!g) return;
      const was = g;
      g = null;
      if (!was.active) return;
      document.body.classList.remove("dragging");
      els.detail.style.transform = "";
      els.list.style.transform = "";
      els.list.style.opacity = "";
      if (was.dx > W() * 0.33 || was.v > 0.45) goBack();
    };
    document.addEventListener("touchend", end, { passive: true });
    document.addEventListener("touchcancel", end, { passive: true });
  }

  // ---------------------------------------------------------------------------
  // Skeleton
  // ---------------------------------------------------------------------------

  function gbtn(name, label, onclick, extra = {}) {
    return h("button.gbtn.glass", { "aria-label": label, title: label, onclick, ...extra }, icon(name));
  }

  // The site's sky (styles in app.css), once, behind the app and the sign-in card alike
  function ensureSky() {
    if (document.querySelector(".sky")) return;
    document.body.prepend(h("div.sky", { "aria-hidden": "true" }, h("i.aura.a1"), h("i.aura.a2"), h("i.aura.a3")));
  }

  function build() {
    ensureSky();
    document.getElementById("app")?.remove();
    const app = h("div", { id: "app" });

    // The stream
    els.listNav = h("div.navbar");
    els.listNavTitle = h("div.nav-title");
    els.listTitle = h("div.large-title");
    els.listSubtitle = h("div.subtitle");
    els.searchHelp = h("div.search-help", { hidden: true });
    els.rows = h("div.rows", { role: "list" });
    els.listFooter = h("div");
    els.listScroll = h(
      "div.scroll",
      h("div.ptr", h("div.spinner")),
      els.listSubtitle,
      els.searchHelp,
      els.rows,
      els.listFooter
    );
    els.listToolbar = h("div.toolbar");
    els.list = h("section.pane.list", { "aria-label": "Conversations" }, els.listNav, els.listNavTitle, els.listScroll, els.listToolbar);

    // A conversation
    els.detailNav = h("div.navbar");
    els.detailNavTitle = h("div.nav-title");
    els.detailScroll = h("div.scroll");
    els.detailToolbar = h("div.toolbar");
    els.detailEmpty = h("div.detail-empty", icon("envelope"), h("b", "No Conversation Selected"));
    els.detail = h(
      "section.pane.detail",
      { "aria-label": "Conversation" },
      els.detailEmpty,
      els.detailNav,
      els.detailNavTitle,
      els.detailScroll,
      els.detailToolbar
    );

    app.append(els.list, els.detail);
    document.body.append(app);

    for (const pane of [els.list, els.detail]) {
      const scroll = pane.querySelector(".scroll");
      scroll.addEventListener("scroll", () => pane.classList.toggle("scrolled", scroll.scrollTop > 28), { passive: true });
    }
    els.listScroll.addEventListener("scroll", onListScroll, { passive: true });
    els.listScroll.addEventListener("touchend", onListTouchEnd, { passive: true });
    setupRowGestures(els.rows);
    setupEdgeSwipe();

    buildListToolbar();
    renderListChrome();
    renderDetail();
    updateLayout();
  }

  function renderNavButtons() {
    if (!els.listNav) return;
    const me = S.me || {};
    setKids(
      els.listNav,
      h(
        "button.gbtn.glass.profile",
        { "aria-label": "Account", title: "Account", onclick: (e) => profileMenu(e.currentTarget) },
        avatar({ name: me.displayName, email: me.defaultFrom, me: true }, "sm")
      ),
      // (the title beside your photo, in the bar: it stays as the list scrolls)
      els.listTitle,
      h("div.spacer"),
      gbtn("compose", "New Message", () => openCompose())
    );
    renderDetailChrome();
  }

  // Your account: its page, remote images, and signing out
  // You: your card (the way to your account), Notifications and Remote Images as switches, and Sign Out on its own
  function profileMenu(anchor) {
    closeMenu(true);
    const me = S.me || {};
    const acct = me.account || {};
    const name = acct.name || me.displayName || "";
    const sw = (on, label, onclick) => {
      const b = h("button.switch", { type: "button", role: "switch", "aria-checked": String(!!on), "aria-label": label, onclick });
      return b;
    };
    const row = (cls, ic, label, end) => h("div.p-row", h(`span.p-ic.${cls}`, icon(ic)), h("span.p-l", label), end);
    const notif = sw(S.pushOn, "Notifications", async () => {
      await togglePush();
      notif.setAttribute("aria-checked", String(!!S.pushOn));
    });
    const images = sw(S.remoteImages, "Remote Images", () => {
      toggleRemoteImages();
      images.setAttribute("aria-checked", String(!!S.remoteImages));
    });
    const card = h(
      "button.p-card",
      { type: "button", "aria-label": `${name || "Your account"}: your inflite account`, onclick: () => accountOrigin && location.assign(`${accountOrigin}/`) },
      avatar({ name, email: me.defaultFrom, me: true }, "p-photo"),
      h(
        "span.p-who",
        h("b", name || "Your account"),
        h("span.p-line", h("span.p-mail", me.defaultFrom || ""), acct.admin ? h("span.p-role", "Admin") : null)
      ),
      icon("chevronRight", "p-chev")
    );
    const pop = h(
      "div.menu.profile-pop",
      { role: "dialog", "aria-label": "You" },
      card,
      h("div.p-grp", row("bell", "bell", "Notifications", notif), row("img", "photo", "Remote Images", images)),
      h("div.p-grp", h("button.p-row.p-out", { type: "button", onclick: () => (closeMenu(), signOut()) }, h("span.p-ic.out", icon("signout")), h("span.p-l", "Sign Out")))
    );
    const layer = h("div.menu-layer.profile-layer");
    layer.addEventListener("pointerdown", (e) => e.target === layer && closeMenu());
    pop.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const f = [...pop.querySelectorAll("button")];
      if (e.shiftKey && document.activeElement === f[0]) (e.preventDefault(), f[f.length - 1].focus());
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) (e.preventDefault(), f[0].focus());
    });
    layer.append(pop);
    document.body.append(layer);
    // (just under your photo, from where it grows)
    const r = anchor.getBoundingClientRect();
    const left = Math.max(12, Math.min(r.left - 2, window.innerWidth - pop.offsetWidth - 12));
    Object.assign(pop.style, { top: `${r.bottom + 10}px`, left: `${left}px`, transformOrigin: `${r.left + r.width / 2 - left}px -10px` });
    anchor.classList.add("lit");
    requestAnimationFrame(() => requestAnimationFrame(() => (pop.classList.add("open"), layer.classList.add("open"))));
    card.focus({ preventScroll: true });
    menuState = { layer, menu: pop, opener: anchor, onClose: () => anchor.classList.remove("lit") };
  }

  // ---------------------------------------------------------------------------
  // Notifications: new mail from people (and conversations back from Later), on this phone or browser.
  // On iPhone and iPad, only Mail opened from the Home Screen can have them.
  // ---------------------------------------------------------------------------

  const PUSH_OK = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  let swReg = null;

  async function setupPush() {
    if (DEMO || !PUSH_OK) return;
    try {
      swReg = await navigator.serviceWorker.register("/sw.js");
      const sub = await swReg.pushManager.getSubscription();
      S.pushOn = !!sub && Notification.permission === "granted";
      // (keep the server's copy current: subscriptions can change under us)
      if (S.pushOn) api.pushSubscribe(sub.toJSON()).catch(() => {});
    } catch {}
  }

  const keyBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

  async function togglePush() {
    if (DEMO) return toast("Demo mode — notifications need the real Mail", { icon: "bell" });
    if (!PUSH_OK) {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      return toast(ios && !STANDALONE ? "Add Mail to your Home Screen to get notifications" : "This browser can’t show notifications", { icon: "bell", duration: 4200 });
    }
    if (S.pushOn) {
      S.pushOn = false;
      try {
        const sub = await (swReg || (await navigator.serviceWorker.ready)).pushManager.getSubscription();
        if (sub) {
          await api.pushUnsubscribe(sub.endpoint).catch(() => {});
          await sub.unsubscribe();
        }
      } catch {}
      return toast("Notifications Off", { icon: "bell" });
    }
    // (asked first, while the tap still counts as one)
    const perm = await Notification.requestPermission();
    if (perm !== "granted")
      return toast(perm === "denied" ? "Notifications are blocked for Mail in Settings" : "Notifications stay off", { icon: "bell", duration: 4200 });
    try {
      const reg = swReg || (await navigator.serviceWorker.register("/sw.js"));
      swReg = reg;
      await navigator.serviceWorker.ready;
      const { key } = await api.pushKey();
      let sub = await reg.pushManager.getSubscription();
      if (sub && keyOf(sub) !== key) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      await api.pushSubscribe(sub.toJSON());
      S.pushOn = true;
      toast("Notifications On: new mail from people", { icon: "bell" });
    } catch (err) {
      toast(err.message || "Couldn’t turn notifications on", { error: true });
    }
  }

  function keyOf(sub) {
    const k = sub.options?.applicationServerKey;
    if (!k) return null;
    return btoa(String.fromCharCode(...new Uint8Array(k))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // A notification tapped: its conversation
  async function openFromUrl(url) {
    const p = new URLSearchParams(new URL(url, location.href).hash.slice(1));
    const id = p.get("thread");
    if (!id) return;
    await openThread(id);
    // (Reply, from the notice: straight into the reply at the foot)
    if (p.get("reply")) setTimeout(() => els.detailToolbar?.querySelector(".qr-field")?.focus(), 300);
  }
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data?.open && S.me) openFromUrl(e.data.open);
    });

  function toggleRemoteImages() {
    S.remoteImages = !S.remoteImages;
    store.set("remoteImages", S.remoteImages);
    if (S.thread) renderDetail({ keepScroll: true });
  }

  async function signOut() {
    try {
      await api.logout();
    } catch {}
    if (DEMO) return toast("Demo mode — nothing to sign out of", { icon: "lock" });
    showGate("signin");
  }

  // From the title: what shows (in People and Updates), then everything else the list can do
  function listMenu(anchor) {
    const items = [];
    if (S.lens === "people" || S.lens === "updates")
      items.push(...FILTERS.map((f) => ({ label: f.label, checked: S.filter === f.k, action: () => setFilter(f.k) })), "-");
    if (S.lens === "flagged" || S.lens === "trash") items.push({ label: "Back to People", icon: "person", action: () => setLens("people") }, "-");
    if (S.view !== "trash")
      items.push({ label: "Mark All as Read", icon: "envelopeOpen", disabled: !S.threads.some((t) => t.unread), action: markAllRead });
    // (each address mail has come to, once there's more than one: only its mail)
    const addrs = S.counts.addresses || [];
    if (S.view !== "trash" && addrs.length > 1)
      items.push(
        "-",
        ...addrs.map((a) => ({
          label: `Only Mail to ${a.address.split("@")[0]}@`,
          hint: a.unread ? String(a.unread) : "",
          checked: S.address === a.address,
          action: () => setAddress(S.address === a.address ? null : a.address),
        }))
      );
    if (S.view === "trash") {
      items.push({ label: "Empty Trash", icon: "trash", destructive: true, disabled: !S.threads.length, action: () => emptyTrash(anchor) });
    } else {
      items.push("-", { label: S.counts.trash ? `Trash (${S.counts.trash})` : "Trash", icon: "trash", action: () => setView("trash") });
    }
    showMenu(anchor, items);
  }

  // ---------------------------------------------------------------------------
  // The stream: its title, People or Updates, the views, search
  // ---------------------------------------------------------------------------

  // The lenses on the one stream: the one you're in is the title, and says its name in the row; the rest are icons
  // with a count of what's waiting there
  const LENSES = [
    { k: "people", label: "People", icon: "person" },
    { k: "updates", label: "Updates", icon: "news" },
    { k: "later", label: "Later", icon: "clock" },
    { k: "done", label: "Done", icon: "check" },
  ];
  // (in People and Updates, from the title: only these)
  const FILTERS = [
    { k: "all", label: "All Mail" },
    { k: "unread", label: "Unread", icon: "envelopeBadge" },
    { k: "flagged", label: "Flagged", icon: "flag" },
    { k: "attachments", label: "With Attachments", icon: "clip" },
  ];
  const lensCount = (k) =>
    k === "people" || k === "updates" ? S.counts[k]?.unread || 0 : k === "later" ? S.counts.snoozed || 0 : k === "flagged" ? S.counts.flagged || 0 : 0;

  const listTitle = () =>
    S.query ? "Search" : S.lens === "trash" ? "Trash" : S.lens === "flagged" ? "Flagged" : LENSES.find((l) => l.k === S.lens).label;

  // The dot beside the title, on every tab: one light for how the mailbox stands, the most pressing first. Tapped, it
  // says why (and a message that didn't send is sent again).
  const DOT = {
    failed: { cls: "red", say: () => `${S.failedSends.length === 1 ? "A message" : `${S.failedSends.length} messages`} didn't send. Tap to try again.` },
    offline: { cls: "grey", say: () => "Offline. Showing what was last loaded." },
    fresh: { cls: "blue", say: () => `${lensCount("people")} unread from people` },
    soon: { cls: "purple", say: () => `${displayName(S.counts.nextLater.from) || "A conversation"} comes back ${fmtWhen(S.counts.nextLater.at)}` },
    flagged: { cls: "orange", say: () => `${S.counts.flagged} flagged to follow up` },
    clear: { cls: "green", say: () => "Caught up. Nothing from people is waiting." },
  };

  function dotState() {
    if (S.offline || !navigator.onLine) return "offline";
    if (S.failedSends.length) return "failed";
    if (lensCount("people")) return "fresh";
    if (S.counts.nextLater && S.counts.nextLater.at - Date.now() < 3600000) return "soon";
    if (S.counts.flagged) return "flagged";
    return "clear";
  }

  function statusDot() {
    const k = dotState();
    const d = DOT[k];
    return h(`button.status-dot.${d.cls}`, {
      type: "button",
      "aria-label": d.say(),
      title: d.say(),
      onclick: (e) => {
        e.stopPropagation();
        if (k === "failed") return retryFailed();
        toast(d.say(), { icon: k === "clear" ? "check" : k === "soon" ? "clock" : k === "flagged" ? "flag" : k === "offline" ? "x" : "envelopeBadge" });
      },
    });
  }

  function retryFailed() {
    const jobs = S.failedSends.splice(0);
    renderListChrome();
    for (const job of jobs) {
      job.started = false;
      runSend(job);
    }
  }

  addEventListener("online", () => ((S.offline = false), renderListChrome()));
  addEventListener("offline", () => renderListChrome());

  function renderListChrome() {
    if (!els.listTitle) return;
    const title = listTitle();
    const n = !S.query && (S.lens === "people" || S.lens === "updates") ? lensCount(S.lens) : 0;
    setKids(
      els.listTitle,
      S.query
        ? h("span", title)
        : h(
            "button.title-btn",
            { type: "button", "aria-haspopup": "menu", "aria-label": `${title}, filters and more`, onclick: (e) => listMenu(e.currentTarget) },
            h("span", title)
          ),
      S.query ? null : statusDot()
    );
    const about = {
      people: [n && `${n} unread`, fmtUpdated(S.updatedAt)],
      updates: [n && `${n} unread`],
      later: [],
      flagged: [S.counts.flagged && `${S.counts.flagged} flagged`],
      done: [],
      trash: [S.counts.trash ? `${S.counts.trash} conversation${S.counts.trash === 1 ? "" : "s"}` : "Empty"],
    }[S.lens];
    const bits = S.query ? [`${S.threads.length} conversation${S.threads.length === 1 ? "" : "s"}`] : about;
    setKids(
      els.listSubtitle,
      S.filter !== "all" && !S.query
        ? h("button.sub-tag", { type: "button", onclick: () => setFilter("all"), "aria-label": "Show all mail" }, FILTERS.find((f) => f.k === S.filter).label, icon("x"))
        : null,
      S.address && !S.query
        ? h("button.sub-tag", { type: "button", onclick: () => setAddress(null), "aria-label": `Show mail to every address, not only ${S.address}` }, `to ${S.address.split("@")[0]}@`, icon("x"))
        : null,
      h("span", bits.filter(Boolean).join(" · "))
    );
    // (nothing to say: no line at all)
    els.listSubtitle.hidden = !els.listSubtitle.textContent.trim();
    setKids(els.listNavTitle, title, n ? h("small", `${n} unread`) : null);
    renderTabs();
    renderSearchHelp();
  }

  const OPERATORS = ["from:", "to:", "file:", "has:attachment", "has:image", "has:pdf", "is:unread", "is:flagged", "is:done", "before:", "after:"];
  const OP_TOKEN = /\b(from|to|file|has|is|before|after):("[^"]*"|\S+)/gi;

  // Recent searches, kept in this browser (a convenience: nothing is lost without them)
  const RECENT_KEY = "mail:recent-searches";
  function recentSearches() {
    try {
      const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 8) : [];
    } catch {
      return [];
    }
  }
  function keepRecent(list) {
    try {
      if (list.length) localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
      else localStorage.removeItem(RECENT_KEY);
    } catch {}
  }
  function rememberSearch(q) {
    q = (q || "").trim().replace(/\s+/g, " ");
    if (q.length < 2) return;
    keepRecent([q, ...recentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase())]);
  }

  // What's being typed now: the last word, and the operator it's for (from: or to:), if any
  function typingToken(q) {
    if (!q || /\s$/.test(q)) return null;
    const word = q.split(/\s+/).pop();
    const m = /^(from|to):(.*)$/i.exec(word);
    if (m) return { word, op: m[1].toLowerCase(), value: m[2].replace(/^"/, "") };
    if (word.includes(":")) return null;
    return { word, op: null, value: word.replace(/^"/, "") };
  }

  // People suggested as you type a name (from those you've written to or heard from)
  const suggest = { q: null, people: [] };
  const suggestSoon = debounce(async (q) => {
    const tok = typingToken(q);
    if (!tok || tok.value.length < (tok.op ? 1 : 2)) {
      if (suggest.people.length) (suggest.people = []), renderSearchHelp();
      return;
    }
    try {
      const { contacts } = await api.contacts(tok.value);
      if (els.searchInput.value !== q) return;
      suggest.q = q;
      suggest.people = (contacts || []).slice(0, 4);
      renderSearchHelp();
    } catch {}
  }, 140);

  function replaceTyping(q, tok, by) {
    return `${q.slice(0, q.length - tok.word.length)}${by} `;
  }

  // While searching: recent searches (before anything's typed), people and files for what's being typed, what the
  // search understood as tokens, and the operators a tap away
  function renderSearchHelp() {
    els.searchHelp.hidden = !S.searching;
    if (!S.searching) return;
    const q = els.searchInput.value;
    const tokens = q.match(OP_TOKEN) || [];
    const tok = typingToken(q);
    const recent = q.trim() ? [] : recentSearches();
    const people = tok && suggest.q === q ? suggest.people : [];
    const keep = (e) => e.preventDefault();
    setKids(
      els.searchHelp,
      recent.length
        ? h(
            "div.s-section",
            h("div.s-head", h("span", "Recent"), h("button.s-clear", { type: "button", onpointerdown: keep, onclick: () => (keepRecent([]), renderSearchHelp()) }, "Clear")),
            h(
              "div.s-list",
              recent.map((r) =>
                h(
                  "div.s-item",
                  h("button.s-main", { type: "button", onpointerdown: keep, onclick: () => editQuery(`${r} `) }, icon("clock"), h("span.s-text", r)),
                  h(
                    "button.s-x",
                    { type: "button", "aria-label": `Remove ${r}`, onpointerdown: keep, onclick: () => (keepRecent(recentSearches().filter((x) => x !== r)), renderSearchHelp()) },
                    icon("x")
                  )
                )
              )
            )
          )
        : null,
      people.length || (tok && !tok.op && tok.value.length >= 2)
        ? h(
            "div.s-section",
            h(
              "div.s-list",
              people.map((p) => {
                const op = tok.op || "from";
                return h(
                  "div.s-item",
                  h(
                    "button.s-main",
                    { type: "button", onpointerdown: keep, onclick: () => editQuery(replaceTyping(q, tok, `${op}:${p.email}`)) },
                    avatar({ name: p.name, email: p.email }, "s-av"),
                    h("span.s-text", h("b", p.name || p.email), p.name ? h("span.s-sub", p.email) : null),
                    h("span.s-op", op === "to" ? "To" : "From")
                  )
                );
              }),
              tok && !tok.op && tok.value.length >= 2
                ? h(
                    "div.s-item",
                    h(
                      "button.s-main",
                      { type: "button", onpointerdown: keep, onclick: () => editQuery(replaceTyping(q, tok, `file:${tok.value}`)) },
                      h("span.s-ic", icon("clip")),
                      h("span.s-text", h("b", `Files named “${tok.value}”`))
                    )
                  )
                : null
            )
          )
        : null,
      tokens.length
        ? h(
            "div.tokens-row",
            tokens.map((t) => {
              const i = t.indexOf(":");
              return h(
                "button.qtoken",
                { type: "button", "aria-label": `Remove ${t}`, onpointerdown: keep, onclick: () => editQuery(q.replace(t, "")) },
                h("b", t.slice(0, i + 1)),
                t.slice(i + 1),
                icon("x")
              );
            })
          )
        : null,
      h(
        "div.ops-row",
        OPERATORS.filter((o) => !q.toLowerCase().includes(o)).map((o) =>
          h("button.chip.op", { type: "button", onpointerdown: keep, onclick: () => editQuery(`${q.trimEnd()} ${o}${o.endsWith(":") ? "" : " "}`) }, o)
        )
      )
    );
  }

  function editQuery(v) {
    els.searchInput.value = v.replace(/\s{2,}/g, " ").replace(/^\s+/, "");
    els.searchInput.focus();
    renderSearchHelp();
    runSearch(els.searchInput.value);
  }

  // The foot of the list: the tabs (People, Updates, Later, Done), and search beside them, which opens into a field
  // while the tabs fold down to the one you're on (as iOS 26 apps have it)
  function buildListToolbar() {
    els.searchInput = h("input", {
      type: "search",
      placeholder: "Search mail",
      enterkeyhint: "search",
      autocomplete: "off",
      autocorrect: "off",
      autocapitalize: "off",
      "aria-label": "Search mail",
      oninput: () => {
        renderSearchHelp();
        searchSoon(els.searchInput.value);
        suggestSoon(els.searchInput.value);
      },
      onfocus: () => S.searching || setSearching(true),
      onkeydown: (e) => {
        if (e.key === "Escape") cancelSearch();
        else if (e.key === "Enter") {
          // (searched for: now, and kept among the recent ones)
          runSearch(els.searchInput.value);
          rememberSearch(els.searchInput.value);
          els.searchInput.blur();
        }
      },
    });
    els.tabs = h("div.tabs.glass", { role: "tablist", "aria-label": "Mail" });
    els.searchCap = h(
      "div.search.glass",
      {
        onclick: (e) => {
          if (e.target.closest(".search-x")) return;
          // (opened and focused within the tap, so the keyboard comes up on iPhone)
          if (!S.searching) setSearching(true);
          els.searchInput.focus();
        },
      },
      icon("search"),
      els.searchInput,
      h("button.search-x", { type: "button", "aria-label": "Cancel Search", onclick: cancelSearch }, icon("x"))
    );
    setKids(els.listToolbar, els.tabs, els.searchCap);
    renderTabs();
  }

  function renderTabs() {
    if (!els.tabs) return;
    const i = LENSES.findIndex((l) => l.k === S.lens);
    setKids(
      els.tabs,
      h("span.tab-pill", { "aria-hidden": "true", style: { transform: `translateX(${Math.max(0, i) * 100}%)`, opacity: i < 0 ? "0" : "" } }),
      LENSES.map((l) => {
        const n = lensCount(l.k);
        const on = S.lens === l.k;
        return h(
          "button.tab",
          {
            type: "button",
            role: "tab",
            "data-k": l.k,
            class: on ? "on" : null,
            "aria-selected": String(on),
            "aria-label": `${l.label}${n ? `, ${n}` : ""}`,
            // (the one you're on: back to the top)
            onclick: () => (on && !S.query ? els.listScroll.scrollTo({ top: 0, behavior: "smooth" }) : setLens(l.k)),
          },
          icon(l.icon),
          h("span.tab-l", l.label),
          n ? h("span.tab-n", n > 99 ? "99+" : n) : null
        );
      })
    );
  }

  function setSearching(on) {
    S.searching = on;
    els.listToolbar.classList.toggle("searching", on);
    renderListChrome();
  }

  function runSearch(q) {
    q = q.trim();
    if (q === S.query) return;
    S.query = q;
    S.threads = [];
    loadList();
  }
  const searchSoon = debounce(runSearch, 260);

  function cancelSearch() {
    els.searchInput.value = "";
    els.searchInput.blur();
    S.searching = false;
    els.listToolbar.classList.remove("searching");
    if (S.query) {
      S.query = "";
      S.threads = [];
      loadList();
    }
    renderListChrome();
  }

  function resetList() {
    S.threads = [];
    S.drafts = [];
    S.hasMore = false;
    els.listScroll.scrollTop = 0;
    loadList();
    renderListChrome();
  }

  // (what the server is asked for, from where you are)
  function applyLens() {
    const stream = S.lens === "people" || S.lens === "updates";
    S.view = stream ? S.filter : S.lens;
    S.category = stream ? S.lens : null;
  }

  function setLens(k) {
    if (S.query) cancelSearch();
    if (k === S.lens && !S.query) return;
    S.lens = k;
    S.filter = "all";
    if (k !== "trash" && k !== "flagged") store.set("lens", k);
    applyLens();
    renderNavButtons();
    resetList();
  }

  function setFilter(f) {
    if (f === S.filter) return;
    S.filter = f;
    applyLens();
    renderNavButtons();
    resetList();
  }

  // (the older names, from the keyboard and menus)
  const setView = (v) => setLens(v === "all" ? "people" : v);
  const setCategory = (c) => setLens(c);

  function setAddress(address) {
    S.address = address;
    resetList();
  }

  async function loadList({ more = false, quiet = false } = {}) {
    const token = ++S.listToken;
    if (more) {
      if (S.loadingMore || !S.hasMore) return;
      S.loadingMore = true;
    } else if (!quiet) {
      S.loading = true;
      if (!S.threads.length) renderRows();
    }
    renderFooter();
    try {
      const last = S.threads[S.threads.length - 1];
      const params = {
        view: S.view,
        category: S.query || S.view === "trash" ? null : S.category,
        address: S.address,
        q: S.query,
        before: more && last ? last.sort ?? last.date : undefined,
      };
      // (the first page, asked for on opening alongside everything else)
      const early = S.prefetch && JSON.stringify(S.prefetch.params) === JSON.stringify(params) ? S.prefetch.res : null;
      S.prefetch = null;
      const res = await (early || api.threads(params));
      if (token !== S.listToken) return;
      if (more) {
        S.threads = S.threads.concat(res.threads);
        S.hasMore = res.hasMore;
      } else {
        const known = new Set(S.threads.map((t) => `${t.id}:${t.date}`));
        S.newIds = quiet && S.threads.length ? new Set(res.threads.filter((t) => !known.has(`${t.id}:${t.date}`)).map((t) => t.id)) : new Set();
        // (older pages already loaded are kept)
        const oldest = res.threads[res.threads.length - 1];
        const older = quiet && oldest && res.hasMore ? S.threads.filter((t) => (t.sort ?? t.date) < (oldest.sort ?? oldest.date)) : [];
        S.threads = res.threads.concat(older);
        S.drafts = res.drafts || [];
        if (!older.length) S.hasMore = res.hasMore;
      }
      S.updatedAt = Date.now();
    } catch (err) {
      if (token === S.listToken && err.status !== 401) toast(err.message, { error: true });
    } finally {
      if (token === S.listToken) {
        S.loading = false;
        S.loadingMore = false;
        renderRows();
        renderListChrome();
      }
    }
  }

  function renderFooter() {
    setKids(els.listFooter, S.loadingMore || (S.loading && !S.threads.length) ? h("div.load-more", h("div.spinner")) : null);
  }

  // What a row shows, so a row whose conversation hasn't changed is kept as it is (with its press state, and any tap
  // under way) rather than built again on every refresh
  const threadSig = (t) =>
    JSON.stringify([S.lens === "updates", t.date, t.unread, t.starred, t.count, t.snoozeUntil, t.done, t.trashed, t.category, t.subject, t.hasAttachments, t.latest?.snippet, t.people]);
  const draftSig = (d) => JSON.stringify([d.date, d.subject, d.snippet, d.to]);

  function renderRows() {
    closeOpenSwipe(true);
    if (!S.drafts.length && !S.threads.length) {
      if (S.loading) setKids(els.rows);
      else setKids(els.rows, emptyEl());
    } else {
      const old = new Map();
      for (const el of [...els.rows.children]) el.dataset.key ? old.set(el.dataset.key, el) : el.remove();
      const want = S.drafts.map((d) => [`d:${d.id}`, draftSig(d), () => draftRowEl(d)]);
      if (S.lens === "people" && !S.query && S.threads.length && !store.get("swipeHint", false)) want.push(["hint", "", swipeHintEl]);
      // (by day, newest first; Later by when each comes back, so no days there)
      let day = null;
      for (const t of S.threads) {
        const d = S.lens === "later" && !S.query ? null : dayLabel(t.sort ?? t.date);
        if (d && d !== day) want.push([`h:${d}`, d, () => h("div.day", { role: "presentation" }, d)]);
        day = d;
        want.push([`t:${t.id}`, threadSig(t), () => threadRowEl(t)]);
      }
      let prev = null;
      for (const [key, sig, make] of want) {
        let el = old.get(key);
        if (el && el.dataset.sig === sig) old.delete(key);
        else el = make();
        const next = prev ? prev.nextSibling : els.rows.firstChild;
        if (el !== next) els.rows.insertBefore(el, next);
        prev = el;
      }
      for (const el of old.values()) el.remove();
      // (drafts but no conversations: the drafts, then what an empty list says)
      if (!S.threads.length && !S.loading) els.rows.append(emptyEl());
      markSelectedRow();
    }
    renderFooter();
    S.newIds = new Set();
  }

  // Today, Yesterday, This Week, then months
  function dayLabel(ts) {
    const today = startOfDay(Date.now());
    if (ts >= today) return "Today";
    if (ts >= today - dayMs) return "Yesterday";
    if (ts >= today - 6 * dayMs) return "This Week";
    const d = new Date(ts);
    return d.toLocaleDateString(locale, d.getFullYear() === new Date().getFullYear() ? { month: "long" } : { month: "long", year: "numeric" });
  }

  function swipeHintEl() {
    const el = h(
      "div.swipe-hint",
      icon("check"),
      h("span", "Swipe right when you've dealt with something, left to bring it back later."),
      h("button", { type: "button", "aria-label": "Got It", onclick: () => dismissSwipeHint() }, icon("x"))
    );
    return el;
  }

  function dismissSwipeHint() {
    if (store.get("swipeHint", false)) return;
    store.set("swipeHint", true);
    const el = els.rows?.querySelector(".swipe-hint");
    el?.parentElement?.removeChild(el);
  }

  function emptyEl() {
    if (S.query) return h("div.empty.content-in", icon("search"), h("b", "No Results"), `Nothing matches “${S.query}”.`);
    // (People clear: nothing here at all; the dot beside the title says so)
    if (S.lens === "people" && S.filter === "all" && !S.address) return h("div.empty.quiet-empty", { "aria-label": "Caught up" });
    const [ic, said, more] = S.filter !== "all" && (S.lens === "people" || S.lens === "updates")
      ? ["envelopeOpen", `Nothing ${S.filter === "unread" ? "unread" : S.filter === "flagged" ? "flagged" : "with attachments"} here`]
      : S.address
        ? ["inbox", `Nothing waiting for ${S.address}`]
        : {
            updates: ["news", "No updates waiting"],
            later: ["clock", "Nothing put off", "Swipe left on a conversation to bring it back later."],
            flagged: ["flag", "Nothing flagged"],
            done: ["check", "Nothing done yet", "Swipe right on a conversation when you've dealt with it."],
            trash: ["trash", "Trash is empty"],
          }[S.lens];
    return h("div.empty.content-in", icon(ic), h("b", said), more || null);
  }

  // Who's in a conversation, newest first: one person by full name, several by first names
  function peopleLine(t) {
    const ps = t.people || [];
    if (ps.length === 1) return ps[0].me ? "You" : displayName(ps[0]) || "Unknown Sender";
    return ps
      .slice(0, 3)
      .map((p) => (p.me ? "You" : (p.name || p.email || "").split(/[\s@]/)[0]))
      .join(", ") + (ps.length > 3 ? ` +${ps.length - 3}` : "");
  }

  // What swiping right does here: Done, or back to the Inbox from Done, or out of the Trash
  function leadAction(t) {
    if (t.trashed) return { act: "restore", cls: "a-inbox", ic: "inbox", label: "Restore" };
    if (t.done) return { act: "inbox", cls: "a-inbox", ic: "inbox", label: "Inbox" };
    return { act: "done", cls: "a-done", ic: "check", label: "Done" };
  }

  function threadRowEl(t) {
    const row = h(
      "div.row",
      {
        role: "button",
        tabindex: "0",
        "data-id": t.id,
        class:
          [t.unread && "unread", t.starred && "starred", t.id === S.selectedId && S.layout === "pad" && "selected"].filter(Boolean).join(" ") || null,
        "aria-label": [
          t.unread && "Unread",
          t.starred && "Flagged",
          peopleLine(t),
          t.subject,
          t.hasAttachments && "Has attachments",
          t.snoozeUntil ? `Comes back ${fmtWhen(t.snoozeUntil)}` : fmtListDate(t.date),
        ]
          .filter(Boolean)
          .join(". "),
      },
      h("span.dot"),
      h("span.flag"),
      avatar(t.from || t.people?.[0] || { name: "?" }),
      h(
        "div.body",
        h(
          "div.top",
          h("span.from", peopleLine(t)),
          t.count > 1 ? h("span.count-badge", t.count) : null,
          t.snoozeUntil
            ? h("span.date.later", icon("clock"), fmtWhen(t.snoozeUntil))
            : h("span.date", fmtListDate(t.date), icon("chevronRight"))
        ),
        h(
          "div.subject",
          t.hasAttachments ? icon("clip") : null,
          h("span.subj-t", t.subject),
          // (in Updates, a sender that says how to stop)
          t.canUnsub && t.category === "updates" && !t.done && !t.trashed && !S.query
            ? h("button.unsub-btn", { type: "button", "aria-label": `Unsubscribe from ${displayName(t.from)}`, onclick: (e) => (e.stopPropagation(), unsubSheet(t)) }, "Unsubscribe")
            : null
        ),
        h("div.preview", t.latest?.folder === "sent" ? h("span.you", "You: ") : null, t.latest?.snippet || " ")
      )
    );
    const lead = leadAction(t);
    const actions = h(
      "div.swipe-actions",
      h("div.side.left", h(`button.${lead.cls}.lead`, { "data-act": lead.act, tabindex: "-1" }, icon(lead.ic), lead.label)),
      h(
        "div.side.right",
        h("button.a-more", { "data-act": "more", tabindex: "-1" }, icon("more"), "More"),
        h("button.a-read", { "data-act": t.unread ? "read" : "unread", tabindex: "-1" }, icon(t.unread ? "envelopeOpen" : "envelopeBadge"), t.unread ? "Read" : "Unread"),
        h("button.a-flag", { "data-act": t.starred ? "unflag" : "flag", tabindex: "-1" }, icon(t.starred ? "flag" : "flagFill"), t.starred ? "Unflag" : "Flag"),
        t.trashed ? null : h("button.a-later.lead", { "data-act": "later", tabindex: "-1" }, icon("clock"), "Later")
      )
    );
    const wrap = h("div.row-wrap", { role: "listitem", "data-id": t.id, "data-key": `t:${t.id}`, "data-sig": threadSig(t) }, actions, row);
    if (S.newIds.has(t.id)) wrap.classList.add("content-in");
    if (S.lens === "updates" && !S.query) row.classList.add("digest");
    return wrap;
  }

  function draftRowEl(d) {
    const row = h(
      "div.row.draft",
      { role: "button", tabindex: "0", "data-draft": d.id, "aria-label": `Draft. ${d.subject}` },
      h("span.dot"),
      h("span.flag"),
      avatar(d.to[0] || d.from),
      h(
        "div.body",
        h("div.top", h("span.from", h("span.draft-tag", "Draft"), d.to.length ? d.to.map(displayName).join(", ") : "No Recipients"), h("span.date", fmtListDate(d.date))),
        h("div.subject", d.subject || "(No Subject)"),
        h("div.preview", d.snippet || " ")
      )
    );
    return h(
      "div.row-wrap",
      { role: "listitem", "data-draft": d.id, "data-key": `d:${d.id}`, "data-sig": draftSig(d) },
      h("div.swipe-actions", h("div.side.left"), h("div.side.right")),
      row
    );
  }

  function updateRow(id) {
    const t = S.threads.find((x) => x.id === id);
    const old = els.rows.querySelector(`.row-wrap[data-id="${CSS.escape(id)}"]`);
    if (t && old) old.replaceWith(threadRowEl(t));
  }

  function markSelectedRow() {
    els.rows.querySelectorAll(".row.selected").forEach((r) => r.classList.remove("selected"));
    if (S.layout === "pad" && S.selectedId) els.rows.querySelector(`.row[data-id="${CSS.escape(S.selectedId)}"]`)?.classList.add("selected");
  }

  async function removeRow(id) {
    const wrap = els.rows.querySelector(`.row-wrap[data-id="${CSS.escape(id)}"]`);
    if (wrap) {
      wrap.style.height = `${wrap.offsetHeight}px`;
      wrap.offsetHeight;
      wrap.classList.add("removing");
      wrap.style.height = "0px";
      await wait(380);
      wrap.remove();
    }
    S.threads = S.threads.filter((t) => t.id !== id);
    // (again, so a day left with nothing in it loses its heading, and an empty list says so)
    renderRows();
  }

  // Pull to refresh & infinite scroll
  let pullArmed = false;
  function onListScroll() {
    const s = els.listScroll;
    if (s.scrollTop < -70) pullArmed = true;
    if (s.scrollHeight - s.scrollTop - s.clientHeight < 400 && S.hasMore && !S.loadingMore && !S.loading) loadList({ more: true });
  }

  async function onListTouchEnd() {
    if (!pullArmed) return;
    pullArmed = false;
    els.list.classList.add("refreshing");
    await Promise.all([loadList({ quiet: true }), refreshCounts(), wait(600)]);
    els.list.classList.remove("refreshing");
  }

  // ---------------------------------------------------------------------------
  // Swipe actions on rows
  // ---------------------------------------------------------------------------

  const LEFT_W = 88;
  const RIGHT_W = 4 * 72;
  let openSwipe = null;

  function setRowOffset(wrap, x, { animate = false, full = null } = {}) {
    const row = wrap.querySelector(".row");
    const left = wrap.querySelector(".swipe-actions .left");
    const right = wrap.querySelector(".swipe-actions .right");
    const t = animate ? "transform .42s var(--ease)" : "none";
    const wt = animate ? "width .42s var(--ease)" : "none";
    row.style.transition = t;
    left.style.transition = wt;
    right.style.transition = wt;
    row.style.transform = x ? `translateX(${x}px)` : "";
    left.style.width = `${Math.max(0, x)}px`;
    right.style.width = `${Math.max(0, -x)}px`;
    left.classList.toggle("full", full === "left");
    right.classList.toggle("full", full === "right");
    wrap.dataset.offset = x;
  }

  function closeOpenSwipe(immediate) {
    if (!openSwipe) return;
    const w = openSwipe;
    openSwipe = null;
    if (w.isConnected) setRowOffset(w, 0, { animate: !immediate });
  }

  function setupRowGestures(container) {
    let g = null;

    container.addEventListener("pointerdown", (e) => {
      const row = e.target.closest(".row");
      if (!row || row.dataset.draft || e.button > 0 || e.target.closest(".swipe-actions")) return;
      const wrap = row.parentElement;
      if (openSwipe && openSwipe !== wrap) {
        closeOpenSwipe();
        // (as in Mail: the tap that closes an open swipe opens nothing)
        row.dataset.swiped = "1";
        setTimeout(() => delete row.dataset.swiped, 400);
      }
      g = { width: 0, wrap, row, id: e.pointerId, x0: e.clientX, y0: e.clientY, base: Number(wrap.dataset.offset || 0), dir: null, lastX: e.clientX, lastT: performance.now(), v: 0, x: 0, full: null };
    });

    container.addEventListener("pointermove", (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.dir) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          g.dir = "h";
          g.width = g.wrap.offsetWidth;
          g.wrap.classList.add("swiping");
          S.swiping = true;
          try {
            g.row.setPointerCapture(e.pointerId);
          } catch {}
        } else if (Math.abs(dy) > 10) {
          g = null;
          return;
        } else return;
      }
      const now = performance.now();
      g.v = (e.clientX - g.lastX) / Math.max(1, now - g.lastT);
      g.lastX = e.clientX;
      g.lastT = now;
      const width = g.width;
      let x = g.base + dx;
      const fullAt = width * 0.5;
      const prevFull = g.full;
      g.full = x > fullAt ? "left" : x < -width * 0.6 ? "right" : null;
      if (g.full !== prevFull && navigator.vibrate) navigator.vibrate(8);
      x = Math.max(-width, Math.min(width, x));
      g.x = x;
      const st = g;
      g.frame ||= requestAnimationFrame(() => {
        st.frame = 0;
        if (st.dir) setRowOffset(st.wrap, st.x, { full: st.full });
      });
    });

    const finish = (e) => {
      if (!g || (e && e.pointerId !== g.id)) return;
      const st = g;
      g = null;
      if (st.dir !== "h") return;
      cancelAnimationFrame(st.frame);
      st.dir = "done";
      setTimeout(() => st.wrap.classList.remove("swiping"), 500);
      setTimeout(() => (S.swiping = false), 50);
      st.row.dataset.swiped = "1";
      setTimeout(() => delete st.row.dataset.swiped, 80);
      const id = st.wrap.dataset.id;
      const width = st.wrap.offsetWidth;
      const t = S.threads.find((x) => x.id === id);
      if (st.full === "left" && t) {
        setRowOffset(st.wrap, width, { animate: true, full: "left" });
        openSwipe = null;
        setTimeout(() => act(id, leadAction(t).act), 200);
        return;
      }
      if (st.full === "right" && t) {
        openSwipe = null;
        setRowOffset(st.wrap, -width, { animate: true, full: "right" });
        setTimeout(() => {
          setRowOffset(st.wrap, 0, { animate: true });
          rightLead(t);
        }, 240);
        return;
      }
      let target = 0;
      if (st.x > LEFT_W / 2 || (st.v > 0.5 && st.x > 0)) target = LEFT_W;
      else if (st.x < -RIGHT_W / 2 || (st.v < -0.5 && st.x < 0)) target = -RIGHT_W;
      if (st.base && Math.sign(st.v) === -Math.sign(st.base) && Math.abs(st.v) > 0.3) target = 0;
      setRowOffset(st.wrap, target, { animate: true });
      openSwipe = target ? st.wrap : null;
    };
    container.addEventListener("pointerup", finish);
    container.addEventListener("pointercancel", (e) => {
      if (g && g.dir === "h") finish(e);
      else g = null;
    });

    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".swipe-actions button");
      if (btn) {
        const id = btn.closest(".row-wrap").dataset.id;
        const t = S.threads.find((x) => x.id === id);
        if (!t) return;
        if (btn.dataset.act === "more") return rowMoreMenu(btn, t);
        if (btn.dataset.act === "later") return laterMenu(btn, t);
        closeOpenSwipe();
        act(id, btn.dataset.act);
        return;
      }
      const row = e.target.closest(".row");
      if (!row || row.dataset.swiped) return;
      if (openSwipe) return closeOpenSwipe();
      if (row.dataset.draft) return openDraft(row.dataset.draft);
      openThread(row.dataset.id);
    });

    // (press and hold on a phone; right-click, or the menu key, anywhere)
    let hold = null;
    container.addEventListener("pointerdown", (e) => {
      const row = e.target.closest(".row[data-id]");
      if (!row || e.pointerType !== "touch" || e.target.closest(".swipe-actions")) return;
      const x0 = e.clientX, y0 = e.clientY;
      clearTimeout(hold?.timer);
      hold = {
        x0,
        y0,
        timer: setTimeout(() => {
          const t = S.threads.find((x) => x.id === row.dataset.id);
          if (!t || S.swiping) return;
          row.dataset.swiped = "1";
          setTimeout(() => delete row.dataset.swiped, 600);
          rowActions(row, t);
        }, 480),
      };
    });
    container.addEventListener("pointermove", (e) => {
      if (hold && Math.hypot(e.clientX - hold.x0, e.clientY - hold.y0) > 8) (clearTimeout(hold.timer), (hold = null));
    });
    const letGo = () => hold && (clearTimeout(hold.timer), (hold = null));
    container.addEventListener("pointerup", letGo);
    container.addEventListener("pointercancel", letGo);
    container.addEventListener("contextmenu", (e) => {
      const row = e.target.closest(".row[data-id]");
      if (!row) return;
      e.preventDefault();
      const t = S.threads.find((x) => x.id === row.dataset.id);
      if (t && !menuState) rowActions(row, t);
    });

    container.addEventListener("keydown", (e) => {
      const row = e.target.closest(".row");
      if (row?.dataset.id && (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey))) {
        e.preventDefault();
        const t = S.threads.find((x) => x.id === row.dataset.id);
        if (t) rowActions(row, t);
        return;
      }
      if (row && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        if (row.dataset.draft) openDraft(row.dataset.draft);
        else openThread(row.dataset.id);
      }
    });
  }

  // (a full swipe to the left: Later, or flag in the Trash)
  function rightLead(t) {
    if (t.trashed) return act(t.id, t.starred ? "unflag" : "flag");
    const row = els.rows.querySelector(`.row[data-id="${CSS.escape(t.id)}"]`);
    laterMenu(row || els.rows, t);
  }

  // ---------------------------------------------------------------------------
  // Later: out of the stream until a time, then back at the top, unread
  // ---------------------------------------------------------------------------

  function at(days, hour, minute = 0) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
  }

  function laterChoices() {
    const now = new Date();
    const hr = now.getHours(), dow = now.getDay();
    const out = [];
    if (hr >= 6 && hr < 17) {
      const half = 1800000;
      out.push({ label: "Later Today", until: Math.ceil((Date.now() + 3 * 3600000) / half) * half });
    }
    if (hr < 18) out.push({ label: "This Evening", until: at(0, 18) });
    out.push({ label: "Tomorrow Morning", until: at(1, 8), timeOnly: true });
    if (dow >= 1 && dow <= 4) out.push({ label: "This Weekend", until: at(6 - dow, 9) });
    out.push({ label: "Next Week", until: at(((8 - dow) % 7) || 7, 8) });
    return out;
  }

  // When something comes back, said briefly: "6:00 pm", "Tomorrow 8:00 am", "Sat 9:00 am", "12 Nov"
  function fmtWhen(ts) {
    const d = new Date(ts);
    const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
    const today = startOfDay(Date.now());
    if (ts < today + dayMs) return time;
    if (ts < today + 2 * dayMs) return `Tomorrow ${time}`;
    if (ts < today + 7 * dayMs) return `${d.toLocaleDateString(locale, { weekday: "short" })} ${time}`;
    return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  }

  function laterMenu(anchor, t) {
    showMenu(
      anchor,
      [
        ...laterChoices().map((c) => ({ label: c.label, hint: c.timeOnly ? new Date(c.until).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }) : fmtWhen(c.until), action: () => act(t.id, "snooze", { until: c.until }) })),
        "-",
        { label: "Choose a Time…", icon: "calendar", action: () => pickTime(t) },
        t.snoozeUntil && { label: "Back to Inbox Now", icon: "inbox", action: () => act(t.id, "unsnooze") },
      ],
      { title: t.snoozeUntil ? `Comes back ${fmtWhen(t.snoozeUntil)}` : "Bring it back…" }
    );
    closeOpenSwipe();
  }

  // A date and time of one's own, in a small glass card
  function pickTime(t) {
    closeMenu(true);
    const pad = (n) => String(n).padStart(2, "0");
    const local = (ms) => {
      const d = new Date(ms);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const input = h("input.when", { type: "datetime-local", value: local(at(1, 8)), min: local(Date.now() + 60000) });
    const layer = h("div.menu-layer.center");
    const close = () => closeMenu();
    const set = () => {
      const until = new Date(input.value).getTime();
      if (!Number.isFinite(until) || until <= Date.now()) return toast("Choose a time in the future", { icon: "clock", error: true });
      close();
      act(t.id, "snooze", { until });
    };
    const card = h(
      "div.menu.picker",
      { role: "dialog", "aria-label": "Choose a Time" },
      h("div.menu-title", "Bring it back on…"),
      input,
      h("div.picker-btns", h("button.pbtn", { type: "button", onclick: close }, "Cancel"), h("button.pbtn.primary", { type: "button", onclick: set }, "Later"))
    );
    layer.addEventListener("pointerdown", (e) => e.target === layer && close());
    input.addEventListener("keydown", (e) => e.key === "Enter" && set());
    card.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const f = [...card.querySelectorAll("input,button")];
      if (e.shiftKey && document.activeElement === f[0]) (e.preventDefault(), f[f.length - 1].focus());
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) (e.preventDefault(), f[0].focus());
    });
    layer.append(card);
    document.body.append(layer);
    // (a menu as far as Esc and the focus are concerned)
    menuState = { layer, menu: card, opener: document.activeElement };
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("open")));
    input.focus({ preventScroll: true });
  }

  // Everything a conversation can do, for the More swipe button and for pressing and holding (or right-clicking) a row
  function rowItems(t, anchor) {
    const lead = leadAction(t);
    return [
      { label: "Reply", icon: "reply", action: () => withReplyTarget(t.id, (m) => openCompose(replyDraft(m, "reply"))) },
      { label: "Forward", icon: "forward", action: () => withReplyTarget(t.id, (m) => openCompose(replyDraft(m, "forward"))) },
      "-",
      { label: lead.act === "done" ? "Done" : lead.label, icon: lead.ic, action: () => act(t.id, lead.act) },
      !t.trashed && { label: "Later…", icon: "clock", action: () => laterMenu(anchor, t) },
      { label: t.starred ? "Unflag" : "Flag", icon: "flag", action: () => act(t.id, t.starred ? "unflag" : "flag") },
      { label: t.unread ? "Mark as Read" : "Mark as Unread", icon: t.unread ? "envelopeOpen" : "envelopeBadge", action: () => act(t.id, t.unread ? "read" : "unread") },
      ...categoryItems(t),
      "-",
      t.trashed
        ? { label: "Delete Forever", icon: "trash", destructive: true, action: () => confirmDelete(anchor, t.id) }
        : { label: "Move to Trash", icon: "trash", destructive: true, action: () => act(t.id, "trash") },
    ];
  }

  function rowMoreMenu(anchor, t) {
    showMenu(anchor, rowItems(t, anchor));
    closeOpenSwipe();
  }

  // Unsubscribe, asked first, with how often you actually open them
  async function unsubSheet(t) {
    closeMenu(true);
    let info;
    try {
      info = await api.unsubInfo(t.id);
    } catch (err) {
      return toast(err.message, { error: true });
    }
    const who = displayName(info.sender) || info.sender.email;
    const layer = h("div.menu-layer.center.unsub-layer");
    const close = () => closeMenu();
    const go = h("button.pbtn.danger-btn", { type: "button" }, "Unsubscribe");
    go.addEventListener("click", async () => {
      go.disabled = true;
      go.textContent = "Unsubscribing…";
      try {
        const r = await api.unsubscribe(t.id);
        close();
        if (r.open) {
          window.open(r.open, "_blank", "noopener");
          return toast(`Finish on ${who}'s page`, { icon: "news" });
        }
        toast(`Unsubscribed from ${who}`, { icon: "check" });
        refreshCounts();
        loadList({ quiet: true });
      } catch (err) {
        go.disabled = false;
        go.textContent = "Unsubscribe";
        toast(err.message, { error: true });
      }
    });
    const card = h(
      "div.menu.unsub-card",
      { role: "dialog", "aria-label": `Unsubscribe from ${who}` },
      avatar(info.sender, "unsub-av"),
      h("h3", `Unsubscribe from ${who}?`),
      h(
        "p",
        info.of > 1 ? `You've opened ${info.opened} of their last ${info.of} emails. ` : "",
        info.how === "page" ? "Mail will open their page to finish." : "Mail will ask them to stop, and move what's here to Done."
      ),
      go,
      h("button.pbtn.quiet-btn", { type: "button", onclick: close }, "Cancel")
    );
    layer.addEventListener("pointerdown", (e) => e.target === layer && close());
    layer.append(card);
    document.body.append(layer);
    menuState = { layer, menu: card, opener: document.activeElement };
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("open")));
    go.focus({ preventScroll: true });
  }

  // Pressed and held: the row lifts out of the list, the rest dims, and its menu opens under it
  function rowActions(row, t) {
    closeOpenSwipe(true);
    if (navigator.vibrate) navigator.vibrate(10);
    showMenu(row, rowItems(t, row));
    if (!menuState) return;
    const { layer } = menuState;
    layer.classList.add("lift-layer");
    const r = row.getBoundingClientRect();
    const lifted = row.cloneNode(true);
    lifted.classList.add("lifted-row");
    lifted.removeAttribute("tabindex");
    lifted.setAttribute("aria-hidden", "true");
    Object.assign(lifted.style, { top: `${r.top}px`, left: `${r.left + 8}px`, width: `${r.width - 16}px`, height: `${r.height}px` });
    lifted.addEventListener("click", () => closeMenu());
    layer.prepend(lifted);
    requestAnimationFrame(() => layer.classList.add("open"));
  }

  // People or Updates, for this conversation, or for everything from its sender
  function categoryItems(t) {
    const other = t.category === "updates" ? "people" : "updates";
    const label = other === "people" ? "People" : "Updates";
    const sender = t.from && !t.people?.every((p) => p.me) ? displayName(t.from) : null;
    return [
      { label: `Move to ${label}`, icon: other === "people" ? "person" : "news", action: () => act(t.id, "category", { category: other }) },
      sender && { label: `Always Show ${sender} in ${label}`, icon: "pin", action: () => act(t.id, "category", { category: other, sender: true }) },
    ];
  }

  // ---------------------------------------------------------------------------
  // Acting on a conversation (at once on screen, then on the server)
  // ---------------------------------------------------------------------------

  const PATCH = {
    done: { done: true, snoozeUntil: null },
    inbox: { done: false },
    read: { unread: 0 },
    unread: { unread: 1 },
    flag: { starred: true },
    unflag: { starred: false },
    trash: { trashed: true, snoozeUntil: null },
    restore: { trashed: false },
    unsnooze: { snoozeUntil: null },
  };

  // Whether a conversation still belongs in the list being shown
  function inView(t) {
    if (S.query) return !t.trashed;
    if (S.view === "trash") return t.trashed;
    if (t.trashed) return false;
    if (S.category && t.category !== S.category) return false;
    switch (S.view) {
      case "all":
        return !t.done && !t.snoozeUntil;
      case "unread":
        return t.unread > 0 && !t.done && !t.snoozeUntil;
      case "flagged":
        return t.starred;
      case "attachments":
        return t.hasAttachments;
      case "done":
        return t.done;
      case "later":
        return !!t.snoozeUntil;
    }
    return true;
  }

  async function act(id, action, extra = {}, { quiet } = {}) {
    if (action === "done" || action === "snooze") dismissSwipeHint();
    const t = S.threads.find((x) => x.id === id);
    const patch = action === "category" ? { category: extra.category } : action === "snooze" ? { snoozeUntil: extra.until, done: false } : PATCH[action] || {};
    if (t) Object.assign(t, patch);
    if (S.thread?.id === id) Object.assign(S.thread, patch);
    const leaving = !!t && !inView(t);
    if (leaving && S.selectedId === id) await leaveThread(id);
    if (leaving) removeRow(id);
    else updateRow(id);
    markSelectedRow();
    if (S.thread?.id === id) {
      renderDetailChrome();
      if (["snooze", "unsnooze", "category", "flag", "unflag"].includes(action)) renderConvHead();
    }
    if (!quiet) actionToast(id, action, extra, t);
    try {
      await api.threadAction(id, { action, ...extra });
    } catch (err) {
      toast(err.message, { error: true });
      loadList({ quiet: true });
    }
    refreshCounts();
    // (back where it was, after an undo: in the list again)
    if (!t && ["inbox", "restore", "unsnooze"].includes(action)) loadList({ quiet: true });
  }

  function actionToast(id, action, extra, t) {
    const undo = (back) => ({ actionLabel: "Undo", duration: 4000, action: () => act(id, back) });
    if (action === "done") toast("Done", { icon: "check", ...undo("inbox") });
    else if (action === "inbox") toast("Back in Inbox", { icon: "inbox" });
    else if (action === "trash") toast("Moved to Trash", { icon: "trash", ...undo("restore") });
    else if (action === "restore") toast("Restored", { icon: "inbox" });
    else if (action === "snooze") toast(`Later: ${fmtWhen(extra.until)}`, { icon: "clock", ...undo(t?.done ? "inbox" : "unsnooze") });
    else if (action === "unsnooze") toast("Back in Inbox", { icon: "inbox" });
    else if (action === "category") {
      const where = extra.category === "people" ? "People" : "Updates";
      toast(extra.sender && t?.from ? `${displayName(t.from)} will always show in ${where}` : `Moved to ${where}`, { icon: extra.category === "people" ? "person" : "news" });
    }
  }

  async function deleteThread(id) {
    await leaveThread(id);
    removeRow(id);
    try {
      await api.threadAction(id, { action: "delete" });
      toast("Deleted", { icon: "trash" });
    } catch (err) {
      toast(err.message, { error: true });
      loadList({ quiet: true });
    }
    refreshCounts();
  }

  // If the conversation being acted on is open, move away from it first.
  async function leaveThread(id) {
    if (S.selectedId !== id) return;
    if (S.layout === "phone") {
      if (S.depth === 1) {
        goBack();
        await wait(420);
      }
      S.selectedId = null;
      return;
    }
    const i = S.threads.findIndex((t) => t.id === id);
    const next = S.threads[i + 1] || S.threads[i - 1];
    if (next && next.id !== id) openThread(next.id);
    else {
      S.selectedId = null;
      S.thread = null;
      renderDetail();
    }
  }

  async function markAllRead() {
    const ids = S.threads.filter((t) => t.unread).map((t) => t.id);
    if (!ids.length) return;
    for (const id of ids) Object.assign(S.threads.find((t) => t.id === id), PATCH.read);
    if (S.view === "unread") {
      S.threads = [];
    }
    renderRows();
    try {
      await api.threadBatch({ ids, action: "read" });
    } catch (err) {
      toast(err.message, { error: true });
    }
    refreshCounts();
  }

  // (forever: asked first)
  async function confirmDelete(anchor, id) {
    if (await confirmMenu(anchor, "This conversation will be deleted. This can’t be undone.", "Delete Forever", { destructive: true })) deleteThread(id);
  }

  async function emptyTrash(anchor) {
    const n = S.counts.trash || S.threads.length;
    const sure = await confirmMenu(
      anchor || els.listNavTitle,
      `${n === 1 ? "1 conversation" : `${n || "All"} conversations`} will be deleted. This can’t be undone.`,
      "Empty Trash",
      { destructive: true }
    );
    if (!sure) return;
    S.threads = [];
    renderRows();
    if (S.thread?.trashed) {
      S.thread = null;
      S.selectedId = null;
      renderDetail();
    }
    try {
      await api.emptyTrash();
      toast("Trash Emptied", { icon: "trash" });
    } catch (err) {
      toast(err.message, { error: true });
    }
    refreshCounts();
  }

  async function refreshCounts() {
    try {
      S.counts = await api.counts();
      renderListChrome();
      updateBadge();
      // (the caught-up screen shows these figures too)
      if (!S.threads.length && !S.drafts.length && !S.loading) renderRows();
    } catch {}
  }

  function updateBadge() {
    const n = S.counts.inbox?.unread || 0;
    document.title = n ? `Mail (${n})` : "Mail";
    try {
      if (navigator.setAppBadge) n ? navigator.setAppBadge(n) : navigator.clearAppBadge();
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // A conversation: every message in it, newest first; the newest (and any unread) open
  // ---------------------------------------------------------------------------

  async function loadBody(id) {
    if (S.bodies.has(id)) return S.bodies.get(id);
    const m = await api.message(id);
    // (the most recent few dozen kept: newsletters can be large)
    if (S.bodies.size >= 30) S.bodies.delete(S.bodies.keys().next().value);
    S.bodies.set(id, m);
    return m;
  }

  // Replies go to the newest message someone else sent (or the newest, if it's all yours)
  async function withReplyTarget(threadId, fn) {
    try {
      const t = S.thread?.id === threadId && S.thread.messages ? S.thread : await api.thread(threadId);
      const target = t.messages.find((m) => m.folder !== "sent") || t.messages[0];
      fn(await loadBody(target.id));
    } catch (err) {
      toast(err.message, { error: true });
    }
  }

  async function openThread(id, { fromNav } = {}) {
    // (a search that found what you opened: kept among the recent ones)
    if (S.query) rememberSearch(S.query);
    S.selectedId = id;
    markSelectedRow();
    const t = S.threads.find((x) => x.id === id);
    S.thread = { ...(t || { id, people: [], subject: "" }), messages: null, loading: true };
    renderDetail();
    if (S.layout === "phone" && !fromNav) pushDepth(1);
    // (the conversation's heading takes the focus, so VoiceOver reads it and the keyboard carries on from there)
    if (S.layout === "phone" || document.activeElement?.closest?.(".row")) els.detailScroll.querySelector(".conv-head")?.focus({ preventScroll: true });
    const token = ++S.detailToken;
    try {
      const full = await api.thread(id);
      if (token !== S.detailToken) return;
      S.expanded = new Set([full.messages[0]?.id, ...full.messages.filter((m) => m.unread && m.folder === "inbox").map((m) => m.id)].filter(Boolean));
      await Promise.all([...S.expanded].map((mid) => loadBody(mid).catch(() => null)));
      if (token !== S.detailToken) return;
      S.thread = full;
      renderDetail({ keepScroll: true });
      scrollToNewest();
      if (full.unread) act(id, "read", {}, { quiet: true });
    } catch (err) {
      if (token === S.detailToken) toast(err.message, { error: true });
    }
  }

  function stepThread(dir) {
    const i = S.threads.findIndex((t) => t.id === S.selectedId);
    const next = S.threads[i + dir];
    if (next) openThread(next.id, { fromNav: true });
  }

  function renderDetailChrome() {
    if (!els.detailNav) return;
    const t = S.thread;
    const i = t ? S.threads.findIndex((x) => x.id === t.id) : -1;
    setKids(
      els.detailNav,
      S.layout === "phone" ? gbtn("chevronLeft", `Back to ${listTitle()}`, goBack) : null,
      // (the conversation's subject beside the way back, in the bar, as the list has its title beside your photo)
      t
        ? h(
            "div.bar-title",
            { role: "heading", "aria-level": "1", title: t.subject || "(No Subject)" },
            t.starred ? icon("flagFill", "flag-ic") : null,
            h("span", t.subject || "(No Subject)"),
            // (on iPhone, where the list's title is out of sight, the dot comes with you)
            S.layout === "phone" ? statusDot() : null
          )
        : null,
      h("div.spacer"),
      // (on iPhone the subject has the room; going to the next conversation is back and another tap)
      t && S.layout !== "phone"
        ? h(
            "div.gcap.glass",
            h("button", { "aria-label": "Previous Conversation", disabled: i <= 0, onclick: () => stepThread(-1) }, icon("chevronUp")),
            h("button", { "aria-label": "Next Conversation", disabled: i < 0 || i >= S.threads.length - 1, onclick: () => stepThread(1) }, icon("chevronDown"))
          )
        : null,
      t ? gbtn("more", "More", (e) => detailMenu(e.currentTarget)) : null
    );
    els.detailNavTitle.textContent = t?.subject || "";
    const lead = t && leadAction(t);
    // (what to do with it, as pills; and a reply written right here, without the compose sheet)
    setKids(
      els.detailToolbar,
      ...(t
        ? [
            h(
              "div.d-acts",
              h(
                `button.d-pill.glass${lead.act === "done" ? ".done-pill" : ""}`,
                { type: "button", onclick: () => act(t.id, lead.act) },
                icon(lead.ic),
                lead.act === "done" ? "Done" : lead.label
              ),
              t.trashed ? null : h("button.d-pill.glass", { type: "button", onclick: (e) => laterMenu(e.currentTarget, t) }, icon("clock"), "Later"),
              h(
                "button.d-pill.glass.icon-only",
                { type: "button", "aria-label": t.trashed ? "Delete Forever" : "Move to Trash", onclick: (e) => (t.trashed ? confirmDelete(e.currentTarget, t.id) : act(t.id, "trash")) },
                icon("trash")
              )
            ),
            quickReply(t),
          ]
        : [])
    );
  }

  // A reply written in the bar at the foot of a conversation: to whoever wrote last, sent (with Undo) as the compose
  // sheet sends; the button beside it opens Reply All, Forward and the full sheet
  let qrKeep = null;
  function quickReply(t) {
    // (the same field while the same conversation is open, so redrawing the bar keeps what's typed, and the focus)
    if (qrKeep && qrKeep.id === t.id && qrKeep.ready === !!t.messages) return qrKeep.el;
    const el = buildQuickReply(t);
    qrKeep = { id: t.id, ready: !!t.messages, el };
    return el;
  }

  function buildQuickReply(t) {
    const last = t.messages?.find((m) => m.folder !== "sent");
    const who = last ? (displayName(last.from) || "").split(/\s+/)[0] : "";
    const field = h("textarea.qr-field", { rows: 1, placeholder: who ? `Reply to ${who}…` : "Reply…", "aria-label": who ? `Reply to ${who}` : "Reply", enterkeyhint: "send" });
    const send = h("button.qr-send", { type: "button", "aria-label": "Send", disabled: true }, icon("arrowUp"));
    const grow = () => {
      field.style.height = "auto";
      field.style.height = `${Math.min(field.scrollHeight, 120)}px`;
      send.disabled = !field.value.trim();
    };
    field.addEventListener("input", grow);
    const go = () => {
      const text = field.value.trim();
      if (!text) return;
      field.value = "";
      grow();
      field.blur();
      withReplyTarget(t.id, (m) => {
        const c = replyDraft(m, "reply");
        c.text = text;
        queueSend(c);
      });
    };
    send.addEventListener("click", go);
    field.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.preventDefault(), go());
    });
    return h(
      "div.qr.glass",
      h("button.qr-more", { type: "button", "aria-label": "Reply All, Forward and more", disabled: !!t.loading, onclick: (e) => replyMenu(e.currentTarget) }, icon("reply")),
      field,
      send
    );
  }

  function replyMenu(anchor) {
    const t = S.thread;
    if (!t) return;
    showMenu(anchor, [
      { label: "Reply", icon: "reply", action: () => withReplyTarget(t.id, (m) => openCompose(replyDraft(m, "reply"))) },
      { label: "Reply All", icon: "replyAll", action: () => withReplyTarget(t.id, (m) => openCompose(replyDraft(m, "replyAll"))) },
      { label: "Forward", icon: "forward", action: () => withReplyTarget(t.id, (m) => openCompose(replyDraft(m, "forward"))) },
    ]);
  }

  function detailMenu(anchor) {
    const t = S.thread;
    if (!t) return;
    const newest = t.messages?.find((m) => m.folder !== "sent");
    showMenu(anchor, [
      { label: t.starred ? "Unflag" : "Flag", icon: "flag", action: () => act(t.id, t.starred ? "unflag" : "flag") },
      { label: "Mark as Unread", icon: "envelopeBadge", action: () => act(t.id, "unread") },
      "-",
      ...categoryItems(t),
      "-",
      !DEMO && newest && { label: "Download Original", icon: "download", action: () => window.open(api.rawUrl(newest.id), "_blank") },
      t.trashed && { label: "Delete Forever", icon: "trash", destructive: true, action: () => deleteThread(t.id) },
    ]);
  }

  function renderDetail({ keepScroll } = {}) {
    if (!els.detail) return;
    const t = S.thread;
    renderDetailChrome();
    els.detailEmpty.style.display = t ? "none" : "";
    const top = els.detailScroll.scrollTop;
    if (!t) {
      setKids(els.detailScroll);
      return;
    }
    const content = h(
      "div",
      { class: keepScroll ? null : "content-in" },
      convHead(t),
      // (oldest first, as a conversation reads; the newest at the foot, by the reply)
      t.loading || !t.messages ? h("div.load-more", h("div.spinner")) : h("div.msgs", [...t.messages].reverse().map(messageCard))
    );
    setKids(els.detailScroll, content);
    els.detailScroll.scrollTop = keepScroll ? top : 0;
    els.detail.classList.toggle("scrolled", els.detailScroll.scrollTop > 28);
  }

  // (opened: at the newest message, with the earlier ones above it)
  function scrollToNewest() {
    const cards = els.detailScroll.querySelectorAll(".mcard");
    if (cards.length < 2) return;
    const card = [...cards].find((c) => c.classList.contains("unread") && c.classList.contains("open")) || cards[cards.length - 1];
    const top = card.getBoundingClientRect().top - els.detailScroll.getBoundingClientRect().top + els.detailScroll.scrollTop;
    els.detailScroll.scrollTop = Math.max(0, top - 120);
    els.detail.classList.toggle("scrolled", els.detailScroll.scrollTop > 28);
  }

  // Only the conversation's heading again (flagged, Later, People or Updates), leaving its messages as they are
  function renderConvHead() {
    const old = els.detailScroll?.querySelector(".conv-head");
    if (!old || !S.thread) return renderDetail({ keepScroll: true });
    old.replaceWith(convHead(S.thread));
  }

  // Only one message again (opened or closed, remote images loaded); the others' frames keep their place
  function renderCard(id) {
    const m = S.thread?.messages?.find((x) => x.id === id);
    const old = els.detailScroll?.querySelector(`.mcard[data-mid="${CSS.escape(id)}"]`);
    if (!m || !old) return renderDetail({ keepScroll: true });
    old.replaceWith(messageCard(m));
  }

  function convHead(t) {
    // (who's in it, their faces stacked, and how many messages; where it is, only when it's put away)
    const ps = (t.people || []).slice(0, 4);
    const names = ps.map((p) => (p.me ? "you" : (p.name || p.email || "").split(/[\s@]/)[0]));
    const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] || "";
    const meta = h(
      "div.conv-meta",
      ps.length > 1 ? h("span.conv-faces", ps.map((p) => avatar(p.me ? { name: S.me?.displayName, email: p.email, me: true } : p, "face"))) : null,
      h("span", [who && who[0].toUpperCase() + who.slice(1), t.count > 1 && `${t.count} messages`, t.trashed ? "In Trash" : t.done && "Done"].filter(Boolean).join(" · "))
    );
    return h(
      "header.conv-head",
      { tabindex: "-1" },
      meta,
      t.snoozeUntil
        ? h(
            "div.later-note",
            icon("clock"),
            h("span", `Comes back ${fmtWhen(t.snoozeUntil)}`),
            h("button", { type: "button", onclick: () => act(t.id, "unsnooze") }, "Bring Back Now")
          )
        : null
    );
  }

  function messageCard(m) {
    const open = S.expanded.has(m.id);
    const full = S.bodies.get(m.id);
    const me = m.folder === "sent";
    const toLine = [m.to?.length && `to ${m.to.map((p) => (me ? displayName(p) : p.email === m.mailbox ? "you" : displayName(p))).join(", ")}`, m.cc?.length && `cc ${m.cc.map(displayName).join(", ")}`]
      .filter(Boolean)
      .join(" · ");
    return h(
      "article.mcard",
      { "data-mid": m.id, class: [open && "open", m.unread && m.folder === "inbox" && "unread"].filter(Boolean).join(" ") || null },
      open
        ? h(
            "button.msg-head",
            { type: "button", "aria-expanded": "true", onclick: () => toggleMessage(m.id) },
            avatar(m.from),
            h("div.msg-meta", h("div.msg-top", h("b", me ? "You" : displayName(m.from)), h("span", fmtListDate(m.date))), h("div.msg-sub", toLine || m.from.email))
          )
        : // (folded: one line, who and what they said)
          h(
            "button.msg-head.folded",
            { type: "button", "aria-expanded": "false", onclick: () => toggleMessage(m.id) },
            avatar(m.from, "fold-av"),
            h("div.msg-line", h("b", me ? "You" : (displayName(m.from) || "").split(/\s+/)[0]), h("span", ` · ${m.snippet || ""}`))
          ),
      open
        ? full
          ? [messageBody(full), full.attachments?.length ? attachmentsEl(full.attachments) : null, h("div.msg-foot", fmtLongDate(m.date))]
          : h("div.load-more", h("div.spinner"))
        : null
    );
  }

  async function toggleMessage(id) {
    if (S.expanded.has(id)) S.expanded.delete(id);
    else {
      S.expanded.add(id);
      renderCard(id);
      try {
        await loadBody(id);
      } catch (err) {
        toast(err.message, { error: true });
      }
    }
    renderCard(id);
  }

  // Quoted replies ("On … wrote:" and what follows) are folded away behind a button, as in Mail.
  function quoteToggle(onToggle) {
    let shown = false;
    const btn = h(
      "button.quote-toggle",
      {
        type: "button",
        "aria-expanded": "false",
        onclick: () => {
          shown = !shown;
          btn.setAttribute("aria-expanded", String(shown));
          btn.lastChild.textContent = shown ? "Hide Quoted Text" : "Show Quoted Text";
          onToggle(shown);
        },
      },
      icon("more"),
      h("span", "Show Quoted Text")
    );
    return btn;
  }

  const ATTRIBUTION = /^(on\b.+\bwrote:|-{2,}\s*original message\s*-{2,}|le .+ a écrit\s*:|am .+ schrieb .+:)\s*$/i;

  function messageBody(m) {
    if (m.html && m.html.trim()) return htmlFrame(m);
    const lines = (m.text || "").replace(/\r\n/g, "\n").split("\n");
    let cut = lines.findIndex((l, i) => /^\s*>/.test(l) || (ATTRIBUTION.test(l.trim()) && lines.slice(i + 1).some((x) => /^\s*>/.test(x))));
    if (cut > 0 && !lines.slice(0, cut).join("").trim()) cut = -1;
    const render = (ls) =>
      ls
        .map((l) => {
          const e = linkify(escapeHtml(l));
          return /^\s*&gt;/.test(e) ? `<span class="quote">${e.replace(/^\s*(&gt;\s?)+/, "")}</span>` : e;
        })
        .join("\n")
        .replace(/<\/span>\n<span class="quote">/g, "\n");
    if (cut < 0) {
      const html = render(lines).trim();
      return h("div.mail-body", { html: html || '<span style="color:var(--label-2)">This message has no content.</span>' });
    }
    const quoted = h("div.mail-body.quoted", { html: render(lines.slice(cut)).trim(), hidden: true });
    return [
      h("div.mail-body", { html: render(lines.slice(0, cut)).trimEnd() }),
      h("div.quote-row", quoteToggle((show) => (quoted.hidden = !show))),
      quoted,
    ];
  }

  // Designed emails (their own backgrounds) keep a white card; plain ones take the app's own colours, dark mode too.
  const DESIGNED = /\bbgcolor\s*=|background(-color|-image)?\s*:|<(table|td|body)[^>]*\sbackground\s*=/i;

  function htmlFrame(m) {
    const remotePattern = /(src|background)\s*=\s*["']?\s*https?:|url\(\s*["']?https?:/i;
    const hasRemote = remotePattern.test(m.html);
    const allowRemote = S.remoteImages || m._loadRemote;
    const designed = DESIGNED.test(m.html);
    const csp = allowRemote
      ? "default-src 'none'; img-src 'self' data: https: http:; style-src 'unsafe-inline' https:; font-src data: https:; media-src https:"
      : "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src data:";
    const dark = isDark();
    const css = getComputedStyle(document.documentElement);
    const v = (n) => css.getPropertyValue(n).trim();
    const look = designed
      ? `:root{color-scheme:light}
html,body{margin:0;padding:0;background:#fff}
body{padding:16px;font:15px/1.5 -apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:#1c1c1e}
blockquote{margin:8px 0;padding-left:12px;border-left:2px solid #c7c7cc;color:#555}
a{color:#0a84ff}`
      : `:root{color-scheme:${dark ? "dark" : "light"}}
html,body{margin:0;padding:0;background:transparent}
body{padding:14px 20px 8px;font:17px/1.45 -apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:${v("--mail-text")}}
blockquote{margin:8px 0;padding-left:12px;border-left:2px solid ${v("--mail-rule")};color:${v("--mail-quote")}}
a{color:${v("--mail-link")}}
${dark ? `body *{color:inherit!important;background-color:transparent!important}
blockquote{border-left-color:${v("--mail-rule")}!important;color:${v("--mail-quote")}!important}
a,a *{color:${v("--mail-link")}!important}` : ""}`;
    const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="x-dns-prefetch-control" content="off">
<base target="_blank">
<style>
${look}
html,body{touch-action:pan-x pan-y}
body{overflow-wrap:anywhere;-webkit-text-size-adjust:100%}
img{max-width:100%;height:auto}
pre{white-space:pre-wrap}
.inflite-q{display:none!important}
.inflite-showq .inflite-q{display:revert!important}
</style></head><body>${m.html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<(link|meta|base)\b[^>]*>/gi, "")}</body></html>`;

    const frame = h("iframe.mail-frame", {
      style: { colorScheme: designed ? "light" : dark ? "dark" : "light" },
      title: "Message content",
      sandbox: "allow-same-origin allow-popups allow-popups-to-escape-sandbox",
      referrerpolicy: "no-referrer",
      srcdoc: doc,
    });

    // Sized to its content, without ever collapsing it first (which would throw the reader's scroll back to the top):
    // wide newsletters are shrunk to fit, as in Mail; the height follows the body as images arrive.
    const fit = () => {
      const d = frame.contentDocument;
      if (!d?.body) return;
      const b = d.body.getBoundingClientRect();
      const px = Math.ceil(b.bottom + (parseFloat(d.defaultView.getComputedStyle(d.body).marginBottom) || 0));
      if (Math.abs(px - frame.offsetHeight) > 1) frame.style.height = `${px}px`;
    };
    let lastWidth = 0;
    const fitWidth = () => {
      const d = frame.contentDocument;
      if (!d?.body) return;
      const avail = frame.clientWidth;
      if (!avail || avail === lastWidth) return fit();
      lastWidth = avail;
      d.body.style.zoom = "";
      const sw = d.documentElement.scrollWidth;
      if (sw > avail + 2) d.body.style.zoom = String(Math.max(0.4, avail / sw));
      fit();
    };

    const toggleRow = h("div.quote-row", { hidden: true });
    frame.addEventListener("load", () => {
      const d = frame.contentDocument;
      if (foldQuotes(d)) {
        setKids(
          toggleRow,
          quoteToggle((show) => {
            frame.contentDocument?.documentElement.classList.toggle("inflite-showq", show);
            fit();
          })
        );
        toggleRow.hidden = false;
      }
      lastWidth = 0;
      fitWidth();
      if (!d?.body) return;
      // (images arriving, fonts, quotes shown: whatever changes the body's size)
      const ro = new ResizeObserver(() => (frame.isConnected ? fit() : ro.disconnect()));
      ro.observe(d.body);
      const rw = new ResizeObserver(() => (frame.isConnected ? fitWidth() : rw.disconnect()));
      rw.observe(frame);
      d.addEventListener("load", fit, true);
      for (const ev of ["gesturestart", "gesturechange", "gestureend"]) d.addEventListener(ev, noZoom, { passive: false });
    });

    const parts = [];
    if (hasRemote && !allowRemote) {
      parts.push(
        h(
          "div.banner",
          icon("photo"),
          "Remote images are hidden to protect your privacy.",
          h(
            "button",
            {
              onclick: () => {
                m._loadRemote = true;
                renderCard(m.id);
              },
            },
            "Load"
          )
        )
      );
    }
    parts.push(h(`div.mail-frame-wrap${designed ? "" : ".plain"}`, frame), toggleRow);
    return parts;
  }

  // Marks the quoted part of an HTML reply (Apple Mail, Gmail, Outlook) so it can be folded. → whether there was one
  function foldQuotes(d) {
    if (!d?.body) return false;
    const marked = [];
    const mark = (el) => {
      el.classList.add("inflite-q");
      marked.push(el);
    };
    const candidates = [...d.querySelectorAll('blockquote[type="cite"], .gmail_quote, blockquote')];
    for (const el of candidates) if (!el.parentElement?.closest('blockquote, .gmail_quote, .inflite-q')) mark(el);
    // Outlook: everything from its reply header on
    const ol = d.querySelector('#divRplyFwdMsg, [id^="divRplyFwdMsg"], #appendonsend');
    if (ol) for (let el = ol; el; el = el.nextElementSibling) mark(el);
    // An "On … wrote:" line just before a quote
    for (const el of marked.slice()) {
      const prev = el.previousElementSibling;
      if (prev && !prev.classList.contains("inflite-q") && ATTRIBUTION.test((prev.textContent || "").trim())) mark(prev);
    }
    if (!marked.length) return false;
    // Never fold away the whole message (a forward, say).
    if (!(d.body.innerText || "").trim()) {
      marked.forEach((el) => el.classList.remove("inflite-q"));
      return false;
    }
    return true;
  }

  // A message's files: its pictures as a gallery, the rest as cards; a picture, PDF or video opens in the viewer
  const kindOf = (a) =>
    /^image\/(png|jpe?g|gif|webp|avif|heic|heif|bmp|svg\+xml)$/i.test(a.type || "")
      ? "image"
      : /^application\/pdf$/i.test(a.type || "") || /\.pdf$/i.test(a.filename || "")
        ? "pdf"
        : /^video\/(mp4|quicktime|webm|x-m4v)$/i.test(a.type || "")
          ? "video"
          : null;
  const downloadUrl = (url) => (url.startsWith("/api/") && !url.includes("?") ? `${url}?download` : url);
  const extOf = (name) => (/\.([a-z0-9]{1,5})$/i.exec(name || "")?.[1] || "").toUpperCase();

  function attachmentsEl(list) {
    const pics = list.filter((a) => kindOf(a) === "image");
    const files = list.filter((a) => kindOf(a) !== "image");
    const shown = pics.slice(0, 6);
    return h(
      "div.attachments",
      pics.length
        ? h(
            "div.gallery",
            { class: `n${Math.min(shown.length, 3)}`, role: "list" },
            shown.map((a, i) =>
              h(
                "button.g-tile",
                { type: "button", role: "listitem", "aria-label": `${a.filename}, ${fmtSize(a.size)}`, onclick: (e) => openViewer(a, e.currentTarget) },
                h("img", { src: a.url, alt: "", loading: "lazy", decoding: "async" }),
                i === shown.length - 1 && pics.length > shown.length ? h("span.g-more", `+${pics.length - shown.length}`) : null
              )
            )
          )
        : null,
      files.length
        ? h(
            "div.files",
            files.map((a) => {
              const kind = kindOf(a);
              const ext = extOf(a.filename);
              const inner = [
                h("span.att-ic", { class: kind ? `k-${kind}` : null, "data-ext": ext.slice(0, 4) || null }, ext && ext.length <= 4 ? h("b", ext) : icon("doc")),
                h("div", attName(a.filename), h("div.att-size", [kind === "pdf" ? "PDF Document" : kind === "video" ? "Video" : null, fmtSize(a.size)].filter(Boolean).join(" · "))),
                icon(kind ? "chevronRight" : "download", "att-go"),
              ];
              return kind
                ? h("button.att", { type: "button", onclick: (e) => openViewer(a, e.currentTarget) }, inner)
                : h("a.att", { href: downloadUrl(a.url), download: a.filename, rel: "noopener" }, inner);
            })
          )
        : null
    );
  }

  // ---------------------------------------------------------------------------
  // The viewer: a conversation's pictures, PDFs and videos, full screen, swiped through, pinched to zoom
  // ---------------------------------------------------------------------------

  let viewer = null;

  // (everything in the conversation that opens here, oldest first, as it reads)
  function conversationMedia() {
    const out = [];
    for (const m of [...(S.thread?.messages || [])].reverse()) for (const a of S.bodies.get(m.id)?.attachments || []) if (kindOf(a)) out.push(a);
    return out;
  }

  function openViewer(a, from) {
    if (viewer) return;
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
          h("iframe.v-pdf", { src: x.url, title: x.filename }),
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
      if (!viewer) return;
      viewer = null;
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
      if (tr && tr.width && b && zoom[index].s <= 1.01) {
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
          const blob = await fetch(x.url, { credentials: "same-origin" }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error("Couldn't get that file."))));
          const file = new File([blob], x.filename || "attachment", { type: x.type || blob.type });
          if (navigator.canShare({ files: [file] })) return await navigator.share({ files: [file] });
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
          clearTimeout(viewer?.tapTimer);
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
          if (viewer) viewer.tapTimer = setTimeout(() => el.classList.toggle("bare"), 280);
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

    viewer = { close, el };
  }

  // ---------------------------------------------------------------------------
  // Compose
  // ---------------------------------------------------------------------------

  let sheetState = null;
  let sheetOpener = null;

  function mine(email) {
    const e = (email || "").toLowerCase();
    return (S.me?.identities || []).includes(e) || e.endsWith(`@${S.me?.domain || "inflite.ai"}`);
  }

  function dedupe(list) {
    const seen = new Set();
    return list.filter((p) => {
      const k = p.email.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function replyDraft(m, mode) {
    const defaultFrom = S.me?.defaultFrom;
    const from =
      m.folder === "sent" ? m.from.email : m.mailbox && mine(m.mailbox) ? m.mailbox : defaultFrom;
    let to = [];
    let cc = [];
    if (mode !== "forward") {
      if (m.folder === "sent") {
        to = m.to.slice();
        if (mode === "replyAll") cc = (m.cc || []).slice();
      } else {
        const rt = m.replyTo || m.from.email;
        to = [{ name: m.replyTo ? "" : m.from.name, email: rt }];
        if (mode === "replyAll") {
          cc = dedupe([...(m.to || []), ...(m.cc || [])].filter((p) => !mine(p.email) && p.email.toLowerCase() !== rt.toLowerCase()));
        }
      }
    }
    const subj = m.subject || "";
    const subject =
      mode === "forward" ? (/^fwd?:/i.test(subj) ? subj : `Fwd: ${subj}`) : /^re:/i.test(subj) ? subj : `Re: ${subj}`;
    const who = m.from.name ? `${m.from.name} <${m.from.email}>` : m.from.email;
    const header =
      mode === "forward"
        ? `Begin forwarded message:\n\nFrom: ${who}\nSubject: ${subj}\nDate: ${fmtQuoteDate(m.date)}\nTo: ${m.to.map((p) => p.email).join(", ")}`
        : `On ${fmtQuoteDate(m.date)}, ${who} wrote:`;
    return {
      mode,
      from,
      to,
      cc,
      subject,
      text: "",
      quote: { header, html: m.html || "", text: m.text || "", forward: mode === "forward" },
      inReplyTo: mode === "forward" ? null : m.messageId,
      references: mode === "forward" ? null : [m.references, m.messageId].filter(Boolean).join(" "),
      attachments:
        mode === "forward"
          ? (m.attachments || []).map((a) => ({ filename: a.filename, type: a.type, size: a.size, url: a.url }))
          : [],
    };
  }

  // A draft's attachments kept with it (as data, since the files picked won't be there next time)
  async function draftAttachments(list) {
    const out = [];
    for (const a of list || []) {
      try {
        const blob = a.file || (a.url ? await (await fetch(a.url, { credentials: "same-origin" })).blob() : null);
        if (blob) out.push({ filename: a.filename, type: a.type || blob.type, size: blob.size, content: await fileToBase64(blob) });
      } catch {}
    }
    return out;
  }

  async function openDraft(id) {
    try {
      const msg = await api.message(id);
      const c = msg.compose || { to: msg.to, cc: msg.cc, subject: msg.subject, text: msg.text };
      c.attachments = (c.attachments || []).map((a) =>
        a.content ? { filename: a.filename, type: a.type, size: a.size, url: `data:${a.type || "application/octet-stream"};base64,${a.content}` } : a
      );
      openCompose({ ...c, draftId: id });
    } catch (err) {
      toast(err.message, { error: true });
    }
  }

  function openCompose(init = {}) {
    if (sheetState) return;
    closeMenu(true);
    const c = {
      mode: init.mode || "new",
      from: init.from || S.me?.defaultFrom || "",
      to: (init.to || []).map((p) => ({ ...p })),
      cc: (init.cc || []).map((p) => ({ ...p })),
      bcc: (init.bcc || []).map((p) => ({ ...p })),
      subject: init.subject || "",
      text: init.text || "",
      quote: init.quote || null,
      inReplyTo: init.inReplyTo || null,
      references: init.references || null,
      attachments: init.attachments || [],
      draftId: init.draftId || null,
      showCc: !!((init.cc && init.cc.length) || (init.bcc && init.bcc.length)),
    };
    const snapshot = JSON.stringify([c.to, c.cc, c.bcc, c.subject, c.text, c.attachments.length]);

    const scrim = h("div.sheet-scrim");
    const titleEl = h("h2");
    const sendBtn = h(
      "button.gbtn.glass.tinted",
      { "aria-label": "Send", title: "Send", onclick: () => doSend() },
      icon("arrowUp")
    );
    const closeBtn = h("button.gbtn.glass", { "aria-label": "Close", title: "Close", onclick: () => requestCloseCompose() }, icon("x"));
    const head = h("div.sheet-head", closeBtn, titleEl, sendBtn);

    const fileInput = h("input", {
      type: "file",
      multiple: true,
      style: { display: "none" },
      onchange: () => addFiles(fileInput.files),
    });

    const fields = {};
    const suggestBox = h("div");

    function tokenField(key, label) {
      const tokens = h("div.tokens");
      const input = h("input", {
        type: "email",
        inputmode: "email",
        autocomplete: "off",
        autocapitalize: "off",
        autocorrect: "off",
        spellcheck: "false",
        enterkeyhint: "next",
        "aria-label": label,
      });
      const field = h("div.field", h("label", `${label}:`), tokens);
      field.addEventListener("click", (e) => {
        if (e.target === field || e.target === tokens) input.focus();
      });
      const draw = () => {
        setKids(tokens, 
          ...c[key].map((p, i) =>
            h(
              "button.token",
              {
                type: "button",
                class: EMAIL_RE.test(p.email) ? null : "invalid",
                title: p.email,
                onclick: (e) => {
                  e.currentTarget.classList.toggle("focused");
                  showMenu(e.currentTarget, [
                    { label: p.email, disabled: true },
                    "-",
                    {
                      label: "Remove",
                      icon: "x",
                      destructive: true,
                      action: () => {
                        c[key].splice(i, 1);
                        draw();
                        update();
                      },
                    },
                  ]);
                },
              },
              p.name || p.email
            )
          ),
          input
        );
      };
      const commit = () => {
        const parts = input.value.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
        if (!parts.length) return false;
        for (const p of parts) c[key].push(parseAddress(p));
        input.value = "";
        draw();
        update();
        return true;
      };
      input.addEventListener("keydown", (e) => {
        if (suggestState.items.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          e.preventDefault();
          suggestState.hl = (suggestState.hl + (e.key === "ArrowDown" ? 1 : -1) + suggestState.items.length) % suggestState.items.length;
          drawSuggest();
          return;
        }
        if (e.key === "Enter" && suggestState.items.length && suggestState.hl >= 0) {
          e.preventDefault();
          pickSuggestion(suggestState.items[suggestState.hl]);
          return;
        }
        if (e.key === "Enter" || e.key === "," || e.key === ";" || (e.key === "Tab" && input.value.trim())) {
          if (commit()) e.preventDefault();
          else if (e.key === "Enter") {
            e.preventDefault();
            focusNext(key);
          }
          clearSuggest();
        } else if (e.key === "Backspace" && !input.value && c[key].length) {
          c[key].pop();
          draw();
          update();
        }
      });
      input.addEventListener("input", () => {
        if (/[,;]/.test(input.value)) {
          commit();
          clearSuggest();
        } else suggest(key, input);
      });
      input.addEventListener("blur", () =>
        setTimeout(() => {
          if (document.activeElement?.closest?.(".suggestions")) return;
          commit();
          if (suggestState.key === key) clearSuggest();
        }, 120)
      );
      input.addEventListener("paste", () => setTimeout(commit, 0));
      draw();
      fields[key] = { field, input, draw };
      return field;
    }

    const suggestState = { key: null, items: [], hl: -1, input: null };
    const suggestFetch = debounce(async (q, key) => {
      try {
        const { contacts } = await api.contacts(q);
        if (suggestState.key !== key || suggestState.input?.value.trim() !== q) return;
        const taken = new Set([...c.to, ...c.cc, ...c.bcc].map((p) => p.email.toLowerCase()));
        suggestState.items = contacts.filter((x) => !taken.has(x.email.toLowerCase())).slice(0, 5);
        suggestState.hl = suggestState.items.length ? 0 : -1;
        drawSuggest();
      } catch {}
    }, 140);

    function suggest(key, input) {
      const q = input.value.trim();
      suggestState.key = key;
      suggestState.input = input;
      if (q.length < 1) return clearSuggest();
      suggestFetch(q, key);
    }

    function clearSuggest() {
      suggestState.items = [];
      suggestState.hl = -1;
      drawSuggest();
    }

    function pickSuggestion(p) {
      const key = suggestState.key;
      c[key].push({ name: p.name || "", email: p.email });
      suggestState.input.value = "";
      fields[key].draw();
      clearSuggest();
      update();
      fields[key].input.focus();
    }

    function drawSuggest() {
      const target = suggestState.key && fields[suggestState.key]?.field;
      if (!suggestState.items.length || !target) {
        setKids(suggestBox);
        return;
      }
      if (suggestBox.previousSibling !== target) target.after(suggestBox);
      setKids(suggestBox, 
        h(
          "div.suggestions",
          suggestState.items.map((p, i) =>
            h(
              "button.suggestion",
              {
                type: "button",
                class: i === suggestState.hl ? "hl" : null,
                onpointerdown: (e) => e.preventDefault(),
                onclick: () => pickSuggestion(p),
              },
              avatar(p),
              h("div", h("b", p.name || p.email), p.name ? h("span", p.email) : null)
            )
          )
        )
      );
    }

    function focusNext(key) {
      if (key === "to" && c.showCc) fields.cc.input.focus();
      else if (key === "cc") fields.bcc.input.focus();
      else subjectInput.focus();
    }

    const ccRow = h("div");
    function drawCcRow() {
      if (c.showCc) {
        setKids(ccRow, tokenField("cc", "Cc"), tokenField("bcc", "Bcc"), fromField());
      } else {
        setKids(ccRow, 
          h(
            "button.field",
            {
              type: "button",
              style: { width: "100%", textAlign: "left", color: "var(--label-2)" },
              onclick: () => {
                c.showCc = true;
                drawCcRow();
                fields.cc.input.focus();
              },
            },
            h("span.flabel", `Cc/Bcc, From: ${c.from}`)
          )
        );
      }
    }

    function fromField() {
      const btn = h(
        "button.from-btn",
        {
          type: "button",
          onclick: () =>
            showMenu(
              btn,
              (S.me?.identities || [c.from]).map((addr) => ({
                label: addr,
                checked: addr === c.from,
                action: () => {
                  c.from = addr;
                  drawCcRow();
                  update();
                },
              })),
              { title: "Send From" }
            ),
        },
        c.from,
        icon("chevronDown")
      );
      return h("div.field", h("span.flabel", "From:"), btn);
    }

    const subjectInput = h("input", {
      type: "text",
      value: c.subject,
      autocomplete: "off",
      enterkeyhint: "next",
      "aria-label": "Subject",
      oninput: () => {
        c.subject = subjectInput.value;
        update();
      },
      onkeydown: (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          textArea.focus();
        }
      },
    });

    const textArea = h("textarea.compose-text", {
      "aria-label": "Message",
      placeholder: "",
      oninput: () => {
        c.text = textArea.value;
        autoGrow();
        update();
      },
    });
    textArea.value = c.text;
    const autoGrow = () => {
      textArea.style.height = "auto";
      textArea.style.height = `${Math.max(220, textArea.scrollHeight)}px`;
    };

    const attsEl = h("div.compose-atts");
    function drawAtts() {
      setKids(attsEl, 
        ...c.attachments.map((a, i) =>
          h(
            "div.att",
            h("span.att-ic", /^image\//.test(a.type) && (a.preview || a.url) ? h("img", { src: a.preview || a.url, alt: "" }) : icon("doc")),
            h("div", attName(a.filename), h("div.att-size", fmtSize(a.size))),
            h(
              "button",
              {
                type: "button",
                "aria-label": `Remove ${a.filename}`,
                onclick: () => {
                  if (a.preview) URL.revokeObjectURL(a.preview);
                  c.attachments.splice(i, 1);
                  drawAtts();
                  update();
                },
              },
              icon("x")
            )
          )
        )
      );
    }

    const MAX_ATTACH = 20 * 1024 * 1024;
    function addFiles(files) {
      for (const f of files) {
        const total = c.attachments.reduce((n, a) => n + (a.size || 0), 0);
        if (total + f.size > MAX_ATTACH) {
          toast("Attachments are limited to 20 MB", { error: true });
          break;
        }
        c.attachments.push({
          filename: f.name,
          type: f.type || "application/octet-stream",
          size: f.size,
          file: f,
          preview: /^image\//.test(f.type) ? URL.createObjectURL(f) : null,
        });
      }
      fileInput.value = "";
      drawAtts();
      update();
    }

    const quoteEl = c.quote
      ? h(
          "div.compose-quote",
          h("div.qh", c.quote.header.split("\n")[0]),
          (c.quote.text || htmlToText(c.quote.html)).slice(0, 2000)
        )
      : null;

    const hint = h("span.hint");
    const body = h(
      "div.sheet-body",
      tokenField("to", "To"),
      ccRow,
      h("div.field", h("label", "Subject:"), subjectInput),
      textArea,
      attsEl,
      quoteEl
    );
    drawCcRow();
    drawAtts();

    const accessory = h(
      "div.compose-accessory",
      h("button.gbtn", { type: "button", "aria-label": "Add Attachment", title: "Add Attachment", onclick: () => fileInput.click() }, icon("clip")),
      hint,
      fileInput
    );

    const sheet = h(
      "div.sheet",
      { role: "dialog", "aria-modal": "true", "aria-label": "New Message" },
      h("div.sheet-grabber"),
      head,
      body,
      accessory
    );

    // Drag files onto the sheet (iPad)
    sheet.addEventListener("dragover", (e) => e.preventDefault());
    sheet.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
    });

    function dirty() {
      return JSON.stringify([c.to, c.cc, c.bcc, c.subject, c.text, c.attachments.length]) !== snapshot;
    }

    function update() {
      titleEl.textContent = c.subject.trim() || (c.mode === "forward" ? "Forward" : c.mode.startsWith("reply") ? "Reply" : "New Message");
      const all = [...c.to, ...c.cc, ...c.bcc];
      sendBtn.disabled = !all.length || all.some((p) => !EMAIL_RE.test(p.email));
      hint.textContent = `From ${c.from}`;
    }

    async function doSend() {
      for (const k of ["to", "cc", "bcc"]) {
        const f = fields[k];
        if (f?.input.value.trim()) {
          c[k].push(...f.input.value.split(/[,;]+/).map(parseAddress).filter((p) => p.email));
          f.input.value = "";
        }
      }
      const all = [...c.to, ...c.cc, ...c.bcc];
      const bad = all.find((p) => !EMAIL_RE.test(p.email));
      if (!all.length || bad) {
        toast(bad ? `“${bad.email}” isn't a valid address` : "Add a recipient", { error: true });
        return;
      }
      if (!c.subject.trim()) {
        const ok = await confirmMenu(sendBtn, "This message has no subject.", "Send Anyway");
        if (!ok) return subjectInput.focus();
      }
      closeSheet("sending");
      queueSend(c);
    }

    function closeSheet(mode) {
      const st = sheetState;
      if (!st) return;
      sheetState = null;
      document.activeElement?.blur?.();
      const appEl = document.getElementById("app");
      if (appEl) appEl.inert = false;
      if (sheetOpener?.isConnected && S.layout !== "phone") sheetOpener.focus({ preventScroll: true });
      sheetOpener = null;
      setTimeout(updateWhenSafe, 800);
      document.body.classList.remove("sheet-open");
      scrim.classList.remove("open");
      if (mode === "sending") sheet.classList.add("sending");
      sheet.classList.remove("open");
      setTimeout(() => {
        scrim.remove();
        sheet.remove();
      }, 650);
    }

    // Drag the sheet down to dismiss (iPhone)
    let drag = null;
    head.addEventListener("pointerdown", (e) => {
      if (S.layout !== "phone" || e.target.closest("button")) return;
      drag = { y0: e.clientY, dy: 0, t: performance.now(), id: e.pointerId };
      head.setPointerCapture(e.pointerId);
      sheet.classList.add("dragging");
    });
    head.addEventListener("pointermove", (e) => {
      if (!drag) return;
      drag.dy = Math.max(0, e.clientY - drag.y0);
      const resist = drag.dy > 0 && dirty() ? drag.dy * 0.5 : drag.dy;
      sheet.style.transform = `translateY(${resist}px)`;
    });
    const endDrag = () => {
      if (!drag) return;
      const { dy, t } = drag;
      drag = null;
      sheet.classList.remove("dragging");
      sheet.style.transform = "";
      const v = dy / Math.max(1, performance.now() - t);
      if (dy > 140 || v > 0.8) requestCloseCompose();
    };
    head.addEventListener("pointerup", endDrag);
    head.addEventListener("pointercancel", endDrag);

    sheetState = {
      c,
      dirty,
      closeBtn,
      close: closeSheet,
      saveDraft: async () => {
        closeSheet();
        try {
          await api.saveDraft({
            id: c.draftId,
            from: c.from,
            to: c.to,
            cc: c.cc,
            bcc: c.bcc,
            subject: c.subject,
            text: c.text,
            inReplyTo: c.inReplyTo,
            references: c.references,
            quote: c.quote,
            attachments: await draftAttachments(c.attachments),
          });
          toast("Draft Saved", { icon: "drafts" });
          refreshCounts();
          loadList({ quiet: true });
        } catch (err) {
          toast(err.message, { error: true });
        }
      },
      deleteDraft: async () => {
        closeSheet();
        if (c.draftId) {
          try {
            await api.remove(c.draftId);
            refreshCounts();
            loadList({ quiet: true });
          } catch {}
        }
      },
    };

    update();
    // (the sheet holds the focus while it's up: what's behind it can't be reached, and it goes back where it was after)
    const opener = document.activeElement;
    const appEl = document.getElementById("app");
    if (appEl) appEl.inert = true;
    sheet.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const f = [...sheet.querySelectorAll("button:not(:disabled),input,textarea,[tabindex]:not([tabindex='-1'])")].filter((x) => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) (e.preventDefault(), f[f.length - 1].focus());
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) (e.preventDefault(), f[0].focus());
    });
    sheetOpener = opener;
    document.body.append(scrim, sheet);
    scrim.addEventListener("click", () => S.layout === "pad" && requestCloseCompose());
    sheet.offsetHeight;
    document.body.classList.add("sheet-open");
    scrim.classList.add("open");
    sheet.classList.add("open");
    requestAnimationFrame(autoGrow);

    // Focus synchronously so iOS raises the keyboard within the tap.
    if (c.mode === "new" && !c.to.length) fields.to.input.focus({ preventScroll: true });
    else if (c.mode !== "new" || c.draftId) {
      if (!c.to.length) fields.to.input.focus({ preventScroll: true });
      else {
        textArea.focus({ preventScroll: true });
        try {
          textArea.setSelectionRange(0, 0);
        } catch {}
      }
    }
  }

  function confirmMenu(anchor, title, label, { destructive } = {}) {
    return new Promise((resolve) => {
      let done = false;
      showMenu(anchor, [
        {
          label,
          destructive,
          icon: destructive ? "trash" : "arrowUp",
          action: () => {
            done = true;
            resolve(true);
          },
        },
        { label: "Cancel", action: () => resolve(false) },
      ], { title });
      const layer = menuState?.layer;
      layer?.addEventListener("pointerdown", (e) => e.target === layer && !done && resolve(false));
    });
  }

  function requestCloseCompose() {
    const st = sheetState;
    if (!st) return;
    if (!st.dirty()) {
      if (st.c.draftId) return st.close();
      return st.close();
    }
    showMenu(st.closeBtn, [
      { label: "Delete Draft", icon: "trash", destructive: true, action: st.deleteDraft },
      { label: "Save Draft", icon: "drafts", action: st.saveDraft },
    ]);
  }

  // Sending waits a few seconds so it can be undone.
  const pendingSends = new Set();

  function queueSend(c) {
    const job = { c, cancelled: false, timer: null };
    pendingSends.add(job);
    toast("Sending…", {
      icon: "sent",
      actionLabel: "Undo",
      duration: 4200,
      action: () => {
        job.cancelled = true;
        clearTimeout(job.timer);
        pendingSends.delete(job);
        openCompose(c);
      },
    });
    job.timer = setTimeout(() => runSend(job), 4000);
  }

  async function buildPayload(c) {
    let text = c.text;
    let html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.45;color:#1c1c1e">${textToHtml(c.text)}</div>`;
    if (c.quote) {
      const qText = c.quote.text || htmlToText(c.quote.html);
      text += `\n\n${c.quote.header}\n\n${c.quote.forward ? qText : qText.split("\n").map((l) => `> ${l}`).join("\n")}`;
      const qHtml = c.quote.html ? bodyInner(c.quote.html) : textToHtml(c.quote.text);
      html += `<br><div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#6e6e73;font-size:14px">${textToHtml(c.quote.header)}</div><blockquote type="cite" style="margin:10px 0 0;padding:0 0 0 12px;border-left:2px solid #c7c7cc">${qHtml}</blockquote>`;
    }
    const attachments = [];
    for (const a of c.attachments) {
      const blob = a.file || (a.url && !a.url.startsWith("data:") ? await (await fetch(a.url, { credentials: "same-origin" })).blob() : a.url ? await (await fetch(a.url)).blob() : null);
      if (!blob) continue;
      attachments.push({ filename: a.filename, type: a.type, content: await fileToBase64(blob) });
    }
    return {
      from: c.from,
      to: c.to,
      cc: c.cc,
      bcc: c.bcc,
      subject: c.subject,
      text,
      html,
      inReplyTo: c.inReplyTo,
      references: c.references,
      attachments,
      draftId: c.draftId,
    };
  }

  async function runSend(job, { keepalive } = {}) {
    if (job.cancelled || job.started) return;
    job.started = true;
    pendingSends.delete(job);
    try {
      const payload = await buildPayload(job.c);
      await api.send(payload, { keepalive });
      toast("Message Sent", { icon: "check" });
      S.failedSends = S.failedSends.filter((j) => j !== job);
      refreshCounts();
      loadList({ quiet: true });
      // (a reply shows in its conversation)
      if (S.thread && job.c.inReplyTo) openThread(S.thread.id, { fromNav: true });
    } catch (err) {
      // (kept for the dot to offer again, unless it's the message itself that's wrong)
      if (!(err.status >= 400 && err.status < 500)) {
        S.failedSends.push(job);
        renderListChrome();
      }
      toast(err.message || "Couldn't send", {
        error: true,
        actionLabel: "Edit",
        duration: 8000,
        action: () => openCompose(job.c),
      });
    }
  }

  // Don't lose a queued message if the app is closed during the undo window.
  window.addEventListener("pagehide", () => {
    for (const job of pendingSends) {
      clearTimeout(job.timer);
      runSend(job, { keepalive: true });
    }
  });

  // Keep the compose sheet above the on-screen keyboard.
  if (window.visualViewport) {
    const vv = window.visualViewport;
    let lastKb = -1;
    const onVV = () => {
      const kb = Math.max(0, viewH() - vv.height - vv.offsetTop);
      const v = kb > 60 ? Math.round(kb) : 0;
      if (v === lastKb) return;
      lastKb = v;
      document.documentElement.style.setProperty("--kb", `${v}px`);
      document.querySelector(".sheet")?.classList.toggle("kb", v > 0);
    };
    vv.addEventListener("resize", onVV);
    vv.addEventListener("scroll", onVV);
  }

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts (iPad with a keyboard, desktop)
  // ---------------------------------------------------------------------------

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (menuState) return closeMenu();
      if (sheetState) return requestCloseCompose();
      if (S.layout === "phone" && S.depth > 0) return goBack();
    }
    const typing = e.target.closest?.("input,textarea,[contenteditable]");
    if (typing || sheetState || menuState || e.metaKey || e.ctrlKey || e.altKey || !els.list) return;
    const t = S.thread && !S.thread.loading ? S.thread : null;
    const k = e.key;
    if (k === "c" || k === "n") return e.preventDefault(), openCompose();
    if (k === "/") return e.preventDefault(), els.searchInput.focus();
    if (k === "1") return setCategory("people");
    if (k === "2") return setCategory("updates");
    if (k === "j" || k === "ArrowDown") {
      e.preventDefault();
      if (S.selectedId) stepThread(1);
      else if (S.threads[0]) openThread(S.threads[0].id);
      return;
    }
    if (k === "k" || k === "ArrowUp") return e.preventDefault(), stepThread(-1);
    if (!t) return;
    if (["r", "a", "f"].includes(k)) e.preventDefault();
    if (k === "r") return withReplyTarget(t.id, (m) => openCompose(replyDraft(m, "reply")));
    if (k === "a") return withReplyTarget(t.id, (m) => openCompose(replyDraft(m, "replyAll")));
    if (k === "f") return withReplyTarget(t.id, (m) => openCompose(replyDraft(m, "forward")));
    if (k === "e") return act(t.id, leadAction(t).act);
    if (k === "#" || k === "Delete") return t.trashed ? confirmDelete(els.detailToolbar, t.id) : act(t.id, "trash");
    if (k === "u") return act(t.id, t.unread ? "read" : "unread");
    if (k === "l") return act(t.id, t.starred ? "unflag" : "flag");
  });

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------

  // Signing in happens on the inflite account's page (account.inflite.ai). Mail sends you there with the hash of a word
  // it keeps in this tab; the page sends you back with a code that's good once, and only with that word.
  let accountOrigin = "";
  const VERIFIER_KEY = "inflite:signin-verifier";

  function onSignedOut(access) {
    if (!document.querySelector(".login")) showGate(access);
  }

  const b64url = (bytes) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  async function goToAccount() {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const ask = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    try {
      sessionStorage.setItem(VERIFIER_KEY, verifier);
    } catch {}
    const back = `${location.origin}/`;
    location.assign(`${accountOrigin}/#${new URLSearchParams({ signin: "mail", ask, back })}`);
  }

  // Back from the account's page with a code: swapped for the site's sign-in. Returns the session, or null.
  async function finishSignIn() {
    const p = new URLSearchParams(location.hash.slice(1));
    const code = p.get("signin");
    if (!code) return null;
    try {
      history.replaceState(history.state, "", location.pathname + location.search);
    } catch {}
    let verifier = null;
    try {
      verifier = sessionStorage.getItem(VERIFIER_KEY);
      sessionStorage.removeItem(VERIFIER_KEY);
    } catch {}
    if (!verifier) return null;
    return api.handback(code, verifier);
  }

  const GATE = {
    signin: {
      text: "Every inflite address, in one calm stream",
      button: "Sign in",
    },
    reauth: {
      text: "Mail asks you to confirm it’s you every 12 hours.",
      button: "Confirm it’s you",
    },
    notadmin: {
      text: "Mail is only for the site’s admin.",
      button: "Use another account",
    },
    passkey: {
      text: "Add a passkey to your account to use Mail, as Admin needs.",
      button: "Open your account",
    },
  };

  // Signed out (or not let in): as the site's other apps have it, the mark high on the page, out of a glow; the name a
  // letter at a time; a line; and Sign in at the foot, pulsing gently. Mail's own scene along the bottom: soft clouds and
  // a paper plane flying its dotted route. again: shown before in this visit (after signing out): no slow start.
  function showGate(access = "signin", { user, error } = {}) {
    clearInterval(pollTimer);
    forgetMail();
    const g = GATE[access] || GATE.signin;
    const who = user && access !== "signin" ? `Signed in as @${user.handle}` : "";
    const go = h(
      "button.w-go",
      {
        type: "button",
        onclick: () => {
          go.disabled = true;
          if (access === "passkey") location.assign(`${accountOrigin}/`);
          else goToAccount();
        },
      },
      g.button
    );
    const again = !!showGate.shown;
    showGate.shown = true;
    ensureSky();
    const login = h(
      `div.login.welcome${again ? ".again" : ""}`,
      { role: "main", "aria-labelledby": "login-title" },
      flightScene(),
      h(
        "div.w-top",
        h("div.wlogo", h("img.mark", { src: "/icon.svg", alt: "", width: 96, height: 96 })),
        h("h1.wtitle", { id: "login-title", "aria-label": "Mail" }, [..."Mail"].map((c) => h("span", { "aria-hidden": "true" }, c))),
        h("p.tagline", g.text)
      ),
      h(
        "div.w-cta",
        error || who ? h("p.said", { role: error ? "alert" : "status" }, error || who) : null,
        go
      )
    );
    document.querySelector(".login")?.remove();
    document.body.append(login);
    document.title = "Mail";
  }

  // Signed out: nothing of the mailbox stays on screen or in memory (the app, any open sheet or menu, what was loaded)
  function forgetMail() {
    closeMenu(true);
    document.querySelectorAll(".sheet, .sheet-scrim, .toast").forEach((el) => el.remove());
    document.body.classList.remove("sheet-open", "dragging", "moving");
    sheetState = null;
    toastEl = null;
    document.getElementById("app")?.remove();
    for (const k of Object.keys(els)) delete els[k];
    Object.assign(S, { me: null, counts: {}, threads: [], drafts: [], thread: null, selectedId: null, query: "", address: null, version: null, prefetch: null, depth: 0 });
    S.bodies.clear();
    S.expanded.clear();
    try {
      navigator.clearAppBadge?.();
    } catch {}
  }

  // The scene at the foot of the welcome: three bands of cloud, far to near, and a dotted route over them with a paper
  // plane flying along it, round and round (at rest a third of the way along, for anyone who asks for less motion)
  function flightScene() {
    const W = 1200, H = 460;
    const band = (base, amps, seed) => (x) => base - amps.reduce((y, a, i) => y + a * Math.sin(x / [210, 83, 37][i] + seed * (i + 1)), 0);
    const line = (f) => Array.from({ length: 61 }, (_, i) => `${i ? "L" : "M"}${((i / 60) * W).toFixed(1)} ${f((i / 60) * W).toFixed(1)}`).join("");
    const fill = (f, cls) => `<path class="${cls}" d="${line(f)}L${W} ${H}L0 ${H}Z"/>`;
    const route = "M-60 300C150 210 330 330 560 250S930 150 1260 230";
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wrap = document.createElement("div");
    wrap.innerHTML = `<svg class="flight" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs><linearGradient id="f-route" x1="0" x2="1"><stop offset="0" stop-color="#6fb1ff"/><stop offset=".55" stop-color="#8f7bff"/><stop offset="1" stop-color="#c58bff"/></linearGradient>
      <radialGradient id="f-glow"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".4" stop-color="#8fb8ff" stop-opacity=".45"/><stop offset="1" stop-color="#6a7bff" stop-opacity="0"/></radialGradient></defs>
      ${fill(band(300, [40, 16, 7], 0.4), "f-far")}${fill(band(352, [44, 18, 8], 1.9), "f-mid")}${fill(band(404, [46, 20, 9], 3.7), "f-near")}
      <path class="f-route" id="f-path" d="${route}"/>
      <g class="f-plane"${still ? ' transform="translate(420 268) rotate(-12)"' : ""}>
        <circle r="30" fill="url(#f-glow)"/>
        <path class="f-paper" d="M16 0-14-11-8 0-14 11Z"/><path class="f-fold" d="M16 0-8 0"/>
        ${still ? "" : '<animateMotion dur="11s" begin="2.2s" repeatCount="indefinite" rotate="auto" fill="freeze"><mpath href="#f-path"/></animateMotion>'}
      </g></svg>`;
    return wrap.firstElementChild;
  }

  async function enter() {
    const login = document.querySelector(".login");
    await boot();
    if (login) {
      login.style.transition = "opacity .5s var(--ease), transform .6s var(--ease)";
      login.style.opacity = "0";
      login.style.transform = "scale(1.06)";
      setTimeout(() => login.remove(), 500);
    }
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  let pollTimer = null;

  async function boot() {
    const last = store.get("lens", "people");
    if (["people", "updates", "later", "flagged", "done"].includes(last)) S.lens = last;
    applyLens();
    const params = { view: S.view, category: S.query || S.view === "trash" ? null : S.category, address: S.address, q: S.query, before: undefined };
    S.prefetch = { params, res: api.threads(params) };
    S.prefetch.res.catch(() => {});
    const [me, counts, v] = await Promise.all([api.me(), api.counts(), api.version().catch(() => null)]);
    S.version = v?.v;
    S.build = v?.build || null;
    S.me = me;
    if (me.account?.appearance) lookOf(me.account.appearance);
    S.counts = counts;
    if (!els.list || !els.list.isConnected) build();
    else {
      renderNavButtons();
      renderListChrome();
    }
    hist("replaceState", { depth: 0 });
    S.depth = 0;
    setPositions();
    updateBadge();
    await loadList();
    setupPush();
    // (opened from a notification)
    if (/thread=/.test(location.hash)) {
      const url = location.href;
      try {
        history.replaceState(history.state, "", location.pathname + location.search);
      } catch {}
      openFromUrl(url);
    }
    try {
      if (sessionStorage.getItem("mail:updated")) {
        sessionStorage.removeItem("mail:updated");
        toast("Mail updated", { icon: "check" });
      }
    } catch {}
    clearInterval(pollTimer);
    pollTimer = setInterval(poll, 30000);
  }

  // A new version of Mail is deployed: it's loaded at the first moment nothing would be lost (not while writing,
  // sending, swiping, or with a menu open), back where you were
  function updateWhenSafe() {
    if (!S.newBuild) return;
    const typing = !!els.detailToolbar?.querySelector(".qr-field")?.value.trim();
    if (sheetState || pendingSends.size || menuState || S.swiping || openSwipe || typing || S.searching) return;
    try {
      sessionStorage.setItem("mail:updated", "1");
    } catch {}
    const at = S.thread && !S.thread.loading ? `#thread=${encodeURIComponent(S.thread.id)}` : "";
    swReg?.update().catch(() => {});
    try {
      history.replaceState(null, "", location.pathname + location.search + at);
    } catch {}
    location.reload();
  }

  async function poll() {
    if (document.hidden) return;
    renderListChrome();
    if (S.swiping || openSwipe || S.loading) return;
    // (nothing has changed since last time: nothing more to ask)
    try {
      const { v, build } = await api.version();
      if (S.offline) ((S.offline = false), renderListChrome());
      if (build && S.build && build !== S.build) S.newBuild = build;
      S.build ||= build;
      if (S.newBuild) updateWhenSafe();
      if (v && v === S.version) {
        S.updatedAt = Date.now();
        return renderListChrome();
      }
      S.version = v;
    } catch (err) {
      // (no answer at all, rather than an error from Mail: offline)
      if (!err.status) ((S.offline = true), renderListChrome());
    }
    const before = S.counts.people?.unread || 0;
    await refreshCounts();
    if (!S.query) await loadList({ quiet: true });
    const after = S.counts.people?.unread || 0;
    // (new conversations in People, while looking elsewhere)
    if (after > before && (S.lens !== "people" || S.filter !== "all")) toast(`${after - before} New in People`, { icon: "person" });
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && S.me) poll();
    // (put away with an update waiting: it's loaded while you're not looking)
    else if (document.hidden) updateWhenSafe();
  });

  window.addEventListener("resize", () => {
    if (els.list) updateLayout();
  });

  async function start() {
    let s;
    try {
      let error = null;
      try {
        s = await finishSignIn();
      } catch (err) {
        error = err.message;
      }
      s ||= await api.session();
      accountOrigin = s.accountOrigin || accountOrigin;
      if (s.user?.appearance) lookOf(s.user.appearance);
      if (s.access !== "ok") return showGate(s.access, { user: s.user, error });
      await enter();
    } catch (err) {
      if (!s) showGate("signin", { error: err.message || "Can’t reach Mail right now." });
      else toast(err.message || "Can’t reach Mail right now.", { error: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
