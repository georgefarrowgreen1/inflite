// Mail Settings under the roof (One roof stage 4, s4/spec §4.1, §2.2, S4-D11; app.js:2288–2772 without New Address,
// Delete Address and Send From): the lazy framework sheet "mail-settings" (kept offline: connector.lazy, s24-contracts
// §8). B0-b's stub (STUB = true); MR writes it.
// Frozen: openSettings(ctx, page) → sheet handle | null
//   page: null (the top) or a page's name (an address's own page by its email). Pages: Addresses (each one's settings),
//   Unknown Addresses, Signature, Remote Images on this device (mail:remote-images), "New Address, Delete or Send From:
//   Open Mail Settings at Mail’s own address" (a new tab at MAIL + "/#settings"), Notifications → /#you=notify-mail.
export const STUB = true;
export function openSettings(ctx, page = null) {
  return null;
}
