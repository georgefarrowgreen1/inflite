// InFlite's toast (spec §3.9). B0's stub; FW writes it.
// toast(text, { action: { label, run }, app }) → void. The shared block's look (.ifm-note.ifl-toast, hook .ifl-toast),
// above the tab bar, one at a time, announced through one aria-live region; 3.6 s, or 6 s / until tapped with an action;
// the timer pauses on hover and focus; any action offered here is also reachable elsewhere on the screen. text is
// always set with textContent. app scopes the accent to the toast.
export const STUB = true;
export function toast(text, { action = null, app = null } = {}) {}
