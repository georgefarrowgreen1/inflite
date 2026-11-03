// InFlite's sheet (spec §3.8, D22). B0's stub; FW writes it.
// createSheets(F) → Sheets:
//   open(spec) → Handle, spec = { sheet, label, title, hero, body, acts, onClose, app }
//     sheet: the sheet's name, set as data-sheet on the <dialog> (the names are fixed: search,
//       connector, places, confirm-place, wxsettings, day, detail, warning, credits; MAIN .tools/tests/roofhooks.mjs)
//     label: aria-label when there's no visible title; title: the h2's text; hero: { app, name, line } (.ifs-hero)
//     body: Node | (bodyEl, handle) => void; acts: [{ label, run, primary, destructive, act }] in the sticky
//     footer.ifs-acts (act → data-act); onClose(): after it closes, however; app: the accent for this sheet only
//   Handle = { el (the dialog), body (its .ifs-body), close(), push(page) → pageEl, pop(), setBusy(bool) }
//     push(page), page = { page, title, body, acts }: a pushed page (back ‹ in the head), its container carrying
//     data-page=<page> (hooks: units, arrange, best, commute, solar, forecast)
//   openEl(dialog, { onClose }) → Handle: for the static dialogs in index.html (Morning, Every App's, Edit Today,
//     Weather Notifications), written with the frozen markup below.
//   closeAll(): every framework sheet (never Chat's engine dialog); any route change calls it first (D22).
//   top() → Handle | null; open sheets push no history entry and write no URL.
// While any is open, body.sheet-up is set. <dialog>.showModal(): focus trap, Escape, top layer.
//
// Frozen static markup (B0; TD writes it in index.html, FW styles it; open() builds the same):
// <dialog class="ifl-sheet" id="…" aria-labelledby="…-t"><div class="ifs-grab" aria-hidden="true"></div>
//   <header class="ifs-head"><h2 id="…-t" tabindex="-1">…</h2><button class="ifs-btn" type="button" data-close
//   aria-label="Close">✕</button></header><div class="ifs-body">…</div><footer class="ifs-acts">…</footer></dialog>
// (footer optional)
export const STUB = true;
export function createSheets(F) {
  const handle = () => ({ el: null, body: null, close() {}, push() { return null; }, pop() {}, setBusy() {} });
  return { open: handle, openEl: handle, closeAll() {}, top: () => null };
}
