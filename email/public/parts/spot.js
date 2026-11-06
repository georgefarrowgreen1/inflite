// Mail on Your Day's strip, at the top of a conversation Mail spotted a booking in (app.js renderDetail: part("spot")),
// as the approved mock-up's "In Mail" view: what it is and when, its facts, whether it's on Your Day (and the trip it's
// part of), how Mail knows, and Remove (Put It Back) and Wrong (taken off, and that sender's mail of that kind not read
// for it again). Read by rules alone, on Mail's own server (email/src/spot.js). Given what it uses of Mail's own (M:
// app.js partsContext); what it gives back is what app.js calls.
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
  };
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
  const when = (s) => `${fmt(s.start, { weekday: "long" }, s.tz)}${s.kind === "hotel" ? "" : ` ${fmt(s.start, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, s.tz)}`}`;
  const KINDS = { flight: "flights", train: "trains", bus: "coaches", hotel: "stays", car: "cars", restaurant: "tables", event: "tickets", booking: "invites" };

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
    const how = s.source === "ics" ? `Read from the calendar invite ${s.sender || "the sender"} sent` : `Read from the booking details ${s.sender || "the sender"} puts in its email`;
    const el = h(
      "article.spot",
      { class: s.hidden || gone ? "gone" : null, "data-spot": s.id, "aria-label": `${s.title}, ${state}` },
      h("div.spot-top", h("span.spot-ic", glyph(s.kind)), h("div.spot-tx", h("small.spot-state", state), h("b", `${s.title} · ${when(s)}`))),
      h("div.spot-facts", [...(s.facts || []).slice(0, 2), ["Status", gone ? "Cancelled" : "Booked"]].map(([k, v]) => h("div", k, h("b", v)))),
      h("div.spot-how", [how, s.ref && `ref ${s.ref}`].filter(Boolean).join(" · ")),
      gone
        ? null
        : h(
            "div.spot-btns",
            h("button.chip", { type: "button", "data-act": s.hidden ? "back" : "remove", onclick: () => change({ hidden: !s.hidden }, s.hidden ? "Back on Your Day" : "Taken off Your Day") }, s.hidden ? "Put it back" : "Remove"),
            s.hidden ? null : h("button.chip", { type: "button", "data-act": "wrong", onclick: () => change({ wrong: true }, `Taken off. Mail won’t read ${KINDS[s.kind] || "these"} from ${s.sender || "them"} again`) }, "Wrong")
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
