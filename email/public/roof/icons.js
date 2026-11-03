// Mail's module: its own few glyphs (One roof stage 4, spec §4.1, BI12), app.js's ICONS (11–69) as constant path data,
// drawn by createElementNS: never markup. icon(name) → SVGElement (aria-hidden, currentColor, data-icon); an unknown
// name gives an empty svg. NAMES: the frozen nine (B0-b); inbox, read and unread are added for the row menu and swipes.
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
