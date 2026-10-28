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
      counts: () => req("GET", "/api/counts"),
      threads: ({ view, category, address, q, before }) => req("GET", `/api/threads?${qs({ view, category, address, q, before })}`),
      thread: (id) => req("GET", `/api/threads/${id}`),
      threadAction: (id, body) => req("POST", `/api/threads/${id}`, body),
      threadBatch: (body) => req("POST", "/api/threads/batch", body),
      emptyTrash: () => req("POST", "/api/trash/empty", {}),
      pushKey: () => req("GET", "/api/push/key"),
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
      mk("inbox", P.priya, "Re: Investor update draft", "This reads really well. Two small notes:\n\n1. Lead with the activation numbers — they're the headline.\n2. The roadmap slide can go in the appendix.\n\nHappy to jump on a call tomorrow if useful.\n\nPriya\n\n> On Monday, George wrote:\n> Here's the first draft of the October update…", 5 * hr, { starred: true }),
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
        if (!rest.length) return [m.subject, m.snippet, m.from.name, m.from.email, ...m.to.map((x) => x.email)].join(" ").toLowerCase().includes(t.toLowerCase());
        if (op === "from") return (m.from.name + m.from.email).toLowerCase().includes(v);
        if (op === "to") return [m.mailbox, ...m.to.map((x) => x.email + x.name)].join(" ").toLowerCase().includes(v);
        if (op === "has") return m.hasAttachments;
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
        return out;
      },
      async threads({ view, category, address, q }) {
        await delay();
        let list;
        if (q) list = allThreads().filter((t) => threadMsgs(t.id).some((m) => matches(m, q)));
        else if (view === "trash") list = allThreads(true);
        else {
          list = allThreads().filter((t) =>
            view === "unread" ? t.unread : view === "flagged" ? t.starred : view === "attachments" ? t.hasAttachments : view === "done" ? t.done : view === "later" ? !t.done && t.snoozeUntil : !t.done && !t.snoozeUntil
          );
          if (category) list = list.filter((t) => t.category === category);
        }
        if (address) list = list.filter((t) => threadMsgs(t.id).some((m) => m.mailbox === address));
        const drafts = view === "all" && !q && !address ? msgs.filter((m) => m.folder === "drafts").map(summary) : [];
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
    view: "all",
    pushOn: false,
    category: store.get("category", "people"),
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
  // Layout: on iPhone the stream, and a conversation pushed over it; on iPad and Mac, the two side by side
  // ---------------------------------------------------------------------------

  function updateLayout() {
    const w = window.innerWidth;
    const phone = w < 700;
    const body = document.body;
    S.layout = phone ? "phone" : "pad";
    body.classList.toggle("phone", phone);
    body.classList.toggle("pad", !phone);
    body.style.setProperty("--list-left", "0px");
    if (!phone) body.style.setProperty("--list-w", `${Math.round(Math.min(440, Math.max(340, w * 0.36)))}px`);
    setPositions();
    renderNavButtons();
  }

  function setPositions() {
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
  });

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
        g = { x0: t.clientX, y0: t.clientY, dx: 0, active: false, lastX: t.clientX, lastT: performance.now(), v: 0 };
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
        const p = g.dx / W();
        els.detail.style.transform = `translateX(${g.dx}px)`;
        els.list.style.transform = `translateX(${-28 * (1 - p)}%)`;
        els.list.style.opacity = String(Math.min(1, p * 1.4));
      },
      { passive: false }
    );
    const end = () => {
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
    els.seg = h("div.seg.glass", { role: "tablist", "aria-label": "People or Updates" });
    els.chips = h("div.chips", { role: "toolbar", "aria-label": "Views" });
    els.searchHelp = h("div.search-help", { hidden: true });
    els.rows = h("div.rows", { role: "list" });
    els.listFooter = h("div");
    els.listScroll = h(
      "div.scroll",
      h("div.ptr", h("div.spinner")),
      els.listTitle,
      els.listSubtitle,
      els.seg,
      els.chips,
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
        avatar({ name: me.displayName, email: me.defaultFrom }, "sm")
      ),
      h("div.spacer"),
      gbtn("more", "More", (e) => listMenu(e.currentTarget))
    );
    renderDetailChrome();
  }

  // Your account: its page, remote images, and signing out
  function profileMenu(anchor) {
    const me = S.me || {};
    showMenu(
      anchor,
      [
        accountOrigin && { label: "Your Account", icon: "person", action: () => location.assign(`${accountOrigin}/`) },
        { label: "Notifications", checked: S.pushOn, icon: "bell", action: togglePush },
        { label: "Load Remote Images", checked: S.remoteImages, icon: "photo", action: toggleRemoteImages },
        "-",
        { label: "Sign Out", icon: "signout", destructive: true, action: signOut },
      ],
      { title: [me.displayName, me.defaultFrom].filter(Boolean).join(" · ") }
    );
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
  function openFromUrl(url) {
    const id = new URLSearchParams(new URL(url, location.href).hash.slice(1)).get("thread");
    if (!id) return;
    openThread(id);
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

  function listMenu(anchor) {
    const items = [];
    if (S.view !== "trash")
      items.push({ label: "Mark All as Read", icon: "envelopeOpen", disabled: !S.threads.some((t) => t.unread), action: markAllRead });
    if (S.view === "trash") {
      items.push({ label: "Back to Inbox", icon: "inbox", action: () => setView("all") });
      items.push("-", { label: "Empty Trash", icon: "trash", destructive: true, disabled: !S.threads.length, action: emptyTrash });
    } else {
      items.push("-", { label: S.counts.trash ? `Trash (${S.counts.trash})` : "Trash", icon: "trash", action: () => setView("trash") });
    }
    showMenu(anchor, items);
  }

  // ---------------------------------------------------------------------------
  // The stream: its title, People or Updates, the views, search
  // ---------------------------------------------------------------------------

  const listTitle = () => (S.query ? "Search" : VIEWS[S.view].title);

  function renderListChrome() {
    if (!els.listTitle) return;
    const title = listTitle();
    els.listTitle.textContent = title;
    const c = S.counts[S.category] || {};
    const bits = S.query
      ? [`${S.threads.length} conversation${S.threads.length === 1 ? "" : "s"}`]
      : [fmtUpdated(S.updatedAt), S.address && `to ${S.address}`, S.view === "all" && c.unread && `${c.unread} unread`];
    els.listSubtitle.textContent = bits.filter(Boolean).join(" · ") || " ";
    setKids(els.listNavTitle, title, S.view === "all" && !S.query && c.unread ? h("small", `${c.unread} unread`) : null);
    renderSeg();
    renderChips();
    renderSearchHelp();
  }

  function renderSeg() {
    const hide = !!S.query || S.view === "trash";
    els.seg.hidden = hide;
    if (hide) return;
    const btn = (key, label) => {
      const n = S.counts[key]?.unread;
      return h(
        "button.seg-btn",
        { type: "button", role: "tab", "aria-selected": String(S.category === key), class: S.category === key ? "on" : null, onclick: () => setCategory(key) },
        label,
        n ? h("span.seg-n", n) : null
      );
    };
    els.seg.dataset.sel = S.category;
    setKids(els.seg, h("span.seg-thumb", { "aria-hidden": "true" }), btn("people", "People"), btn("updates", "Updates"));
  }

  function renderChips() {
    els.chips.hidden = !!S.query;
    if (S.query) return;
    const chip = (label, on, onclick, n) =>
      h("button.chip", { type: "button", class: on ? "on" : null, "aria-pressed": String(on), onclick }, label, n ? h("span.chip-n", n) : null);
    const views = ["all", "unread", "flagged", "later", "attachments", "done"]
      .filter((v) => v !== "later" || S.counts.snoozed || S.view === "later")
      .map((v) => chip(VIEWS[v].chip, S.view === v, () => setView(v), v === "flagged" ? S.counts.flagged : v === "later" ? S.counts.snoozed : null));
    // (each address mail has come to: a lens on just that address, once there's more than one)
    const addrs = S.counts.addresses || [];
    const lenses =
      addrs.length > 1
        ? addrs.map((a) =>
            chip(h("span", h("span.at", "@"), a.address.split("@")[0]), S.address === a.address, () => setAddress(S.address === a.address ? null : a.address), a.unread)
          )
        : [];
    setKids(els.chips, views, lenses.length ? h("span.chip-sep", { "aria-hidden": "true" }) : null, lenses);
    els.chips.querySelector(".chip.on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  const OPERATORS = ["from:", "to:", "has:attachment", "is:unread", "is:flagged", "is:done", "before:", "after:"];
  const OP_TOKEN = /\b(from|to|has|is|before|after):("[^"]*"|\S+)/gi;

  // While searching: what the search understood, as tokens, and the operators a tap away
  function renderSearchHelp() {
    els.searchHelp.hidden = !S.searching;
    if (!S.searching) return;
    const q = els.searchInput.value;
    const tokens = q.match(OP_TOKEN) || [];
    setKids(
      els.searchHelp,
      tokens.length
        ? h(
            "div.tokens-row",
            tokens.map((t) => {
              const i = t.indexOf(":");
              return h(
                "button.qtoken",
                { type: "button", "aria-label": `Remove ${t}`, onpointerdown: (e) => e.preventDefault(), onclick: () => editQuery(q.replace(t, "")) },
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
          h("button.chip.op", { type: "button", onpointerdown: (e) => e.preventDefault(), onclick: () => editQuery(`${q.trimEnd()} ${o}${o.endsWith(":") ? "" : " "}`) }, o)
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

  function buildListToolbar() {
    els.searchInput = h("input", {
      type: "search",
      placeholder: "Search",
      enterkeyhint: "search",
      autocomplete: "off",
      autocorrect: "off",
      autocapitalize: "off",
      "aria-label": "Search mail",
      oninput: () => {
        renderSearchHelp();
        searchSoon(els.searchInput.value);
      },
      onfocus: () => setSearching(true),
      onkeydown: (e) => e.key === "Escape" && cancelSearch(),
    });
    els.searchCap = h("label.search.glass", icon("search"), els.searchInput);
    els.cancelSearchBtn = gbtn("x", "Cancel Search", cancelSearch, { class: "side show-on-search" });
    els.composeBtn = gbtn("compose", "New Message", () => openCompose(), { class: "side hide-on-search" });
    setKids(els.listToolbar, els.searchCap, els.composeBtn, els.cancelSearchBtn);
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

  function setView(view) {
    if (S.query) cancelSearch();
    if (view === S.view) return;
    S.view = view;
    resetList();
  }

  function setCategory(category) {
    if (category === S.category) return;
    S.category = category;
    store.set("category", category);
    resetList();
  }

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
      const res = await api.threads({
        view: S.view,
        category: S.query || S.view === "trash" ? null : S.category,
        address: S.address,
        q: S.query,
        before: more && last ? last.sort ?? last.date : undefined,
      });
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

  function renderRows() {
    closeOpenSwipe(true);
    const rows = [...S.drafts.map(draftRowEl), ...S.threads.map(threadRowEl)];
    if (!rows.length && !S.loading) setKids(els.rows, emptyEl());
    else setKids(els.rows, ...rows);
    renderFooter();
    S.newIds = new Set();
  }

  function emptyEl() {
    if (S.query) return h("div.empty.content-in", icon("search"), h("b", "No Results"), `Nothing matches “${S.query}”.`);
    if (S.view === "all")
      return h(
        "div.empty.caught-up.content-in",
        h("div.done-badge", icon("check")),
        h("b", "All caught up"),
        S.address ? `Nothing waiting for ${S.address}.` : S.category === "people" ? "No conversations waiting for you." : "No updates waiting."
      );
    const [ic, said] = {
      unread: ["envelopeOpen", "No unread mail"],
      flagged: ["flag", "Nothing flagged"],
      attachments: ["clip", "No attachments"],
      done: ["check", "Nothing done yet"],
      later: ["clock", "Nothing for later"],
      trash: ["trash", "Trash is empty"],
    }[S.view];
    return h("div.empty.content-in", icon(ic), h("b", said));
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
        "aria-label": `${t.unread ? "Unread. " : ""}${peopleLine(t)}. ${t.subject}`,
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
        h("div.subject", t.hasAttachments ? icon("clip") : null, t.subject),
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
    const wrap = h("div.row-wrap", { role: "listitem", "data-id": t.id }, actions, row);
    if (S.newIds.has(t.id)) wrap.classList.add("content-in");
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
    return h("div.row-wrap", { role: "listitem", "data-draft": d.id }, h("div.swipe-actions", h("div.side.left"), h("div.side.right")), row);
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
    if (!S.threads.length && !S.drafts.length) renderRows();
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
      if (openSwipe && openSwipe !== wrap) closeOpenSwipe();
      g = { wrap, row, id: e.pointerId, x0: e.clientX, y0: e.clientY, base: Number(wrap.dataset.offset || 0), dir: null, lastX: e.clientX, lastT: performance.now(), v: 0, x: 0, full: null };
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
      const fullAt = width * 0.5;
      const prevFull = g.full;
      g.full = x > fullAt ? "left" : x < -width * 0.6 ? "right" : null;
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

    container.addEventListener("keydown", (e) => {
      const row = e.target.closest(".row");
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
    const close = () => {
      card.classList.remove("open");
      card.classList.add("closing");
      setTimeout(() => layer.remove(), 240);
    };
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
    layer.append(card);
    document.body.append(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("open")));
    input.focus({ preventScroll: true });
  }

  function rowMoreMenu(anchor, t) {
    showMenu(anchor, [
      { label: "Reply", icon: "reply", action: () => withReplyTarget(t.id, (m) => openCompose(replyDraft(m, "reply"))) },
      { label: "Reply All", icon: "replyAll", action: () => withReplyTarget(t.id, (m) => openCompose(replyDraft(m, "replyAll"))) },
      { label: "Forward", icon: "forward", action: () => withReplyTarget(t.id, (m) => openCompose(replyDraft(m, "forward"))) },
      "-",
      ...categoryItems(t),
      "-",
      t.trashed
        ? { label: "Delete Forever", icon: "trash", destructive: true, action: () => deleteThread(t.id) }
        : { label: "Move to Trash", icon: "trash", destructive: true, action: () => act(t.id, "trash") },
    ]);
    closeOpenSwipe();
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
    if (t.category !== S.category) return false;
    switch (S.view) {
      case "all":
        return !t.done && !t.snoozeUntil;
      case "unread":
        return t.unread > 0;
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
    const t = S.threads.find((x) => x.id === id);
    const patch = action === "category" ? { category: extra.category } : action === "snooze" ? { snoozeUntil: extra.until, done: false } : PATCH[action] || {};
    if (t) Object.assign(t, patch);
    if (S.thread?.id === id) Object.assign(S.thread, patch);
    const leaving = !!t && !inView(t);
    if (leaving && S.selectedId === id) await leaveThread(id);
    if (leaving) removeRow(id);
    else updateRow(id);
    markSelectedRow();
    if (S.thread?.id === id) ["snooze", "unsnooze", "category", "flag", "unflag"].includes(action) ? renderDetail({ keepScroll: true }) : renderDetailChrome();
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

  async function emptyTrash() {
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
  // A conversation: every message in it, newest first; the newest (and any unread) open
  // ---------------------------------------------------------------------------

  async function loadBody(id) {
    if (S.bodies.has(id)) return S.bodies.get(id);
    const m = await api.message(id);
    if (S.bodies.size > 120) S.bodies.clear();
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
    S.selectedId = id;
    markSelectedRow();
    const t = S.threads.find((x) => x.id === id);
    S.thread = { ...(t || { id, people: [], subject: "" }), messages: null, loading: true };
    renderDetail();
    if (S.layout === "phone" && !fromNav) pushDepth(1);
    const token = ++S.detailToken;
    try {
      const full = await api.thread(id);
      if (token !== S.detailToken) return;
      S.expanded = new Set([full.messages[0]?.id, ...full.messages.filter((m) => m.unread && m.folder === "inbox").map((m) => m.id)].filter(Boolean));
      await Promise.all([...S.expanded].map((mid) => loadBody(mid).catch(() => null)));
      if (token !== S.detailToken) return;
      S.thread = full;
      renderDetail({ keepScroll: true });
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
      S.layout === "phone" ? gbtn("chevronLeft", listTitle(), goBack) : null,
      h("div.spacer"),
      t
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
    setKids(
      els.detailToolbar,
      ...(t
        ? [
            h(
              `button.gbtn.glass.text${lead.act === "done" ? ".tinted" : ""}`,
              { "aria-label": lead.label, onclick: () => act(t.id, lead.act) },
              icon(lead.ic),
              lead.act === "done" ? "Done" : lead.label
            ),
            t.trashed ? null : gbtn("clock", "Later", (e) => laterMenu(e.currentTarget, t)),
            gbtn("trash", t.trashed ? "Delete Forever" : "Move to Trash", () => (t.trashed ? deleteThread(t.id) : act(t.id, "trash"))),
            h("div.spacer"),
            gbtn("reply", "Reply", (e) => replyMenu(e.currentTarget), { disabled: !!t.loading }),
            gbtn("compose", "New Message", () => openCompose()),
          ]
        : S.layout === "pad"
          ? [h("div.spacer"), gbtn("compose", "New Message", () => openCompose())]
          : [])
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
    const meta = [
      t.count > 1 && `${t.count} messages`,
      t.category === "updates" ? "Updates" : "People",
      t.mailbox && `to ${t.mailbox}`,
      t.trashed ? "In Trash" : t.done && "Done",
    ].filter(Boolean);
    const content = h(
      "div",
      { class: keepScroll ? null : "content-in" },
      h(
        "header.conv-head",
        h("div.reader-subject", t.starred ? icon("flagFill", "flag-ic") : null, h("span", t.subject || "(No Subject)")),
        h("div.conv-meta", meta.join(" · ")),
        t.snoozeUntil
          ? h(
              "div.later-note",
              icon("clock"),
              h("span", `Comes back ${fmtWhen(t.snoozeUntil)}`),
              h("button", { type: "button", onclick: () => act(t.id, "unsnooze") }, "Bring Back Now")
            )
          : null
      ),
      t.loading || !t.messages ? h("div.load-more", h("div.spinner")) : h("div.msgs", t.messages.map(messageCard))
    );
    setKids(els.detailScroll, content);
    els.detailScroll.scrollTop = keepScroll ? top : 0;
    els.detail.classList.toggle("scrolled", els.detailScroll.scrollTop > 28);
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
      { class: [open && "open", m.unread && m.folder === "inbox" && "unread"].filter(Boolean).join(" ") || null },
      h(
        "button.msg-head",
        { type: "button", "aria-expanded": String(open), onclick: () => toggleMessage(m.id) },
        avatar(m.from),
        h(
          "div.msg-meta",
          h("div.msg-top", h("b", me ? "You" : displayName(m.from)), h("span", fmtListDate(m.date))),
          h("div.msg-sub", open ? toLine || m.from.email : m.snippet || " ")
        )
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
      renderDetail({ keepScroll: true });
      try {
        await loadBody(id);
      } catch (err) {
        toast(err.message, { error: true });
      }
    }
    renderDetail({ keepScroll: true });
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

    let fitTimer;
    const fit = () => {
      const d = frame.contentDocument;
      if (!d?.body) return;
      d.body.style.zoom = "";
      const avail = frame.clientWidth;
      const sw = d.documentElement.scrollWidth;
      // Shrink wide newsletters to fit, like Mail does.
      if (sw > avail + 2) d.body.style.zoom = String(Math.max(0.4, avail / sw));
      frame.style.height = "0px";
      frame.style.height = `${Math.ceil(d.documentElement.scrollHeight)}px`;
    };

    const toggleRow = h("div.quote-row", { hidden: true });
    frame.addEventListener("load", () => {
      if (foldQuotes(frame.contentDocument)) {
        setKids(
          toggleRow,
          quoteToggle((show) => {
            frame.contentDocument?.documentElement.classList.toggle("inflite-showq", show);
            fit();
          })
        );
        toggleRow.hidden = false;
      }
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
      loadList({ quiet: true });
      // (a reply shows in its conversation)
      if (S.thread && job.c.inReplyTo) openThread(S.thread.id, { fromNav: true });
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
    if (k === "r") return withReplyTarget(t.id, (m) => openCompose(replyDraft(m, "reply")));
    if (k === "a") return withReplyTarget(t.id, (m) => openCompose(replyDraft(m, "replyAll")));
    if (k === "f") return withReplyTarget(t.id, (m) => openCompose(replyDraft(m, "forward")));
    if (k === "e") return act(t.id, leadAction(t).act);
    if (k === "#" || k === "Delete" || k === "Backspace") return t.trashed ? deleteThread(t.id) : act(t.id, "trash");
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
      text: "Sign in with your inflite account.",
      button: "Sign In",
    },
    reauth: {
      text: "Mail asks you to confirm it’s you every 12 hours.",
      button: "Confirm It’s You",
    },
    notadmin: {
      text: "Mail is only for the site’s admin.",
      button: "Use Another Account",
    },
    passkey: {
      text: "Add a passkey to your account to use Mail, as Admin needs.",
      button: "Open Your Account",
    },
  };

  function showGate(access = "signin", { user, error } = {}) {
    clearInterval(pollTimer);
    const g = GATE[access] || GATE.signin;
    const who = user && access !== "signin" ? `Signed in as @${user.handle}` : "";
    const go = h(
      "button.gbtn.glass.tinted.text.login-go",
      {
        type: "button",
        onclick: () => {
          go.disabled = true;
          if (access === "passkey") location.assign(`${accountOrigin}/`);
          else goToAccount();
        },
      },
      g.button,
      icon("arrowRight")
    );
    const card = h(
      "div.login-card.glass",
      { role: "dialog", "aria-labelledby": "login-title" },
      h("div.app-icon", icon(access === "signin" ? "envelope" : "lock")),
      h("h1", { id: "login-title" }, "inflite Mail"),
      h("p", g.text),
      go,
      h("div.login-error", { role: "alert" }, error || who)
    );
    ensureSky();
    const login = h("div.login", card);
    document.querySelector(".login")?.remove();
    document.body.append(login);
    if (error) card.classList.add("shake");
    setTimeout(() => go.focus({ preventScroll: true }), 300);
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
    const [me, counts] = await Promise.all([api.me(), api.counts()]);
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
    clearInterval(pollTimer);
    pollTimer = setInterval(poll, 30000);
  }

  async function poll() {
    if (document.hidden) return;
    renderListChrome();
    if (S.swiping || openSwipe || S.loading) return;
    const before = S.counts.people?.unread || 0;
    await refreshCounts();
    if (!S.query) await loadList({ quiet: true });
    const after = S.counts.people?.unread || 0;
    // (new conversations in People, while looking elsewhere)
    if (after > before && (S.category !== "people" || S.view !== "all")) toast(`${after - before} New in People`, { icon: "person" });
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && S.me) poll();
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
