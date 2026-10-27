/* inflite Mail: a Liquid Glass mail client for iPhone and iPad. */
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
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5v-3a4 4 0 0 1 8 0v3"/>',
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

  function avatar(person, cls = "") {
    const el = h(`div.avatar${cls ? "." + cls : ""}`, { "aria-hidden": "true" }, initials(person.name, person.email));
    el.style.setProperty("--h", hue(person.email || person.name));
    return el;
  }

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
        headers: { "X-Inflite": "1", ...(body !== undefined && { "Content-Type": "application/json" }) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let data = null;
      try {
        data = await res.json();
      } catch {}
      if (!res.ok) {
        if (res.status === 401 && path !== "/api/login") onSignedOut();
        throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
      }
      return data;
    }
    const qs = (o) =>
      new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false)).toString();
    return {
      session: () => req("GET", "/api/session"),
      login: (password) => req("POST", "/api/login", { password }),
      logout: () => req("POST", "/api/logout", {}),
      me: () => req("GET", "/api/me"),
      counts: () => req("GET", "/api/counts"),
      list: ({ folder, q, unread, before }) =>
        req("GET", `/api/messages?${qs({ folder, q, unread: unread ? 1 : "", before })}`),
      message: (id) => req("GET", `/api/messages/${id}`),
      patch: (id, patch) => req("PATCH", `/api/messages/${id}`, patch),
      batch: (body) => req("POST", "/api/messages/batch", body),
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
      mailbox: ME.email,
      from,
      to: extra.to || [ME],
      cc: extra.cc || [],
      bcc: [],
      subject,
      snippet: (text || htmlToText(extra.html || "")).replace(/\s+/g, " ").slice(0, 200),
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
        html: card(
          "Your domain is verified",
          "<p>Good news — <b>inflite.ai</b> passed DNS verification and can now send email through Cloudflare Email Service.</p><p>Bind <code>send_email</code> in your Worker to start sending. Your daily quota is <b>1,000 messages</b> while the service is in beta.</p>",
          "Open dashboard"
        ),
      }),
      mk("inbox", P.leo, "Dinner Friday?", "Hey! A few of us are going to that new place on Columbia Road on Friday around 8. Fancy it? I can book for six.\n\nLeo", 2 * hr, { unread: true }),
      mk("inbox", P.priya, "Re: Investor update draft", "This reads really well. Two small notes:\n\n1. Lead with the activation numbers — they're the headline.\n2. The roadmap slide can go in the appendix.\n\nHappy to jump on a call tomorrow if useful.\n\nPriya\n\n> On Monday, George wrote:\n> Here's the first draft of the October update…", 5 * hr, { starred: true }),
      mk("inbox", P.alex, "Photos from the weekend", "Here are a few favourites from Saturday. Full gallery link to follow once I've finished the edit!", 22 * hr, {
        attachments: [
          { id: "a3", filename: "IMG_2041.jpg", type: "image/jpeg", size: 3204112, url: swatch("#ff9a8b", "#ff6a88") },
          { id: "a4", filename: "IMG_2058.jpg", type: "image/jpeg", size: 2876433, url: swatch("#fbc2eb", "#a6c1ee") },
          { id: "a5", filename: "IMG_2077.jpg", type: "image/jpeg", size: 3011876, url: swatch("#84fab0", "#8fd3f4") },
        ],
      }),
      mk("inbox", P.nw, "Your trip to Lisbon is confirmed", "", 26 * hr, {
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
      mk("inbox", P.sam, "Quick question about the API", "Hey George — is the /messages endpoint paginated by cursor or offset? Want to make sure the sync job doesn't double-count.\n\nCheers,\nSam", 2 * dayMs + 3 * hr),
      mk("inbox", P.byte, "Issue #142: The quiet return of the web app", "", 3 * dayMs, {
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:24px 18px;color:#222">
          <div style="font-family:-apple-system,Helvetica,sans-serif;font-size:12px;letter-spacing:.12em;color:#888">THE WEEKLY BYTE · ISSUE 142</div>
          <h1 style="font-size:30px;line-height:1.15;margin:10px 0 14px">The quiet return of the web app</h1>
          <p style="font-size:17px;line-height:1.6">Home-screen web apps have grown up. With edge runtimes doing the heavy lifting, a single HTML file can feel as native as anything in the App Store…</p>
          <p style="font-size:17px;line-height:1.6">This week: why the best new tools ship as URLs first, and what that means for the rest of us.</p></div>`,
      }),
      mk("inbox", P.parcel, "Your parcel is out for delivery", "Good news! Your parcel is with our driver and will arrive today between 13:00 and 15:00.", 4 * dayMs),
      mk("sent", ME, "Re: Quick question about the API", "Cursor-based — pass the date of the last message as `before`. Shout if anything looks off.\n\nG", 2 * dayMs, { to: [P.sam] }),
      mk("sent", ME, "Investor update draft", "Hi Priya,\n\nHere's the first draft of the October update. Would love your eyes on it before it goes out.\n\nThanks,\nGeorge", 3 * dayMs, { to: [P.priya] }),
      mk("drafts", ME, "Thursday review agenda", "1. Toolbar glass\n2. iPad sidebar\n3. Compose sheet motion", 1 * hr, {
        to: [P.maya],
        compose: { from: ME.email, to: [P.maya], cc: [], bcc: [], subject: "Thursday review agenda", text: "1. Toolbar glass\n2. iPad sidebar\n3. Compose sheet motion" },
      }),
      mk("archive", P.jo, "Brand guidelines v3", "Final guidelines attached — thanks for all the feedback!", 9 * dayMs),
      mk("trash", P.parcel, "Rate your delivery", "How did we do? Tap a star to rate your delivery.", 6 * dayMs),
    ];
    const contacts = Object.values(P);
    const delay = () => wait(140 + Math.random() * 160);
    const summary = ({ text, html, attachments, compose, ...m }) => m;
    return {
      async session() {
        return { authenticated: true, configured: true };
      },
      async login() {
        return { ok: true };
      },
      async logout() {
        return { ok: true };
      },
      async me() {
        return { displayName: ME.name, domain: "inflite.ai", defaultFrom: ME.email, identities: [ME.email, "george@inflite.ai"] };
      },
      async counts() {
        const out = {};
        for (const f of ["inbox", "drafts", "sent", "archive", "trash"]) {
          const inF = msgs.filter((m) => m.folder === f);
          out[f] = { total: inF.length, unread: inF.filter((m) => m.unread).length };
        }
        out.flagged = { total: msgs.filter((m) => m.starred && m.folder !== "trash").length, unread: 0 };
        return out;
      },
      async list({ folder, q, unread }) {
        await delay();
        let list = msgs.slice();
        if (q) {
          const s = q.toLowerCase();
          list = list.filter(
            (m) =>
              m.folder !== "trash" &&
              [m.subject, m.snippet, m.from.name, m.from.email, ...m.to.map((t) => t.email)].join(" ").toLowerCase().includes(s)
          );
        } else if (folder === "flagged") list = list.filter((m) => m.starred && m.folder !== "trash");
        else list = list.filter((m) => m.folder === folder);
        if (unread) list = list.filter((m) => m.unread);
        list.sort((a, b) => b.date - a.date);
        return { messages: list.map(summary), hasMore: false };
      },
      async message(id) {
        await delay();
        const m = msgs.find((x) => x.id === id);
        if (!m) throw new ApiError(404, "Message not found");
        return { ...m };
      },
      async patch(id, p) {
        const m = msgs.find((x) => x.id === id);
        if (m) Object.assign(m, p);
        return { ok: true };
      },
      async batch({ ids, delete: del, ...p }) {
        for (const id of ids) {
          const i = msgs.findIndex((x) => x.id === id);
          if (i < 0) continue;
          if (del) msgs.splice(i, 1);
          else Object.assign(msgs[i], p);
        }
        return { ok: true };
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
        const m = mk("sent", ME, p.subject, p.text, 0, { to: p.to, cc: p.cc, html: p.html });
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

  const api = DEMO ? demoApi() : realApi();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const FOLDER_INFO = {
    inbox: { title: "Inbox", icon: "inbox" },
    flagged: { title: "Flagged", icon: "flag", cls: "orange" },
    drafts: { title: "Drafts", icon: "drafts" },
    sent: { title: "Sent", icon: "sent" },
    archive: { title: "Archive", icon: "archive" },
    trash: { title: "Trash", icon: "trash" },
  };

  const S = {
    me: null,
    counts: {},
    folder: "inbox",
    messages: [],
    hasMore: false,
    loading: false,
    loadingMore: false,
    query: "",
    searching: false,
    unreadOnly: false,
    selectedId: null,
    message: null,
    depth: 1,
    updatedAt: 0,
    layout: "phone",
    wide: false,
    sidebarOpen: false,
    sidebarCollapsed: store.get("sidebarCollapsed", false),
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

  let litEl = null;
  function light(e) {
    const r = litEl.getBoundingClientRect();
    litEl.style.setProperty("--px", `${e.clientX - r.left}px`);
    litEl.style.setProperty("--py", `${e.clientY - r.top}px`);
  }
  document.addEventListener(
    "pointerdown",
    (e) => {
      const g = e.target.closest?.(".glass");
      if (!g) return;
      litEl = g;
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
    const vh = window.innerHeight;
    const below = r.bottom + 8 + mh < vh - 12 || r.top < vh / 2;
    let top = below ? r.bottom + 8 : r.top - 8 - mh;
    top = Math.max(12, Math.min(top, vh - mh - 12));
    let left = r.left + r.width / 2 < vw / 2 ? r.left : r.right - mw;
    left = Math.max(12, Math.min(left, vw - mw - 12));
    Object.assign(menu.style, { top: `${top}px`, left: `${left}px` });
    menu.style.transformOrigin = `${r.left + r.width / 2 - left}px ${r.top + r.height / 2 - top}px`;
    requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add("open")));
    menu.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
    menuState = { layer, menu };
  }

  function closeMenu(immediate) {
    if (!menuState) return;
    const { layer, menu } = menuState;
    menuState = null;
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
  // Layout
  // ---------------------------------------------------------------------------

  function updateLayout() {
    const w = window.innerWidth;
    const phone = w < 700;
    const body = document.body;
    S.layout = phone ? "phone" : "pad";
    body.classList.toggle("phone", phone);
    body.classList.toggle("pad", !phone);
    if (!phone) {
      S.wide = w >= 1100;
      const visible = S.wide ? !S.sidebarCollapsed : S.sidebarOpen;
      body.classList.toggle("sidebar-hidden", !visible);
      body.classList.toggle("sidebar-overlay", !S.wide);
      const listLeft = S.wide && visible ? 320 : 0;
      const listW = Math.round(Math.min(410, Math.max(320, w * (S.wide ? 0.28 : 0.42))));
      body.style.setProperty("--list-left", `${listLeft}px`);
      body.style.setProperty("--list-w", `${listW}px`);
    }
    setPositions();
    renderNavButtons();
  }

  function setPositions() {
    const panes = [els.mailboxes, els.list, els.detail];
    panes.forEach((p, i) => {
      if (S.layout !== "phone") return p.removeAttribute("data-pos");
      p.dataset.pos = i < S.depth ? "behind" : i === S.depth ? "current" : "ahead";
      p.inert = i !== S.depth;
    });
    if (S.layout !== "phone") panes.forEach((p) => (p.inert = false));
    if (S.layout === "pad") els.mailboxes.inert = document.body.classList.contains("sidebar-hidden");
  }

  function pushDepth(depth) {
    if (S.layout !== "phone") return;
    S.depth = depth;
    hist("pushState", { depth }, "");
    setPositions();
  }

  function goBack() {
    if (S.layout !== "phone") return;
    if ((history.state?.depth ?? 0) > 0 && history.state.depth === S.depth) history.back();
    else {
      S.depth = Math.max(0, S.depth - 1);
      setPositions();
    }
  }

  window.addEventListener("popstate", (e) => {
    if (sheetState) {
      // Back gesture while composing closes the sheet instead.
      hist("pushState", { depth: S.depth }, "");
      return requestCloseCompose();
    }
    S.depth = e.state?.depth ?? 0;
    setPositions();
  });

  function toggleSidebar(force) {
    if (S.wide) {
      S.sidebarCollapsed = force !== undefined ? !force : !S.sidebarCollapsed;
      store.set("sidebarCollapsed", S.sidebarCollapsed);
    } else {
      S.sidebarOpen = force !== undefined ? force : !S.sidebarOpen;
    }
    updateLayout();
  }

  // Interactive edge swipe to go back on iPhone.
  function setupEdgeSwipe() {
    let g = null;
    const W = () => window.innerWidth;
    document.addEventListener(
      "touchstart",
      (e) => {
        if (S.layout !== "phone" || S.depth === 0 || sheetState || menuState) return;
        const t = e.touches[0];
        if (t.clientX > 24) return;
        g = { x0: t.clientX, y0: t.clientY, dx: 0, active: false, t0: performance.now(), lastX: t.clientX, lastT: performance.now(), v: 0 };
      },
      { passive: true }
    );
    document.addEventListener(
      "touchmove",
      (e) => {
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
        const cur = [els.mailboxes, els.list, els.detail][S.depth];
        const prev = [els.mailboxes, els.list, els.detail][S.depth - 1];
        const p = g.dx / W();
        cur.style.transform = `translateX(${g.dx}px)`;
        prev.style.transform = `translateX(${-28 * (1 - p)}%)`;
      },
      { passive: false }
    );
    const end = () => {
      if (!g) return;
      const was = g;
      g = null;
      if (!was.active) return;
      document.body.classList.remove("dragging");
      const cur = [els.mailboxes, els.list, els.detail][S.depth];
      const prev = [els.mailboxes, els.list, els.detail][S.depth - 1];
      cur.style.transform = "";
      prev.style.transform = "";
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

  function build() {
    setKids(document.body);
    const app = h("div", { id: "app" });

    // Mailboxes
    els.mailboxesScroll = h("div.scroll");
    els.mailboxesNav = h("div.navbar");
    els.mailboxesToolbar = h("div.toolbar");
    els.mailboxes = h(
      "section.pane.mailboxes",
      { "aria-label": "Mailboxes" },
      els.mailboxesNav,
      h("div.nav-title", "Mailboxes"),
      els.mailboxesScroll,
      els.mailboxesToolbar
    );

    // Message list
    els.listNav = h("div.navbar");
    els.listNavTitle = h("div.nav-title");
    els.listTitle = h("div.large-title");
    els.listSubtitle = h("div.subtitle");
    els.rows = h("div.rows", { role: "list" });
    els.listFooter = h("div");
    els.listScroll = h(
      "div.scroll",
      h("div.ptr", h("div.spinner")),
      els.listTitle,
      els.listSubtitle,
      els.rows,
      els.listFooter
    );
    els.listToolbar = h("div.toolbar");
    els.list = h("section.pane.list", { "aria-label": "Messages" }, els.listNav, els.listNavTitle, els.listScroll, els.listToolbar);

    // Detail
    els.detailNav = h("div.navbar");
    els.detailNavTitle = h("div.nav-title");
    els.detailScroll = h("div.scroll");
    els.detailToolbar = h("div.toolbar");
    els.detailEmpty = h("div.detail-empty", icon("envelope"), h("b", "No Message Selected"));
    els.detail = h(
      "section.pane.detail",
      { "aria-label": "Message" },
      els.detailEmpty,
      els.detailNav,
      els.detailNavTitle,
      els.detailScroll,
      els.detailToolbar
    );

    els.scrim = h("div.sidebar-scrim", { onclick: () => toggleSidebar(false) });

    app.append(els.list, els.detail, els.scrim, els.mailboxes);
    document.body.append(app);

    for (const pane of [els.mailboxes, els.list, els.detail]) {
      const scroll = pane.querySelector(".scroll");
      scroll.addEventListener("scroll", () => pane.classList.toggle("scrolled", scroll.scrollTop > 28), { passive: true });
    }
    els.listScroll.addEventListener("scroll", onListScroll, { passive: true });
    els.listScroll.addEventListener("touchend", onListTouchEnd, { passive: true });
    setupRowGestures(els.rows);
    setupEdgeSwipe();

    buildListToolbar();
    renderMailboxes();
    renderListChrome();
    renderDetail();
    updateLayout();
  }

  function renderNavButtons() {
    if (!els.listNav) return;
    // List
    setKids(els.listNav, 
      S.layout === "phone"
        ? gbtn("chevronLeft", "Mailboxes", goBack)
        : !S.wide || S.sidebarCollapsed
          ? gbtn("sidebar", "Show Sidebar", () => toggleSidebar(true))
          : null,
      h("div.spacer"),
      gbtn("more", "More", (e) => listMenu(e.currentTarget))
    );
    // Mailboxes
    setKids(els.mailboxesNav, 
      h("div.spacer"),
      S.layout === "pad" ? gbtn("sidebar", "Hide Sidebar", () => toggleSidebar(false)) : null
    );
    renderDetailChrome();
  }

  // ---------------------------------------------------------------------------
  // Mailboxes
  // ---------------------------------------------------------------------------

  function mailboxCell(folder) {
    const info = FOLDER_INFO[folder];
    const c = S.counts[folder] || {};
    const n = folder === "inbox" ? c.unread : folder === "drafts" || folder === "flagged" ? c.total : c.unread;
    return h(
      "button.cell",
      {
        class: S.folder === folder && !S.query ? "current" : null,
        onclick: () => openFolder(folder),
      },
      h(`span.ic${info.cls ? "." + info.cls : ""}`, icon(info.icon)),
      h("span.lbl", info.title),
      n ? h("span.count", n) : null,
      icon("chevronRight", "chev")
    );
  }

  function renderMailboxes() {
    const me = S.me || {};
    setKids(els.mailboxesScroll, 
      h("div.large-title", "Mailboxes"),
      h("div.group", mailboxCell("inbox"), mailboxCell("flagged")),
      h("div.group-title", me.domain || "inflite.ai"),
      h("div.group", ["drafts", "sent", "archive", "trash"].map(mailboxCell)),
      h(
        "div.account-card",
        avatar({ name: me.displayName, email: me.defaultFrom }),
        h("div.who", h("b", me.displayName || "Account"), h("span", me.defaultFrom || "")),
        gbtn("signout", "Sign Out", (e) => signOutMenu(e.currentTarget), { class: "gbtn" })
      )
    );
    const unread = S.counts.inbox?.unread || 0;
    setKids(els.mailboxesToolbar, 
      h("div.side", { style: { width: "48px" } }),
      h("div.status", h("b", fmtUpdated(S.updatedAt) || " "), unread ? `${unread} Unread` : ""),
      gbtn("compose", "New Message", () => openCompose(), { class: "side" })
    );
  }

  function signOutMenu(anchor) {
    showMenu(anchor, [
      { label: "Sign Out", icon: "signout", destructive: true, action: signOut },
    ]);
  }

  async function signOut() {
    try {
      await api.logout();
    } catch {}
    if (DEMO) return toast("Demo mode — nothing to sign out of", { icon: "lock" });
    showLogin();
  }

  // ---------------------------------------------------------------------------
  // Message list
  // ---------------------------------------------------------------------------

  function folderTitle() {
    if (S.query) return "Search";
    return FOLDER_INFO[S.folder]?.title || "Inbox";
  }

  function renderListChrome() {
    const title = folderTitle();
    els.listTitle.textContent = title;
    const unread = S.folder === "inbox" ? S.counts.inbox?.unread || 0 : 0;
    const bits = [];
    if (S.unreadOnly) bits.push("Filtered by: Unread");
    else if (S.query) bits.push(`${S.messages.length} result${S.messages.length === 1 ? "" : "s"}`);
    else {
      bits.push(fmtUpdated(S.updatedAt));
      if (unread) bits.push(`${unread} Unread`);
    }
    els.listSubtitle.textContent = bits.filter(Boolean).join(" · ") || " ";
    setKids(els.listNavTitle, title, unread && !S.query ? h("small", `${unread} Unread`) : null);
    els.filterBtn?.classList.toggle("tinted", S.unreadOnly);
    els.filterBtn?.setAttribute("aria-pressed", String(S.unreadOnly));
  }

  function buildListToolbar() {
    els.filterBtn = gbtn("filter", "Filter: Unread", toggleUnreadFilter, { class: "side hide-on-search" });
    els.searchInput = h("input", {
      type: "search",
      placeholder: "Search",
      enterkeyhint: "search",
      autocomplete: "off",
      autocorrect: "off",
      "aria-label": "Search mail",
      oninput: debounce(() => runSearch(els.searchInput.value), 260),
      onfocus: () => setSearching(true),
      onkeydown: (e) => e.key === "Escape" && cancelSearch(),
    });
    els.searchCap = h("label.search.glass", icon("search"), els.searchInput);
    els.cancelSearchBtn = gbtn("x", "Cancel Search", cancelSearch, { class: "side show-on-search" });
    els.composeBtn = gbtn("compose", "New Message", () => openCompose(), { class: "side hide-on-search" });
    setKids(els.listToolbar, els.filterBtn, els.searchCap, els.composeBtn, els.cancelSearchBtn);
  }

  function setSearching(on) {
    S.searching = on;
    els.listToolbar.classList.toggle("searching", on);
  }

  const runSearch = (q) => {
    q = q.trim();
    if (q === S.query) return;
    S.query = q;
    S.selectedId = S.layout === "pad" ? S.selectedId : null;
    loadList();
    renderMailboxes();
  };

  function cancelSearch() {
    els.searchInput.value = "";
    els.searchInput.blur();
    setSearching(false);
    if (S.query) {
      S.query = "";
      loadList();
      renderMailboxes();
    }
  }

  function toggleUnreadFilter() {
    S.unreadOnly = !S.unreadOnly;
    loadList();
  }

  function openFolder(folder) {
    const changed = folder !== S.folder || S.query;
    if (S.query) {
      els.searchInput.value = "";
      setSearching(false);
      S.query = "";
    }
    S.folder = folder;
    S.unreadOnly = false;
    if (changed) {
      S.messages = [];
      S.hasMore = false;
      els.listScroll.scrollTop = 0;
      loadList();
    }
    renderMailboxes();
    if (S.layout === "phone") pushDepth(1);
    else if (!S.wide) toggleSidebar(false);
  }

  async function loadList({ more = false, quiet = false } = {}) {
    const token = ++S.listToken;
    if (more) {
      if (S.loadingMore || !S.hasMore) return;
      S.loadingMore = true;
    } else if (!quiet) {
      S.loading = true;
      renderListChrome();
      if (!S.messages.length) renderRows();
    }
    renderFooter();
    try {
      const last = S.messages[S.messages.length - 1];
      const res = await api.list({
        folder: S.folder,
        q: S.query,
        unread: S.unreadOnly,
        before: more && last ? last.date : undefined,
      });
      if (token !== S.listToken) return;
      if (more) S.messages = S.messages.concat(res.messages);
      else {
        const known = new Set(S.messages.map((m) => m.id));
        S.newIds = quiet && S.messages.length ? new Set(res.messages.filter((m) => !known.has(m.id)).map((m) => m.id)) : new Set();
        // Keep older pages that were already loaded.
        const oldest = res.messages[res.messages.length - 1];
        const older = quiet && oldest && res.hasMore ? S.messages.filter((m) => m.date < oldest.date) : [];
        S.messages = res.messages.concat(older);
        if (!older.length) S.hasMore = res.hasMore;
      }
      if (more) S.hasMore = res.hasMore;
      S.updatedAt = Date.now();
    } catch (err) {
      if (token === S.listToken && err.status !== 401) toast(err.message, { error: true });
    } finally {
      if (token === S.listToken) {
        S.loading = false;
        S.loadingMore = false;
        renderRows();
        renderListChrome();
        renderMailboxes();
      }
    }
  }

  function renderFooter() {
    setKids(els.listFooter, 
      S.loadingMore || (S.loading && S.messages.length === 0) ? h("div.load-more", h("div.spinner")) : null
    );
  }

  function renderRows() {
    closeOpenSwipe(true);
    if (!S.messages.length && !S.loading) {
      const info = FOLDER_INFO[S.folder] || FOLDER_INFO.inbox;
      setKids(els.rows, 
        h(
          "div.empty.content-in",
          icon(S.query ? "search" : info.icon),
          h("b", S.query ? "No Results" : S.unreadOnly ? "No Unread Mail" : "No Mail"),
          S.query ? `Nothing matches “${S.query}”.` : ""
        )
      );
    } else {
      setKids(els.rows, ...S.messages.map(rowEl));
    }
    renderFooter();
    S.newIds = new Set();
  }

  function rowEl(m) {
    const fromOrTo =
      m.folder === "sent" || m.folder === "drafts"
        ? m.to.length
          ? `To: ${m.to.map(displayName).join(", ")}`
          : "No Recipients"
        : displayName(m.from) || "Unknown Sender";
    const person = m.folder === "sent" || m.folder === "drafts" ? m.to[0] || m.from : m.from;
    const row = h(
      "div.row",
      {
        role: "button",
        tabindex: "0",
        "data-id": m.id,
        class: [m.unread && "unread", m.starred && "starred", m.id === S.selectedId && S.layout === "pad" && "selected"]
          .filter(Boolean)
          .join(" ") || null,
        "aria-label": `${m.unread ? "Unread. " : ""}${fromOrTo}. ${m.subject}`,
      },
      h("span.dot"),
      h("span.flag"),
      avatar(person || { name: "?" }),
      h(
        "div.body",
        h("div.top", h("span.from", m.folder === "drafts" ? h("span", { style: { color: "var(--red)" } }, "Draft ") : null, fromOrTo), h("span.date", fmtListDate(m.date), icon("chevronRight"))),
        h("div.subject", m.hasAttachments ? icon("clip") : null, m.subject || "(No Subject)"),
        h("div.preview", m.snippet || " ")
      )
    );
    const isTrash = m.folder === "trash";
    const actions = h(
      "div.swipe-actions",
      h(
        "div.side.left",
        h("button.a-read.lead", { "data-act": "read", tabindex: "-1" }, icon(m.unread ? "envelopeOpen" : "envelopeBadge"), m.unread ? "Read" : "Unread")
      ),
      h(
        "div.side.right",
        h("button.a-more", { "data-act": "more", tabindex: "-1" }, icon("more"), "More"),
        h("button.a-flag", { "data-act": "flag", tabindex: "-1" }, icon(m.starred ? "flag" : "flagFill"), m.starred ? "Unflag" : "Flag"),
        h("button.a-trash.lead", { "data-act": "trash", tabindex: "-1" }, icon("trash"), isTrash ? "Delete" : "Trash")
      )
    );
    const wrap = h("div.row-wrap", { role: "listitem", "data-id": m.id }, actions, row);
    if (S.newIds.has(m.id)) wrap.classList.add("content-in");
    return wrap;
  }

  function updateRow(id) {
    const m = S.messages.find((x) => x.id === id);
    const old = els.rows.querySelector(`.row-wrap[data-id="${CSS.escape(id)}"]`);
    if (m && old) old.replaceWith(rowEl(m));
  }

  function markSelectedRow() {
    els.rows.querySelectorAll(".row.selected").forEach((r) => r.classList.remove("selected"));
    if (S.layout === "pad" && S.selectedId) {
      els.rows.querySelector(`.row[data-id="${CSS.escape(S.selectedId)}"]`)?.classList.add("selected");
    }
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
    S.messages = S.messages.filter((m) => m.id !== id);
    if (!S.messages.length) renderRows();
  }

  // Pull to refresh & infinite scroll
  let pullArmed = false;
  function onListScroll() {
    const s = els.listScroll;
    if (s.scrollTop < -70) pullArmed = true;
    if (s.scrollHeight - s.scrollTop - s.clientHeight < 400 && S.hasMore && !S.loadingMore && !S.loading) {
      loadList({ more: true });
    }
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

  const LEFT_W = 84;
  const RIGHT_W = 3 * 78;
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
      if (!row || e.button > 0 || e.target.closest(".swipe-actions")) return;
      const wrap = row.parentElement;
      if (openSwipe && openSwipe !== wrap) closeOpenSwipe();
      g = {
        wrap,
        row,
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        base: Number(wrap.dataset.offset || 0),
        dir: null,
        lastX: e.clientX,
        lastT: performance.now(),
        v: 0,
        x: 0,
        full: null,
      };
    });

    container.addEventListener("pointermove", (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.dir) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          g.dir = "h";
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
      const width = g.wrap.offsetWidth;
      let x = g.base + dx;
      const fullAt = width * 0.58;
      const prevFull = g.full;
      g.full = x > fullAt ? "left" : x < -fullAt ? "right" : null;
      if (g.full !== prevFull && navigator.vibrate) navigator.vibrate(8);
      x = Math.max(-width, Math.min(width, x));
      g.x = x;
      setRowOffset(g.wrap, x, { full: g.full });
    });

    const finish = (e) => {
      if (!g || (e && e.pointerId !== g.id)) return;
      const st = g;
      g = null;
      if (st.dir !== "h") return;
      setTimeout(() => (S.swiping = false), 50);
      st.row.dataset.swiped = "1";
      setTimeout(() => delete st.row.dataset.swiped, 80);
      const id = st.wrap.dataset.id;
      const width = st.wrap.offsetWidth;
      if (st.full === "left") {
        setRowOffset(st.wrap, width, { animate: true, full: "left" });
        setTimeout(() => {
          setRowOffset(st.wrap, 0, { animate: true });
          const m = S.messages.find((x) => x.id === id);
          if (m) setUnread(id, !m.unread);
        }, 260);
        openSwipe = null;
        return;
      }
      if (st.full === "right") {
        setRowOffset(st.wrap, -width, { animate: true, full: "right" });
        openSwipe = null;
        setTimeout(() => trashMessage(id, { fromSwipe: true }), 220);
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
      const act = e.target.closest(".swipe-actions button");
      if (act) {
        const wrap = act.closest(".row-wrap");
        const id = wrap.dataset.id;
        const m = S.messages.find((x) => x.id === id);
        const kind = act.dataset.act;
        if (kind === "more") return rowMoreMenu(act, m);
        closeOpenSwipe();
        if (kind === "read") setUnread(id, !m.unread);
        if (kind === "flag") setStarred(id, !m.starred);
        if (kind === "trash") trashMessage(id, { fromSwipe: true });
        return;
      }
      const row = e.target.closest(".row");
      if (!row || row.dataset.swiped) return;
      if (openSwipe) return closeOpenSwipe();
      openMessage(row.dataset.id);
    });

    container.addEventListener("keydown", (e) => {
      const row = e.target.closest(".row");
      if (row && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openMessage(row.dataset.id);
      }
    });
  }

  function rowMoreMenu(anchor, m) {
    showMenu(anchor, [
      { label: "Reply", icon: "reply", action: () => withMessage(m.id, (msg) => openCompose(replyDraft(msg, "reply"))) },
      { label: "Reply All", icon: "replyAll", action: () => withMessage(m.id, (msg) => openCompose(replyDraft(msg, "replyAll"))) },
      { label: "Forward", icon: "forward", action: () => withMessage(m.id, (msg) => openCompose(replyDraft(msg, "forward"))) },
      "-",
      { label: m.unread ? "Mark as Read" : "Mark as Unread", icon: m.unread ? "envelopeOpen" : "envelopeBadge", action: () => setUnread(m.id, !m.unread) },
      { label: m.starred ? "Unflag" : "Flag", icon: "flag", action: () => setStarred(m.id, !m.starred) },
      "-",
      ...moveItems(m),
    ]);
    closeOpenSwipe();
  }

  async function withMessage(id, fn) {
    try {
      const msg = S.message?.id === id ? S.message : await api.message(id);
      fn(msg);
    } catch (err) {
      toast(err.message, { error: true });
    }
  }

  function moveItems(m) {
    return ["inbox", "archive", "trash"]
      .filter((f) => f !== m.folder)
      .map((f) => ({
        label: f === "inbox" ? "Move to Inbox" : f === "archive" ? "Archive" : "Move to Trash",
        icon: FOLDER_INFO[f].icon,
        destructive: f === "trash",
        action: () => moveMessage(m.id, f),
      }));
  }

  // ---------------------------------------------------------------------------
  // Message actions (optimistic)
  // ---------------------------------------------------------------------------

  function patchLocal(id, patch) {
    const m = S.messages.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
    if (S.message?.id === id) Object.assign(S.message, patch);
    return m;
  }

  async function setUnread(id, unread, { silent } = {}) {
    const m = patchLocal(id, { unread });
    if (m && m.folder === "inbox" && S.counts.inbox) {
      S.counts.inbox.unread = Math.max(0, (S.counts.inbox.unread || 0) + (unread ? 1 : -1));
    }
    updateRow(id);
    markSelectedRow();
    renderListChrome();
    renderMailboxes();
    if (!silent) renderDetailChrome();
    try {
      await api.patch(id, { unread });
    } catch (err) {
      toast(err.message, { error: true });
    }
  }

  async function setStarred(id, starred) {
    patchLocal(id, { starred });
    if (S.counts.flagged) S.counts.flagged.total += starred ? 1 : -1;
    updateRow(id);
    markSelectedRow();
    renderMailboxes();
    if (S.message?.id === id) renderDetail({ keepScroll: true });
    try {
      await api.patch(id, { starred });
    } catch (err) {
      toast(err.message, { error: true });
    }
    if (S.folder === "flagged" && !starred && !S.query) removeRow(id);
  }

  function trashMessage(id, opts) {
    const m = S.messages.find((x) => x.id === id) || (S.message?.id === id ? S.message : null);
    if (m?.folder === "trash") return deleteForever(id);
    return moveMessage(id, "trash", opts);
  }

  async function deleteForever(id) {
    await leaveMessage(id);
    removeRow(id);
    try {
      await api.remove(id);
      toast("Message Deleted", { icon: "trash" });
      refreshCounts();
    } catch (err) {
      toast(err.message, { error: true });
      loadList({ quiet: true });
    }
  }

  // If the message being acted on is open, move away from it first.
  async function leaveMessage(id) {
    if (S.selectedId !== id) return;
    if (S.layout === "phone") {
      if (S.depth === 2) {
        goBack();
        await wait(420);
      }
      S.selectedId = null;
      return;
    }
    const i = S.messages.findIndex((m) => m.id === id);
    const next = S.messages[i + 1] || S.messages[i - 1];
    if (next) openMessage(next.id);
    else {
      S.selectedId = null;
      S.message = null;
      renderDetail();
    }
  }

  async function moveMessage(id, folder, { fromSwipe } = {}) {
    const m = S.messages.find((x) => x.id === id) || (S.message?.id === id ? S.message : null);
    if (!m) return;
    const from = m.folder;
    const removeFromView = !S.query && S.folder !== "flagged";
    await leaveMessage(id);
    patchLocal(id, { folder });
    if (removeFromView) removeRow(id);
    else updateRow(id);
    const label = folder === "trash" ? "Moved to Trash" : folder === "archive" ? "Archived" : `Moved to ${FOLDER_INFO[folder].title}`;
    toast(label, {
      icon: FOLDER_INFO[folder].icon,
      actionLabel: "Undo",
      duration: 4000,
      action: async () => {
        await api.patch(id, { folder: from });
        loadList({ quiet: true });
        refreshCounts();
      },
    });
    try {
      await api.patch(id, { folder });
      refreshCounts();
    } catch (err) {
      toast(err.message, { error: true });
      loadList({ quiet: true });
    }
  }

  async function markAllRead() {
    const ids = S.messages.filter((m) => m.unread).map((m) => m.id);
    if (!ids.length) return;
    ids.forEach((id) => patchLocal(id, { unread: false }));
    renderRows();
    try {
      await api.batch({ ids, unread: false });
    } catch (err) {
      toast(err.message, { error: true });
    }
    refreshCounts();
  }

  async function emptyTrash() {
    const ids = S.messages.map((m) => m.id);
    if (!ids.length) return;
    S.messages = [];
    renderRows();
    if (S.message && ids.includes(S.message.id)) {
      S.message = null;
      S.selectedId = null;
      renderDetail();
    }
    try {
      await api.batch({ ids, delete: true });
      toast("Trash Emptied", { icon: "trash" });
    } catch (err) {
      toast(err.message, { error: true });
    }
    refreshCounts();
    loadList({ quiet: true });
  }

  function listMenu(anchor) {
    const items = [
      { label: "Mark All as Read", icon: "envelopeOpen", disabled: !S.messages.some((m) => m.unread), action: markAllRead },
      {
        label: "Load Remote Images",
        checked: S.remoteImages,
        action: () => {
          S.remoteImages = !S.remoteImages;
          store.set("remoteImages", S.remoteImages);
          if (S.message) renderDetail({ keepScroll: true });
        },
      },
    ];
    if (S.folder === "trash" && !S.query) {
      items.push("-", { label: "Empty Trash", icon: "trash", destructive: true, disabled: !S.messages.length, action: emptyTrash });
    }
    items.push("-", { label: "Sign Out", icon: "signout", destructive: true, action: signOut });
    showMenu(anchor, items);
  }

  async function refreshCounts() {
    try {
      S.counts = await api.counts();
      renderMailboxes();
      renderListChrome();
      updateBadge();
    } catch {}
  }

  function updateBadge() {
    const n = S.counts.inbox?.unread || 0;
    document.title = n ? `Inbox (${n}) · inflite Mail` : "inflite Mail";
    try {
      if (navigator.setAppBadge) n ? navigator.setAppBadge(n) : navigator.clearAppBadge();
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // Reader
  // ---------------------------------------------------------------------------

  async function openMessage(id, { fromNav } = {}) {
    const summary = S.messages.find((m) => m.id === id);
    if (summary?.folder === "drafts") return openDraft(id);
    S.selectedId = id;
    markSelectedRow();
    S.message = summary ? { ...summary, loading: true } : null;
    renderDetail();
    if (S.layout === "phone" && !fromNav) pushDepth(2);
    const token = ++S.detailToken;
    try {
      const msg = await api.message(id);
      if (token !== S.detailToken) return;
      S.message = msg;
      renderDetail({ keepScroll: true });
      if (msg.unread) setUnread(id, false, { silent: true });
    } catch (err) {
      if (token === S.detailToken) toast(err.message, { error: true });
    }
  }

  function stepMessage(dir) {
    const i = S.messages.findIndex((m) => m.id === S.selectedId);
    const next = S.messages[i + dir];
    if (next) openMessage(next.id, { fromNav: true });
  }

  function renderDetailChrome() {
    const m = S.message;
    const i = m ? S.messages.findIndex((x) => x.id === m.id) : -1;
    setKids(els.detailNav, 
      S.layout === "phone" ? gbtn("chevronLeft", folderTitle(), goBack) : null,
      h("div.spacer"),
      m
        ? h(
            "div.gcap.glass",
            h("button", { "aria-label": "Previous Message", disabled: i <= 0, onclick: () => stepMessage(-1) }, icon("chevronUp")),
            h("button", { "aria-label": "Next Message", disabled: i < 0 || i >= S.messages.length - 1, onclick: () => stepMessage(1) }, icon("chevronDown"))
          )
        : null,
      m ? gbtn("more", "More", (e) => detailMenu(e.currentTarget)) : null
    );
    els.detailNavTitle.textContent = m?.subject || "";
    setKids(els.detailToolbar, 
      ...(m
        ? [
            gbtn("trash", m.folder === "trash" ? "Delete" : "Trash", () => trashMessage(m.id)),
            gbtn("folder", "Move", (e) => showMenu(e.currentTarget, moveItems(m), { title: "Move Message" })),
            h("div.spacer"),
            gbtn("reply", "Reply", (e) => replyMenu(e.currentTarget), { disabled: !!m.loading }),
            gbtn("compose", "New Message", () => openCompose()),
          ]
        : S.layout === "pad"
          ? [h("div.spacer"), gbtn("compose", "New Message", () => openCompose())]
          : [])
    );
  }

  function replyMenu(anchor) {
    const m = S.message;
    if (!m) return;
    showMenu(anchor, [
      { label: "Reply", icon: "reply", action: () => openCompose(replyDraft(m, "reply")) },
      { label: "Reply All", icon: "replyAll", action: () => openCompose(replyDraft(m, "replyAll")) },
      { label: "Forward", icon: "forward", action: () => openCompose(replyDraft(m, "forward")) },
    ]);
  }

  function detailMenu(anchor) {
    const m = S.message;
    if (!m) return;
    showMenu(anchor, [
      { label: m.starred ? "Unflag" : "Flag", icon: "flag", action: () => setStarred(m.id, !m.starred) },
      { label: m.unread ? "Mark as Read" : "Mark as Unread", icon: "envelopeBadge", action: () => setUnread(m.id, !m.unread) },
      "-",
      ...moveItems(m),
      "-",
      !DEMO && m.folder !== "sent" && { label: "Download Original", icon: "download", action: () => window.open(api.rawUrl(m.id), "_blank") },
    ]);
  }

  function renderDetail({ keepScroll } = {}) {
    const m = S.message;
    renderDetailChrome();
    els.detailEmpty.style.display = m ? "none" : "";
    const top = els.detailScroll.scrollTop;
    if (!m) {
      setKids(els.detailScroll);
      return;
    }
    const isOutgoing = m.folder === "sent" || m.folder === "drafts";
    const people = [
      m.to.length && `To: ${m.to.map(displayName).join(", ")}`,
      m.cc?.length && `Cc: ${m.cc.map(displayName).join(", ")}`,
    ].filter(Boolean);

    const content = h(
      "div",
      { class: keepScroll ? null : "content-in" },
      h(
        "div.reader-head",
        avatar(isOutgoing ? m.from : m.from, "lg"),
        h(
          "div.who",
          h("div.name", displayName(m.from)),
          h("div.addr", m.from.name ? m.from.email : ""),
          people.map((p) => h("div.addr", p))
        ),
        h("div.when", fmtListDate(m.date))
      ),
      h("div.reader-subject", m.starred ? icon("flagFill", "flag-ic") : null, h("span", m.subject || "(No Subject)")),
      h("div.reader-divider"),
      m.loading ? h("div.load-more", h("div.spinner")) : messageBody(m),
      !m.loading && m.attachments?.length ? attachmentsEl(m.attachments) : null,
      !m.loading ? h("div.subtitle", { style: { padding: "0 20px 20px", fontSize: "13px" } }, fmtLongDate(m.date)) : null
    );
    setKids(els.detailScroll, content);
    if (keepScroll) els.detailScroll.scrollTop = top;
    else els.detailScroll.scrollTop = 0;
    els.detail.classList.toggle("scrolled", els.detailScroll.scrollTop > 28);
  }

  function messageBody(m) {
    if (m.html && m.html.trim()) return htmlFrame(m);
    const lines = escapeHtml(m.text || "").split("\n");
    const html = lines
      .map((l) => (/^\s*&gt;/.test(l) ? `<span class="quote">${linkify(l.replace(/^\s*(&gt;\s?)+/, ""))}</span>` : linkify(l)))
      .join("\n")
      .replace(/<\/span>\n<span class="quote">/g, "\n");
    return h("div.mail-body", { html: html || '<span style="color:var(--label-2)">This message has no content.</span>' });
  }

  function htmlFrame(m) {
    const remotePattern = /(src|background)\s*=\s*["']?\s*https?:|url\(\s*["']?https?:/i;
    const hasRemote = remotePattern.test(m.html);
    const allowRemote = S.remoteImages || m._loadRemote;
    const csp = allowRemote
      ? "default-src 'none'; img-src 'self' data: https: http:; style-src 'unsafe-inline' https:; font-src data: https:; media-src https:"
      : "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src data:";
    const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<base target="_blank">
<style>
html,body{margin:0;padding:0;background:#fff}
body{padding:16px;font:15px/1.5 -apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:#1c1c1e;overflow-wrap:anywhere;-webkit-text-size-adjust:100%}
img{max-width:100%;height:auto}
pre{white-space:pre-wrap}
blockquote{margin:8px 0;padding-left:12px;border-left:2px solid #c7c7cc;color:#555}
a{color:#0a84ff}
</style></head><body>${m.html.replace(/<script[\s\S]*?<\/script>/gi, "")}</body></html>`;

    const frame = h("iframe.mail-frame", {
      title: "Message content",
      sandbox: "allow-same-origin allow-popups allow-popups-to-escape-sandbox",
      referrerpolicy: "no-referrer",
      srcdoc: doc,
    });

    let fitTimer;
    const fit = () => {
      const d = frame.contentDocument;
      if (!d?.body) return;
      d.body.style.zoom = "";
      const avail = frame.clientWidth;
      const sw = d.documentElement.scrollWidth;
      // Shrink wide newsletters to fit, like Mail does.
      if (sw > avail + 2) d.body.style.zoom = String(Math.max(0.4, avail / sw));
      frame.style.height = `${Math.ceil(d.documentElement.scrollHeight * 1)}px`;
    };
    frame.addEventListener("load", () => {
      fit();
      let n = 0;
      clearInterval(fitTimer);
      fitTimer = setInterval(() => {
        if (!frame.isConnected || ++n > 20) return clearInterval(fitTimer);
        fit();
      }, 300);
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
                renderDetail({ keepScroll: true });
              },
            },
            "Load"
          )
        )
      );
    }
    parts.push(h("div.mail-frame-wrap", frame));
    return parts;
  }

  function attachmentsEl(list) {
    return h(
      "div.attachments",
      list.map((a) => {
        const isImg = /^image\//.test(a.type);
        return h(
          "a.att",
          { href: a.url, target: "_blank", rel: "noopener", download: isImg ? null : a.filename },
          h("span.att-ic", isImg ? h("img", { src: a.url, alt: "", loading: "lazy" }) : icon("doc")),
          h("div", h("div.att-name", a.filename), h("div.att-size", fmtSize(a.size)))
        );
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Compose
  // ---------------------------------------------------------------------------

  let sheetState = null;

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

  async function openDraft(id) {
    try {
      const msg = await api.message(id);
      const c = msg.compose || { to: msg.to, cc: msg.cc, subject: msg.subject, text: msg.text };
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
            h("div", h("div.att-name", a.filename), h("div.att-size", fmtSize(a.size))),
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
          });
          toast("Draft Saved", { icon: "drafts" });
          refreshCounts();
          if (S.folder === "drafts") loadList({ quiet: true });
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
            if (S.folder === "drafts") removeRow(c.draftId);
          } catch {}
        }
      },
    };

    update();
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

  function confirmMenu(anchor, title, label) {
    return new Promise((resolve) => {
      let done = false;
      showMenu(anchor, [
        {
          label,
          icon: "arrowUp",
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
      refreshCounts();
      if (["sent", "drafts"].includes(S.folder) && !S.query) loadList({ quiet: true });
    } catch (err) {
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
    const onVV = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb", `${kb > 60 ? kb : 0}px`);
      document.querySelector(".sheet")?.classList.toggle("kb", kb > 60);
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
      if (S.layout === "phone" && S.depth > 1) return goBack();
    }
    const typing = e.target.closest?.("input,textarea,[contenteditable]");
    if (typing || sheetState || menuState || e.metaKey || e.ctrlKey || e.altKey || !els.list) return;
    const m = S.message && !S.message.loading ? S.message : null;
    const k = e.key;
    if (k === "c" || k === "n") return e.preventDefault(), openCompose();
    if (k === "/") return e.preventDefault(), els.searchInput.focus();
    if (k === "j" || k === "ArrowDown") {
      e.preventDefault();
      if (S.selectedId) stepMessage(1);
      else if (S.messages[0]) openMessage(S.messages[0].id);
      return;
    }
    if (k === "k" || k === "ArrowUp") return e.preventDefault(), stepMessage(-1);
    if (!m) return;
    if (k === "r") return openCompose(replyDraft(m, "reply"));
    if (k === "a") return openCompose(replyDraft(m, "replyAll"));
    if (k === "f") return openCompose(replyDraft(m, "forward"));
    if (k === "e") return moveMessage(m.id, "archive");
    if (k === "#" || k === "Delete" || k === "Backspace") return trashMessage(m.id);
    if (k === "u") return setUnread(m.id, !m.unread);
    if (k === "l") return setStarred(m.id, !m.starred);
  });

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------

  function onSignedOut() {
    if (!document.querySelector(".login")) showLogin();
  }

  function showLogin(configured = true) {
    clearInterval(pollTimer);
    const input = h("input", {
      type: "password",
      placeholder: "Password",
      autocomplete: "current-password",
      enterkeyhint: "go",
      "aria-label": "Password",
      autofocus: true,
    });
    const err = h("div.login-error", configured ? "" : "Set the APP_PASSWORD secret on the Worker to sign in.");
    const go = h("button.gbtn.glass.tinted", { type: "submit", "aria-label": "Sign In" }, icon("arrowRight"));
    const card = h(
      "form.login-card.glass",
      {
        onsubmit: async (e) => {
          e.preventDefault();
          if (!input.value) return input.focus();
          go.disabled = true;
          try {
            await api.login(input.value);
            login.style.transition = "opacity .5s var(--ease), transform .6s var(--ease)";
            login.style.opacity = "0";
            login.style.transform = "scale(1.06)";
            await boot();
            setTimeout(() => login.remove(), 500);
          } catch (ex) {
            err.textContent = ex.message;
            card.classList.remove("shake");
            card.offsetWidth;
            card.classList.add("shake");
            input.select();
          } finally {
            go.disabled = false;
          }
        },
      },
      h("div.app-icon", icon("envelope")),
      h("h1", "inflite Mail"),
      h("p", "Sign in to your inbox"),
      h("div.login-field", input, go),
      err,
      !configured && h("a.login-demo", { href: "?demo" }, "Explore the demo instead")
    );
    const login = h("div.login", h("div.blob.b1"), h("div.blob.b2"), h("div.blob.b3"), card);
    document.querySelector(".login")?.remove();
    document.body.append(login);
    setTimeout(() => input.focus(), 400);
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  let pollTimer = null;

  async function boot() {
    const [me, counts] = await Promise.all([api.me(), api.counts()]);
    S.me = me;
    S.counts = counts;
    if (!els.list || !els.list.isConnected) build();
    else {
      renderMailboxes();
      renderListChrome();
    }
    hist("replaceState", { depth: 0 }, "");
    if (S.layout === "phone") {
      hist("pushState", { depth: 1 }, "");
      S.depth = 1;
      setPositions();
    }
    updateBadge();
    await loadList();
    clearInterval(pollTimer);
    pollTimer = setInterval(poll, 30000);
  }

  async function poll() {
    if (document.hidden) return;
    renderListChrome();
    renderMailboxes();
    if (S.swiping || openSwipe || S.loading) return;
    const before = S.counts.inbox?.unread || 0;
    await refreshCounts();
    if (!S.query) await loadList({ quiet: true });
    const after = S.counts.inbox?.unread || 0;
    if (after > before && S.folder !== "inbox") toast(`${after - before} New Message${after - before === 1 ? "" : "s"}`, { icon: "inbox" });
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && S.me) poll();
  });

  window.addEventListener("resize", () => {
    if (els.list) updateLayout();
  });

  async function start() {
    try {
      const s = await api.session();
      if (!s.authenticated) return showLogin(s.configured);
      await boot();
    } catch (err) {
      showLogin();
      toast(err.message || "Can't reach the server", { error: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
