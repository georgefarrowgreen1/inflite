// Mail's connector (One roof stage 4, s4/spec §4.6, §2.4, §2.5; stage 1 §5.3): what InFlite says Mail shares, its
// sections, its files, and the Apps tile's mini. Final from B0-b (MM keeps it): the words, files and lazy are frozen.
// No imports, ≤ 4 KB. No search export: Mail's search provider exists only while the module is mounted (S4-D9).
//   files: the 12 files of the static import graph from mail.js and the 3 stylesheets (§4.4), kept for offline and
//   modulepreloaded; lazy: the two lazy files the root worker also keeps for offline, never preloaded (C11).
export const CONNECTOR = 1;
export const connector = {
  app: "mail", name: "Mail",
  shares: {
    cards: "How many from people are waiting, and what’s back from Later: numbers only",
    search: "Conversations already on screen, on this phone; asking Mail is your choice",
    notifications: "New mail from people and what’s back from Later, through InFlite when you choose",
    actions: "Open People, Updates, Later or Done, or a conversation",
    screens: "People · Updates · Later · Done",
  },
  sections: [["people", "People"], ["updates", "Updates"], ["later", "Later"], ["done", "Done"]],
  aliases: { thread: "people", settings: "people", signin: "people" },
  files: [
    "/mail/roof/mail.js", "/mail/roof/store.js", "/mail/roof/api.js", "/mail/roof/logic.js", "/mail/roof/actions.js",
    "/mail/roof/list.js", "/mail/roof/rows.js", "/mail/roof/menus.js", "/mail/roof/icons.js", "/mail/roof/reader.js",
    "/mail/roof/bodyframe.js", "/mail/roof/outbox.js",
    "/mail/roof/mail.css", "/mail/roof/reader.css", "/mail/roof/mailsheets.css",
  ],
  lazy: ["/mail/roof/compose.js", "/mail/roof/signin.js"],
  mini: (answer) => { const c = answer?.cards?.mail; const n = Number(c?.people); return c && Number.isFinite(n) ? { kind: "num", num: String(n), label: "From people" } : null; },
};
