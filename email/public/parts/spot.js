// Mail on Your Day's strip, at the top of a conversation Mail spotted something in (app.js renderDetail: part("spot")),
// as the approved mock-up's "In Mail" view: what it is and when, its facts (a parcel's four-part bar; a bill's last six
// beside its usual), whether it's on Your Day (and the trip a booking's part of), who it's from, and Remove (Put It Back)
// and Wrong (taken off, and that sender's mail of that kind not read for it again). Bookings, parcels and bills alike,
// read by rules alone on Mail's own server (email/src/spot.js, parcels.js, bills.js). Given what it uses of Mail's own
// (M: app.js partsContext); what it gives back is what app.js calls.
export default (M) => {
  const { h, api, S, toast, locale } = M;

  const NS = "http://www.w3.org/2000/svg";
  const GLYPHS = {
    flight: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>',
    train: '<rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 10h12M9 20l-2 2M15 20l2 2M9 13.5h.01M15 13.5h.01"/>',
    bus: '<rect x="5" y="3" width="14" height="14" rx="2.5"/><path d="M5 10h14M8 20v-3M16 20v-3M8.5 13.5h.01M15.5 13.5h.01"/>',
    hotel: '<path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11" r="2"/>',
    car: '<path d="M5 16V12l2-5h10l2 5v4M5 16h14M5 16v2M19 16v2"/><circle cx="8" cy="13.5" r=".6"/><circle cx="16" cy="13.5" r=".6"/>',
    restaurant: '<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 21V3c-2 1.5-3 4-3 7h3"/>',
    event: '<path d="M4 8a2 2 0 0 0 0 4v4h16v-4a2 2 0 0 1 0-4V4H4z" transform="translate(0 2)"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
    booking: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    parcel: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    bill: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    renewal: '<path d="M20 11a8 8 0 0 0-14.6-4.5M4 13a8 8 0 0 0 14.6 4.5"/><path d="M5 3v4h4M19 21v-4h-4"/>',
    trial: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
    sub: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  };
  const BILLS = new Set(["bill", "renewal", "trial", "sub"]);
  const glyph = (kind) => {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", kind === "flight" ? "i fill" : "i");
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = GLYPHS[kind] || GLYPHS.booking;
    return s;
  };
  const fmt = (t, o, tz) => {
    try { return new Intl.DateTimeFormat(locale, { ...o, ...(tz && { timeZone: tz }) }).format(t); } catch { return new Intl.DateTimeFormat(locale, o).format(t); }
  };
  // ("7–10 Nov", or "30 Nov – 2 Dec")
  function range(a, b) {
    const [d1, m1] = [fmt(a, { day: "numeric" }), fmt(a, { month: "short" })], [d2, m2] = [fmt(b, { day: "numeric" }), fmt(b, { month: "short" })];
    if (d1 === d2 && m1 === m2) return `${d1} ${m1}`;
    return m1 === m2 ? `${d1}–${d2} ${m1}` : `${d1} ${m1} – ${d2} ${m2}`;
  }
  const hm = (t, tz) => fmt(t, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, tz);
  const when = (s) => `${fmt(s.start, { weekday: "long" }, s.tz)}${s.kind === "hotel" ? "" : ` ${hm(s.start, s.tz)}`}`;
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  // ("Thu 12")
  const short = (t) => (t == null ? "—" : `${fmt(t, { weekday: "short" })} ${fmt(t, { day: "numeric" })}`);
  const dayWord = (t) => (sameDay(t, Date.now()) ? "today" : sameDay(t, Date.now() + 864e5) ? "tomorrow" : fmt(t, { weekday: "long" }));
  // ("£84.20", "£71")
  const money = (p) => (p == null ? "—" : `£${p % 100 ? (p / 100).toFixed(2) : String(p / 100)}`);
  // ("11–13", "11:30–13")
  const hour = (t) => { const s = hm(t); return s.endsWith(":00") ? String(Number(s.slice(0, 2))) : s; };
  const KINDS = { flight: "flights", train: "trains", bus: "coaches", hotel: "stays", car: "cars", restaurant: "tables", event: "tickets", booking: "invites",
    parcel: "parcels", bill: "bills", renewal: "renewals", trial: "trials", sub: "receipts" };
  const STAGES = ["Ordered", "Shipped", "Out today", "Delivered"];

  // What it is, its facts, and what goes under them (a parcel's bar, a bill's last six)
  function about(s) {
    if (s.kind === "parcel") {
      const title = `Parcel from ${s.shop || s.carrier || "a shop"}${s.stage === 3 ? " · delivered" : s.window ? ` · ${dayWord(s.window.from)}` : s.due != null ? ` · ${dayWord(s.due)}` : ""}`;
      const win = s.stage === 3 ? ["Delivered", s.deliveredAt != null ? hm(s.deliveredAt) : "—"] : s.window ? ["Window", `${hour(s.window.from)}–${hour(s.window.to)}`] : ["Due", short(s.due)];
      const tracking = s.track ? h("a.spot-track", { href: s.track, target: "_blank", rel: "noopener noreferrer" }, "Track ›") : s.ref || "—";
      const bar = h("div.spot-bar", { role: "img", "aria-label": STAGES[s.stage] },
        h("span.spot-steps", STAGES.map((_, i) => h("i", { class: i < s.stage || s.stage === 3 ? "on" : i === s.stage ? "now" : null }))),
        h("span.spot-steplabs", { "aria-hidden": "true" }, STAGES.map((l, i) => h("span", { class: i <= s.stage ? "on" : null }, l))));
      return { title, facts: [["Courier", s.carrier || "—"], win, ["Tracking", tracking]], extra: bar, how: [s.sender || s.carrier, s.ref ? `ref ${s.ref}` : s.order ? `order ${s.order}` : ""] };
    }
    if (BILLS.has(s.kind)) {
      const d = s.due;
      const title = s.kind === "renewal" ? `Renews ${dayWord(d)} · ${money(s.amount)}` : s.kind === "trial" ? `Trial ends ${dayWord(d)}` : s.kind === "sub" ? `${money(s.amount)} paid ${dayWord(d)}` : `${money(s.amount)} due ${dayWord(d)}`;
      const facts = s.kind === "renewal" ? [["Price", money(s.amount)], ["Renews", short(d)], ["Was", money(s.was)]]
        : s.kind === "trial" ? [["Then", money(s.amount)], ["Ends", short(d)], ["Paid by", s.auto ? "Card" : "You"]]
        : [["Amount", money(s.amount)], [s.kind === "sub" ? "Paid" : "Due", short(d)], ["Usual", money(s.usual)]];
      return { title, facts, extra: spark(s), how: [s.sender, s.account ? `account ${s.account}` : ""] };
    }
    const gone = s.status === "cancelled";
    const facts = s.repeat ? [["Next", `${short(s.start)} ${hm(s.start, s.tz)}`], ["Repeats", s.repeat]] : (s.facts || []).slice(0, 2);
    return { title: `${s.title} · ${when(s)}`, facts: [...facts, ["Status", gone ? "Cancelled" : "Booked"]], extra: null, how: [s.sender, s.ref ? `ref ${s.ref}` : ""] };
  }
  // (a bill's last six as small bars, the newest marked when it's more than the usual, and by how much)
  function spark(s) {
    const last = (s.last || []).slice(-6);
    if (last.length < 2) return null;
    const top = Math.max(...last), before = last.slice(0, -1);
    const up = s.usual && s.amount > s.usual ? Math.floor(((s.amount - s.usual) / s.usual) * 100) : 0;
    const lo = Math.min(...before), hi = Math.max(...before);
    return h("div.spot-spark",
      h("span", h("small", `Your last ${last.length} from ${s.sender}`), h("b", `${lo === hi ? money(lo) : `${money(lo)}–${money(hi)}`}, now `, up ? h("span.spot-chg", `+${up}%`) : money(s.amount))),
      h("span.spot-bars", { "aria-hidden": "true" }, last.map((p, i) => h("i", { class: i === last.length - 1 && up ? "now" : null, style: { height: `${Math.max(12, Math.round((p / top) * 100))}%` } }))));
  }

  function card(s, redraw) {
    const gone = s.status === "cancelled";
    const state = gone ? "Cancelled" : s.hidden ? "Not on Your Day" : s.trip ? `On Your Day · part of ${s.trip.name}, ${range(s.trip.start, s.trip.end)}` : "On Your Day";
    const busy = (b) => (el.querySelectorAll("button").forEach((x) => (x.disabled = b)), el.classList.toggle("busy", b));
    async function change(body, said) {
      busy(true);
      try {
        const r = await api.spot(s.id, body);
        if (S.thread && r?.spots) S.thread.spots = r.spots;
        redraw();
        toast(said);
      } catch (err) {
        busy(false);
        toast(err.message || "Couldn’t change that. Try again.", { error: true });
      }
    }
    const a = about(s);
    const el = h(
      "article.spot",
      { class: s.hidden || gone ? "gone" : null, "data-spot": s.id, "data-kind": s.kind, "aria-label": `${a.title}, ${state}` },
      h("div.spot-top", h("span.spot-ic", glyph(s.kind)), h("div.spot-tx", h("small.spot-state", state), h("b", a.title))),
      h("div.spot-facts", a.facts.map(([k, v]) => h("div", k, h("b", v)))),
      a.extra,
      h("div.spot-how", a.how.filter(Boolean).join(" · ")),
      gone
        ? null
        : h(
            "div.spot-btns",
            h("button.chip", { type: "button", "data-act": s.hidden ? "back" : "remove", onclick: () => change({ hidden: !s.hidden }, s.hidden ? "Back on Your Day" : "Hidden") }, s.hidden ? "Put it back" : "Remove"),
            s.hidden ? null : h("button.chip", { type: "button", "data-act": "wrong", onclick: () => change({ wrong: true }, `Hidden. Mail won’t read ${KINDS[s.kind] || "these"} from ${s.sender || "them"} again`) }, "Wrong")
          )
    );
    return el;
  }

  // The strip, into its place at the top of the conversation (el), for the conversation it was drawn for (t)
  function strip(el, t) {
    const draw = () => {
      if (!el.isConnected && el.childNodes.length) return;
      const list = (S.thread?.id === t.id ? S.thread.spots : t.spots) || [];
      el.replaceChildren(...list.slice(0, 4).map((s) => card(s, draw)));
      el.setAttribute("aria-label", "Spotted by Mail");
    };
    el.setAttribute("role", "group");
    draw();
  }

  return { strip };
};
