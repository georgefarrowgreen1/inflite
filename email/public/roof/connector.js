// Mail's connector (One roof stage 4, spec §4.6): what Mail shares with InFlite, read without loading the module. No
// imports, ≤ 4 KB. files: the module's static import graph from mail.js (12) and its three stylesheets; lazy: the two
// lazy files the root worker keeps for offline (C11). No search export: Mail's provider exists only while it's mounted.
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
