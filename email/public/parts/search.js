// Mail's search, past its field, loaded as search first opens (app.js: part("search")): its filters, recent searches, the
// people and files suggested as you type, a search said in words, and one that finds nothing, with the searches beside
// it that do. The field itself, the tabs beside it and the search run are app.js's. Given what it uses of Mail's own (M:
// app.js partsContext); what it gives back is what app.js calls.
export default (M) => {
  const { icon, h, setKids, avatar, locale, debounce, api, S, els, runSearch, mine, RECENT_KEY } = M;

  // Search's filters, beside what's typed: who it's from, when, with files, unread. Each kept here and put into the
  // search as the operators it understands (from:, after:/before:, has:attachment, is:unread); the field holds only
  // what's typed (where those operators still work, typed by hand)
  const SF = { from: null, to: null, date: null, files: false, unread: false, trash: false, open: null };
  const DATES = [
    ["today", "Today"],
    ["week", "This week"],
    ["month", "This month"],
    ["older", "Older"],
  ];
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function dateOp(k) {
    const d = new Date();
    if (k === "today") return `after:${ymd(d)}`;
    if (k === "week") return `after:${ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6))}`;
    const first = ymd(new Date(d.getFullYear(), d.getMonth(), 1));
    return k === "month" ? `after:${first}` : k === "older" ? `before:${first}` : "";
  }
  const filtersQuery = () =>
    [SF.from && `from:${SF.from.email}`, SF.to && `to:${SF.to.email}`, SF.date && dateOp(SF.date), SF.files && "has:attachment", SF.unread && "is:unread", SF.trash && "in:trash"]
      .filter(Boolean)
      .join(" ");
  const fullQuery = () => [els.searchInput?.value.trim(), filtersQuery()].filter(Boolean).join(" ");
  const sfAny = () => !!(SF.from || SF.to || SF.date || SF.files || SF.unread || SF.trash);
  function clearFilters() {
    Object.assign(SF, { from: null, to: null, date: null, files: false, unread: false, trash: false, open: null });
  }
  // (a recent search, said in words: its filters by their names, then what was typed)
  function sayQuery(q) {
    const words = [];
    const rest = q.replace(/\b(from|to|has|is|in|before|after):("[^"]*"|\S+)/gi, (t, op, v) => {
      op = op.toLowerCase();
      if (op === "from") words.push(`From ${nameOf(v)}`);
      else if (op === "to") words.push(`To ${nameOf(v)}`);
      else if (op === "in" && /^trash$/i.test(v)) words.push("In Trash");
      else if (op === "has" && /^attach/i.test(v)) words.push("Files");
      else if (op === "is" && /^unread$/i.test(v)) words.push("Unread");
      else if (op === "after" || op === "before") {
        // (one of Date's answers, by its name, while it's still the same day, week or month; else the day it's from)
        const k = DATES.find(([d]) => dateOp(d) === t)?.[0];
        words.push(k ? DATES.find(([d]) => d === k)[1] : `${op === "before" ? "Before" : "Since"} ${new Date(v).toLocaleDateString(locale, { day: "numeric", month: "short" })}`);
      }
      else return t;
      return "";
    });
    return [...words, rest.trim()].filter(Boolean).join(" · ");
  }
  // (someone's first name, if they're among the people you hear from, else their address before the @)
  function nameOf(email) {
    const p = sfPeople.find((x) => x.email === email);
    return p?.name ? p.name.split(/\s+/)[0] : String(email).split("@")[0];
  }
  // (a recent search put back: its filters as filters, the rest typed)
  function restoreQuery(q) {
    clearFilters();
    const today = dateOp("today"), week = dateOp("week"), month = dateOp("month"), older = dateOp("older");
    const rest = q.replace(/\b(from|to|has|is|in|before|after):("[^"]*"|\S+)/gi, (t, op, v) => {
      op = op.toLowerCase();
      if (op === "from") SF.from = { email: v, name: sfPeople.find((x) => x.email === v)?.name || "" };
      else if (op === "to") SF.to = { email: v, name: sfPeople.find((x) => x.email === v)?.name || "" };
      else if (op === "in" && /^trash$/i.test(v)) SF.trash = true;
      else if (op === "has" && /^attach/i.test(v)) SF.files = true;
      else if (op === "is" && /^unread$/i.test(v)) SF.unread = true;
      else if (t === today) SF.date = "today";
      else if (t === week) SF.date = "week";
      else if (t === month) SF.date = "month";
      else if (t === older) SF.date = "older";
      else return t;
      return "";
    });
    return rest.replace(/\s{2,}/g, " ").trim();
  }
  // The people you hear from most, for From (asked for once, as search first opens)
  let sfPeople = [];
  let sfAsked = false;
  function askPeople() {
    if (sfAsked) return;
    sfAsked = true;
    api
      .contacts("")
      .then(({ contacts }) => {
        sfPeople = (contacts || []).filter((p) => p.email && !mine(p.email)).slice(0, 5);
        renderSearchHelp();
      })
      .catch(() => (sfAsked = false));
  }
  // A filter changed: the search again, at once
  function filtersChanged() {
    renderSearchHelp();
    runSearch(fullQuery());
  }

  // Recent searches, kept in this browser (a convenience: nothing is lost without them)

  function recentSearches() {
    try {
      const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 8) : [];
    } catch {
      return [];
    }
  }
  function keepRecent(list) {
    try {
      if (list.length) localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
      else localStorage.removeItem(RECENT_KEY);
    } catch {}
  }
  function rememberSearch(q) {
    q = (q || "").trim().replace(/\s+/g, " ");
    if (q.length < 2) return;
    keepRecent([q, ...recentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase())]);
  }

  // What's being typed now: the last word, and the operator it's for (from: or to:), if any
  function typingToken(q) {
    if (!q || /\s$/.test(q)) return null;
    const word = q.split(/\s+/).pop();
    const m = /^(from|to):(.*)$/i.exec(word);
    if (m) return { word, op: m[1].toLowerCase(), value: m[2].replace(/^"/, "") };
    if (word.includes(":")) return null;
    return { word, op: null, value: word.replace(/^"/, "") };
  }

  // People suggested as you type a name (from those you've written to or heard from)
  const suggest = { q: null, people: [] };
  const suggestSoon = debounce(async (q) => {
    const tok = typingToken(q);
    if (!tok || tok.value.length < (tok.op ? 1 : 2)) {
      if (suggest.people.length) (suggest.people = []), renderSearchHelp();
      return;
    }
    try {
      const { contacts } = await api.contacts(tok.value);
      if (els.searchInput.value !== q) return;
      suggest.q = q;
      suggest.people = (contacts || []).slice(0, 4);
      renderSearchHelp();
    } catch {}
  }, 140);

  function replaceTyping(q, tok, by) {
    return `${q.slice(0, q.length - tok.word.length)}${by} `;
  }

  // While searching: the filters (From and Date opening their choices just under them), then recent searches (before
  // anything's chosen or typed), or people and files for what's being typed
  function renderSearchHelp() {
    const who = SF.from ? nameOf(SF.from.email) : SF.to ? `To ${nameOf(SF.to.email)}` : "";
    if (els.searchTag) {
      els.searchTag.textContent = who;
      els.searchTag.hidden = !who;
      els.searchInput.placeholder = who ? "Search" : "Search mail";
    }
    els.searchHelp.hidden = !S.searching;
    if (!S.searching) return;
    askPeople();
    const q = els.searchInput.value;
    const tok = typingToken(q);
    const recent = q.trim() || sfAny() ? [] : recentSearches();
    const people = tok && suggest.q === q ? suggest.people : [];
    const keep = (e) => e.preventDefault();
    const toggleOpen = (k) => {
      SF.open = SF.open === k ? null : k;
      renderSearchHelp();
    };
    // the filters: the ones on first, blue, named, with an × to take them off
    const chip = (k, on, label, onclick, menu) =>
      h(
        "button.sf",
        {
          type: "button",
          class: [on && "on", SF.open === k && "open"].filter(Boolean).join(" ") || null,
          "aria-pressed": menu ? null : String(!!on),
          "aria-expanded": menu ? String(SF.open === k) : null,
          onpointerdown: keep,
          onclick,
        },
        h("span", label),
        on ? h("span.sf-x", { "aria-hidden": "true" }, icon("x")) : menu ? icon("chevronDown", "sf-dd") : null
      );
    const chips = [
      [!!SF.from, chip("from", !!SF.from, SF.from ? nameOf(SF.from.email) : "From", () => (SF.from ? ((SF.from = null), (SF.open = null), filtersChanged()) : toggleOpen("from")), true)],
      [!!SF.date, chip("date", !!SF.date, SF.date ? DATES.find(([k]) => k === SF.date)[1] : "Date", () => (SF.date ? ((SF.date = null), (SF.open = null), filtersChanged()) : toggleOpen("date")), true)],
      [SF.files, chip("files", SF.files, "Files", () => ((SF.files = !SF.files), filtersChanged()))],
      [SF.unread, chip("unread", SF.unread, "Unread", () => ((SF.unread = !SF.unread), filtersChanged()))],
      // (To and In Trash: shown only while they're on, as the searches offered beside one that finds nothing put them on)
      SF.to && [true, chip("to", true, `To ${nameOf(SF.to.email)}`, () => ((SF.to = null), filtersChanged()))],
      SF.trash && [true, chip("trash", true, "In Trash", () => ((SF.trash = false), filtersChanged()))],
    ].filter(Boolean);
    chips.sort((x, y) => Number(y[0]) - Number(x[0]));
    setKids(
      els.searchHelp,
      h("div.sf-row", { role: "group", "aria-label": "Filters" }, chips.map((c) => c[1])),
      SF.open === "from"
        ? h(
            "div.sf-strip.people",
            sfPeople.length
              ? sfPeople.map((p) =>
                  h(
                    "button.sf-person",
                    {
                      type: "button",
                      "aria-label": `From ${p.name || p.email}`,
                      onpointerdown: keep,
                      onclick: () => {
                        SF.from = { email: p.email, name: p.name || "" };
                        SF.open = null;
                        filtersChanged();
                      },
                    },
                    avatar(p, "sf-av"),
                    h("span", (p.name || p.email.split("@")[0]).split(/\s+/)[0])
                  )
                )
              : h("p.sf-none", "Type a name in Search to find who it’s from.")
          )
        : null,
      SF.open === "date"
        ? h(
            "div.sf-strip.dates",
            { role: "radiogroup", "aria-label": "Date" },
            DATES.map(([k, label]) =>
              h(
                "button",
                {
                  type: "button",
                  role: "radio",
                  "aria-checked": String(SF.date === k),
                  onpointerdown: keep,
                  onclick: () => {
                    SF.date = k;
                    SF.open = null;
                    filtersChanged();
                  },
                },
                label
              )
            )
          )
        : null,
      recent.length
        ? h(
            "div.s-section",
            h("div.s-head", h("span", "Recent"), h("button.s-clear", { type: "button", onpointerdown: keep, onclick: () => (keepRecent([]), renderSearchHelp()) }, "Clear")),
            h(
              "div.s-list",
              recent.map((r) =>
                h(
                  "div.s-item",
                  h(
                    "button.s-main",
                    {
                      type: "button",
                      onpointerdown: keep,
                      onclick: () => {
                        els.searchInput.value = restoreQuery(r);
                        els.searchInput.focus();
                        filtersChanged();
                      },
                    },
                    icon("clock"),
                    h("span.s-text", sayQuery(r))
                  ),
                  h(
                    "button.s-x",
                    { type: "button", "aria-label": `Remove ${sayQuery(r)}`, onpointerdown: keep, onclick: () => (keepRecent(recentSearches().filter((x) => x !== r)), renderSearchHelp()) },
                    icon("x")
                  )
                )
              )
            )
          )
        : null,
      people.length || (tok && !tok.op && tok.value.length >= 2)
        ? h(
            "div.s-section",
            h(
              "div.s-list",
              people.map((p) => {
                const op = tok.op || "from";
                return h(
                  "div.s-item",
                  h(
                    "button.s-main",
                    {
                      type: "button",
                      onpointerdown: keep,
                      onclick: () =>
                        // (From someone: the filter; To someone: typed, as to: has no filter of its own)
                        op === "from"
                          ? ((els.searchInput.value = q.slice(0, q.length - tok.word.length).trimEnd()), (SF.from = { email: p.email, name: p.name || "" }), els.searchInput.focus(), filtersChanged())
                          : editQuery(replaceTyping(q, tok, `to:${p.email}`)),
                    },
                    avatar({ name: p.name, email: p.email }, "s-av"),
                    h("span.s-text", h("b", p.name || p.email), p.name ? h("span.s-sub", p.email) : null),
                    h("span.s-op", op === "to" ? "To" : "From")
                  )
                );
              }),
              tok && !tok.op && tok.value.length >= 2
                ? h(
                    "div.s-item",
                    h(
                      "button.s-main",
                      { type: "button", onpointerdown: keep, onclick: () => editQuery(replaceTyping(q, tok, `file:${tok.value}`)) },
                      h("span.s-ic", icon("clip")),
                      h("span.s-text", h("b", `Files named “${tok.value}”`))
                    )
                  )
                : null
            )
          )
        : null
    );
  }

  function editQuery(v) {
    els.searchInput.value = v.replace(/\s{2,}/g, " ").replace(/^\s+/, "");
    els.searchInput.focus();
    renderSearchHelp();
    runSearch(fullQuery());
  }


  // A search that finds nothing: said in words (whose, when it's someone's), the searches beside it that do find
  // something, each with how many (asked for together, once for each search, only those that find any shown), and
  // Clear filters
  const alts = { q: null, list: [], box: null };
  function searchAlts() {
    const typed = els.searchInput?.value.trim() || "";
    const out = [];
    if (SF.from) {
      const first = nameOf(SF.from.email);
      if (typed || SF.to || SF.date || SF.files || SF.unread) out.push({ icon: "person", color: "blue", label: `Everything from ${first}`, sub: "Without the other filters", patch: { to: null, date: null, files: false, unread: false }, typed: "" });
      out.push({ icon: "sent", color: "blue", label: `Sent to ${first}`, sub: "From you, to this address", patch: { from: null, to: SF.from } });
      if (SF.from.name) out.push({ icon: "search", color: "purple", label: `Mentioning “${first}”`, sub: "Anywhere in the mail", patch: { from: null }, typed: [typed, first].filter(Boolean).join(" ") });
      if (!SF.trash) out.push({ icon: "trash", color: "red", label: `From ${first}, in Trash`, patch: { trash: true } });
    } else {
      if (!SF.trash) out.push({ icon: "trash", color: "red", label: "In Trash", sub: "Deleted mail isn’t searched otherwise", patch: { trash: true } });
      if (typed && sfAny()) out.push({ icon: "search", color: "purple", label: `Just “${typed}”`, sub: "Without the filters", patch: { to: null, date: null, files: false, unread: false, trash: false } });
    }
    if (SF.trash) out.push({ icon: "inbox", color: "blue", label: "Not in Trash", sub: "Everywhere else", patch: { trash: false } });
    // (each one's search, as it would be with it applied)
    for (const a of out) {
      const keep = { ...SF };
      Object.assign(SF, a.patch);
      a.q = [a.typed ?? typed, filtersQuery()].filter(Boolean).join(" ");
      Object.assign(SF, keep);
    }
    return out;
  }
  function useAlt(a) {
    Object.assign(SF, a.patch, { open: null });
    if (a.typed != null) els.searchInput.value = a.typed;
    filtersChanged();
  }
  function drawAlts() {
    if (!alts.box?.isConnected) return;
    const found = alts.list.filter((a) => a.n > 0);
    setKids(
      alts.box,
      found.length ? h("div.e-k", "Try instead") : null,
      found.length
        ? h(
            "div.e-grp",
            found.map((a) =>
              h(
                "button.e-alt",
                { type: "button", "aria-label": `${a.label}: ${a.n} conversation${a.n === 1 ? "" : "s"}`, onclick: () => useAlt(a) },
                h(`span.e-ic.${a.color}`, icon(a.icon)),
                h("span.e-l", a.label, a.sub ? h("small", a.sub) : null),
                h("span.e-n", a.n > 998 ? "999+" : String(a.n)),
                icon("chevronRight", "e-chev")
              )
            )
          )
        : null,
      sfAny() ? h("button.e-clear", { type: "button", onclick: () => (clearFilters(), filtersChanged()) }, "Clear filters") : null
    );
  }
  function emptySearch() {
    const typed = els.searchInput?.value.trim() || "";
    const onlyWho = SF.from && !typed && !SF.to && !SF.date && !SF.files && !SF.unread && !SF.trash;
    const head = SF.from
      ? h("div.e-who", avatar({ name: SF.from.name, email: SF.from.email }, "e-av"), h("span.e-badge", icon("search")))
      : icon("search");
    alts.box = h("div.e-alts");
    if (alts.q !== S.query) {
      const q = (alts.q = S.query);
      alts.list = searchAlts();
      Promise.all(alts.list.map((a) => api.count(a.q).then((r) => (a.n = r.count), () => (a.n = 0)))).then(() => alts.q === q && drawAlts());
    }
    const el = h(
      "div.empty.content-in.e-search",
      head,
      h("b", onlyWho ? `Nothing from ${nameOf(SF.from.email)}` : "No Results"),
      onlyWho ? `No mail from ${SF.from.email}.` : `Nothing matches “${sayQuery(S.query)}”.`,
      alts.box
    );
    queueMicrotask(drawAlts);
    return el;
  }

  return { renderSearchHelp, fullQuery, clearFilters, sayQuery, rememberSearch, suggestSoon, emptySearch };
};
