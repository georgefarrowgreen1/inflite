// Mail Notifications in You (One roof stage 4, s4/spec S4-D11, §6.5, §2.6): the sheet dialog#sh-mailnotify in index.html
// (stage 1 §3.8's frozen markup, body #mlnBody), opened at /#you=notify-mail by You's Mail row (the integrator's one
// line in you.js), Mail Settings and search. B0-b's stub: the export is frozen; MT writes it.
//   openMailNotify(F): "Through InFlite" (the account's preference, through Today's /api/notify; off by default) and a
//   switch per address (Mail's /api/notify by CORS: GET plain, PATCH with X-Inflite, only while Mail's hub switch is on;
//   otherwise "Choose which addresses notify you in Mail Settings" with Open Mail). F: InFlite's frame (F.sheet.openEl).
export function openMailNotify(F) {}
