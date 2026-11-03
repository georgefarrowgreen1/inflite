// InFlite's search (spec §3.10, D16: on this device only). B0's stub; FW writes it.
// createSearch(F) → Search = { open(), close(), provide(provider) → off }
//   provider = { id, group, order, search(q) → Entry[] | Promise<Entry[]> }
//   Entry = { title, sub, icon?: app, avatar?: name, href?: path, run?: fn, label? }
//   open() makes the sheet (data-sheet=search) and its input[type=search] and focuses it synchronously, inside the tap.
//   Providers run on every input (80 ms debounce); one slower than 300 ms is shown when it arrives; one that throws is
//   left out. The query never leaves the page: no request, no URL, no history.state, no storage, no log.
export const STUB = true;
export function createSearch(F) {
  return { open() {}, close() {}, provide(provider) { return () => {}; } };
}
