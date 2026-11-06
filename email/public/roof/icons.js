// Mail's module: its own few glyphs (One roof stage 4, spec §4.1, BI12), app.js's ICONS (11–69) as constant path data,
// drawn by createElementNS: never markup. icon(name) → SVGElement (aria-hidden, currentColor, data-icon); an unknown
// name gives an empty svg. NAMES: the frozen nine (B0-b); inbox, read and unread are added for the row menu and swipes,
// and k-<kind> for Mail on Your Day's strip (reader.js).
const NS = "http://www.w3.org/2000/svg";
const dot = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
// [stroked paths, filled paths]
const P = {
  done: [["m5 12.5 4.5 4.5L19 7.5"]],
  reply: [["M9.5 15 4 9.5 9.5 4", "M4 9.5h10.5a5.5 5.5 0 0 1 5.5 5.5v5"]],
  "reply-all": [["M8 15 2.5 9.5 8 4", "M12.5 15 7 9.5 12.5 4", "M7 9.5h8a5.5 5.5 0 0 1 5.5 5.5v5"]],
  forward: [["M14.5 15 20 9.5 14.5 4", "M20 9.5H9.5A5.5 5.5 0 0 0 4 15v5"]],
  flag: [["M5.5 21V4.5", "M5.5 4.5c4-2 7 2 13 0v9c-6 2-9-2-13 0"]],
  trash: [["M4 6.5h16", "M9 6.5V4.8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.7", "m6 6.5.9 12.6a1.6 1.6 0 0 0 1.6 1.4h7a1.6 1.6 0 0 0 1.6-1.4L18 6.5", "M10 10.5v6M14 10.5v6"]],
  attachment: [["m20.5 11.2-8.3 8.3a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.7-7.7"]],
  more: [[], [dot(5.5, 12, 1.7) + dot(12, 12, 1.7) + dot(18.5, 12, 1.7)]],
  later: [[dot(12, 12, 8.5), "M12 7.5V12l3 2"]],
  inbox: [["M3.5 13.5h4.6l1.4 2.5h5l1.4-2.5h4.6", "M6.2 5h11.6a1 1 0 0 1 .95.68L21 13v4.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5V13l2.25-7.32A1 1 0 0 1 6.2 5z"]],
  read: [["M3 10.5 12 4l9 6.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "m3.5 11 8.5 6 8.5-6"]],
  unread: [["M14 5H5.5A2.5 2.5 0 0 0 3 7.5v9A2.5 2.5 0 0 0 5.5 19h13a2.5 2.5 0 0 0 2.5-2.5V11", "m3.5 7.5 8.5 6 3-2.1"], [dot(19, 5.5, 2.6)]],
  // (Mail on Your Day's strip: what was spotted, by kind, as parts/spot.js draws them on Mail's own page)
  "k-flight": [[], ["M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"]],
  "k-train": [["M9 3h6a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z", "M6 10h12M9 20l-2 2M15 20l2 2"]],
  "k-bus": [["M7.5 3h9A2.5 2.5 0 0 1 19 5.5v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 14.5v-9A2.5 2.5 0 0 1 7.5 3z", "M5 10h14M8 20v-3M16 20v-3"]],
  "k-hotel": [["M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6", dot(7, 11, 2)]],
  "k-car": [["M5 16V12l2-5h10l2 5v4M5 16h14M5 16v2M19 16v2"]],
  "k-restaurant": [["M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 21V3c-2 1.5-3 4-3 7h3"]],
  "k-event": [["M4 10a2 2 0 0 0 0 4v4h16v-4a2 2 0 0 1 0-4V6H4z", "M14 8v12"]],
  "k-booking": [["M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5z", "M4 10h16M9 3v4M15 3v4"]],
  "k-parcel": [["M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z", "M3 7.5 12 12l9-4.5M12 12v9"]],
  "k-bill": [["M6 3h12v18l-3-2-3 2-3-2-3 2z", "M9 8h6M9 12h6"]],
  "k-renewal": [["M20 11a8 8 0 0 0-14.6-4.5M4 13a8 8 0 0 0 14.6 4.5", "M5 3v4h4M19 21v-4h-4"]],
  "k-trial": [[dot(12, 13, 8), "M12 9v4l2.5 2.5M9 2h6"]],
};
export const NAMES = ["done", "reply", "reply-all", "forward", "flag", "trash", "attachment", "more", "later"];

export function icon(name) {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", `m-ic m-ic-${name}`);
  s.setAttribute("aria-hidden", "true");
  s.dataset.icon = P[name] ? name : "";
  const [line = [], fill = []] = P[name] || [];
  for (const [d, filled] of [...line.map((d) => [d, 0]), ...fill.map((d) => [d, 1])]) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    if (filled) p.setAttribute("class", "f");
    s.append(p);
  }
  return s;
}
