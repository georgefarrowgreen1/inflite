// A shared picker and review surface for standalone and hosted Mail.
const labels = { email: "Email", phone: "Phone", organisation: "Organisation" };
const properties = { email: "EMAIL", phone: "TEL", organisation: "ORG" };
const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
const esc = (value) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|[\r\n]/g, "\\n")
    .replace(/([,;])/g, "\\$1");
const decode = (value) => value.replace(/\\([nN,;\\])/g, (_, ch) => (/n/i.test(ch) ? " " : ch));
const clean = (value) => value.trim().replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, " ");
export function contactFile(person, fields) {
  const name = clean(person.title);
  const lines = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + esc(name), "N:" + esc(name) + ";;;;"];
  for (const key of Object.keys(labels))
    if (fields.includes(key) && person[key]) lines.push(properties[key] + ":" + esc(clean(person[key])));
  lines.push("END:VCARD");
  // vCard physical lines are folded at 75 UTF-8 octets.
  const encoder = new TextEncoder();
  const folded = lines.map((line) => {
    let result = "",
      bytes = 0;
    for (const char of line) {
      const size = encoder.encode(char).length;
      if (bytes + size > 75) {
        result += "\r\n ";
        bytes = 1;
      }
      result += char;
      bytes += size;
    }
    return result;
  });
  const file = new File(
    [folded.join("\r\n") + "\r\n"],
    (name.replace(/[\\/:*?"<>|]/g, "_") || "Contact") + ".vcf",
    { type: "text/vcard" },
  );
  file.contactSummary = fields
    .filter((key) => labels[key] && person[key])
    .map((key) => person[key])
    .join(" · ");
  return file;
}
export function readCards(raw) {
  if (raw.length > 512 * 1024) throw Error("Choose a card smaller than 512 KB.");
  let item;
  const cards = [];
  for (const line of raw
    .replace(/^\uFEFF/, "")
    .replace(/\r?\n[ \t]/g, "")
    .split(/\r?\n/)) {
    if (/^BEGIN:VCARD$/i.test(line)) {
      item = {};
      continue;
    }
    if (/^END:VCARD$/i.test(line)) {
      if (item?.title) cards.push(item);
      if (cards.length > 100) throw Error("Open up to 100 contacts at a time.");
      item = null;
      continue;
    }
    if (!item) continue;
    const ix = line.indexOf(":");
    if (ix < 0) continue;
    const prop = line.slice(0, ix),
      key = prop.split(";")[0].split(".").pop().toUpperCase();
    if (!["FN", "N", "EMAIL", "TEL", "ORG"].includes(key)) continue;
    if (/;ENCODING=/i.test(prop)) throw Error("Choose a UTF-8 vCard 3.0 or 4.0 file.");
    const value = clean(decode(line.slice(ix + 1)));
    if (key === "FN") item.title = value.slice(0, 160);
    if (key === "N" && !item.title)
      item.title = value.split(";").filter(Boolean).reverse().join(" ").slice(0, 160);
    if (
      key === "EMAIL" &&
      !item.email &&
      /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) &&
      value.length <= 254
    )
      item.email = value;
    if (key === "TEL" && !item.phone) {
      const phone = value.replace(/^tel:/i, "");
      if (/^[+\d ()#.*-]{1,40}$/.test(phone)) item.phone = phone;
    }
    if (key === "ORG" && !item.organisation) item.organisation = value.slice(0, 160);
  }
  if (!cards.length) throw Error("No named contact found in this card.");
  return cards;
}
function node(tag, text, cls) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function button(label, run, cls) {
  const b = node("button", label, cls);
  b.type = "button";
  b.addEventListener("click", run);
  return b;
}
function option(label, value) {
  const o = node("option", label);
  o.value = value;
  return o;
}

export function openContactCard({
  anchor,
  base = "",
  owner,
  current,
  me,
  from,
  attach,
  pickFile,
  read,
  demo = false,
  initial,
}) {
  if (!anchor.isConnected || !current()) return;
  const host = anchor.closest("dialog") || anchor.parentElement;
  const dialog = node("dialog", "", "ifl-contact-card");
  dialog.dataset.app = "mail";
  if (!base) {
    const link = node("link");
    link.rel = "stylesheet";
    link.href = new URL("mailsheets.css", import.meta.url);
    dialog.append(link);
  }
  const title = node("h2", read ? "Contact card" : "Attachments");
  title.id = "mail-contact-" + newId();
  dialog.setAttribute("aria-labelledby", title.id);
  const close = button("×", () => dialog.close(), "icc-close");
  close.setAttribute("aria-label", "Close contact card");
  const head = node("header");
  head.append(title, close);
  const body = node("div", "", "icc-body"),
    status = node("p", "", "icc-status");
  status.setAttribute("role", "status");
  dialog.append(head, body, status);
  host.append(dialog);
  dialog.showModal();
  const abort = new AbortController();
  const live = () => dialog.open && current() && anchor.isConnected;
  const observer = new MutationObserver(() => {
    if (!live()) dispose();
  });
  observer.observe(document.body, { subtree: true, childList: true });
  function dispose() {
    observer.disconnect();
    abort.abort();
    dialog.remove();
  }
  dialog.addEventListener("close", dispose, { once: true });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") event.stopPropagation();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  let book = [],
    attachedPerson,
    chosenFields = [],
    incoming;
  async function post(action, data) {
    if (!live()) throw new DOMException("Closed", "AbortError");
    if (demo && action === "list") return { records: [], owner: "demo" };
    if (demo) throw Error("Open your signed-in mailbox to save to People.");
    const res = await fetch(base + "/api/people-cards/" + action, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Inflite": "1" },
      body: JSON.stringify({ ...data, owner }),
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
    });
    const answer = await res.json();
    if (!res.ok) throw Error(answer.error || "Couldn’t reach People.");
    return answer;
  }
  function fields(person, previous, share) {
    const list = node("div", "", "icc-fields"),
      selected = new Set();
    for (const [key, label] of Object.entries({ ...(share ? {} : { title: "Name" }), ...labels })) {
      if (!person[key]) continue;
      const row = node("label"),
        text = node("span"),
        value = node("strong", person[key]);
      text.append(node("small", label), value);
      if (previous?.[key] && previous[key] !== person[key])
        text.append(node("small", "Currently " + previous[key]));
      const cb = node("input");
      cb.type = "checkbox";
      cb.checked = share ? chosenFields.includes(key) : !previous || previous[key] !== person[key];
      if (!share && key === "title" && !previous) {
        cb.checked = true;
        cb.disabled = true;
      }
      if (cb.checked) selected.add(key);
      cb.onchange = () => {
        if (cb.checked) selected.add(key);
        else selected.delete(key);
        action.disabled = !selected.size;
      };
      row.append(text, cb);
      list.append(row);
    }
    const action = button(
      share ? "Attach contact card" : previous ? "Update contact" : "Save to People",
      async () => {
        if (!live() || action.disabled) return;
        if (share) {
          try {
            attach(contactFile(person, [...selected]));
            dialog.close();
          } catch (e) {
            status.textContent = e.message;
          }
          return;
        }
        action.disabled = true;
        const payload = {
          id: previous?.id || createId,
          version: previous?.version || 0,
          operationId: op,
          fields: Object.fromEntries([...selected].map((key) => [key, person[key]])),
        };
        list.inert = true;
        for (const s of body.querySelectorAll("select")) s.disabled = true;
        try {
          await post("save", payload);
          if (!live()) return;
          title.textContent = "Saved to People";
          body.replaceChildren(
            node("strong", person.title),
            button("Done", () => dialog.close(), "icc-primary"),
          );
          status.textContent = "";
        } catch (e) {
          if (live()) {
            status.textContent = e.message;
            action.disabled = false;
            list.inert = false;
            for (const s of body.querySelectorAll("select")) s.disabled = false;
          }
        }
      },
      "icc-primary",
    );
    const createId = newId(),
      op = newId();
    action.disabled = !selected.size;
    return [list, action];
  }
  function share(person, keep) {
    title.textContent = "Share contact";
    status.textContent = "";
    const sameEmail = (record, email) => email && record.email?.toLowerCase() === email.toLowerCase();
    const ownContact = book.find(p => sameEmail(p, from)) || book.find(p => sameEmail(p, me?.account?.email));
    const self = {
      ...ownContact,
      title: me?.displayName || me?.account?.name || from,
      email: from,
    };
    const choices = [self, ...book];
    const picker = node("select");
    picker.setAttribute("aria-label", "Contact from People");
    choices.forEach((p, i) =>
      picker.append(
        option(
          i === 0 ? "My card · " + (p.title || from) : p.title + (p.email ? " · " + p.email : ""),
          String(i),
        ),
      ),
    );
    const idx = person
      ? choices.findIndex((p) => p.id === person.id && p.email === person.email && p.title === person.title)
      : -1;
    if (person && idx < 0) {
      choices.push(person);
      picker.append(option(person.title, String(choices.length - 1)));
    }
    picker.selectedIndex = person ? (idx < 0 ? choices.length - 1 : idx) : 0;
    attachedPerson = choices[picker.selectedIndex];
    if (!keep)
      chosenFields = [["email", "phone", "organisation"].find((key) => attachedPerson[key])].filter(Boolean);
    picker.onchange = () => share(choices[picker.selectedIndex], false);
    body.replaceChildren(node("small", "Contact from People"), picker, ...fields(attachedPerson, null, true));
  }
  function review(index = 0, matchId) {
    title.textContent = "Save to People";
    status.textContent = "";
    const person = incoming[index],
      chooser = node("select");
    chooser.setAttribute("aria-label", "Contact on card");
    incoming.forEach((p, i) => chooser.append(option(p.title, String(i))));
    chooser.selectedIndex = index;
    chooser.onchange = () => review(chooser.selectedIndex);
    const select = node("select");
    select.setAttribute("aria-label", "Save destination");
    select.append(option("Create new contact", ""));
    for (const p of book) select.append(option("Update " + p.title + (p.email ? " · " + p.email : ""), p.id));
    const matches = book.filter(
      (p) =>
        (person.email && p.email?.toLowerCase() === person.email.toLowerCase()) ||
        (person.phone && p.phone && person.phone.replace(/\D/g, "") === p.phone.replace(/\D/g, "")),
    );
    select.value = matchId ?? (matches.length === 1 ? matches[0].id : "");
    select.onchange = () => review(index, select.value);
    const previous = book.find((p) => p.id === select.value);
    body.replaceChildren(
      incoming.length > 1 ? chooser : node("strong", person.title),
      node("small", "Save destination"),
      select,
      ...fields(person, previous, false),
    );
    if (
      previous &&
      ["title", ...Object.keys(labels)].every((key) => !person[key] || person[key] === previous[key])
    )
      status.textContent = "These details are already in People.";
  }
  async function start() {
    title.textContent = read ? "Review contact" : "Share contact";
    body.replaceChildren();
    status.textContent = "Opening People…";
    try {
      if (read) {
        const blob = await read();
        if (!live()) return;
        if (blob.size > 512 * 1024) throw Error("Choose a card smaller than 512 KB.");
        incoming = readCards(await blob.text());
      }
      let cursor = null;
      book = [];
      do {
        const page = await post("list", { cursor });
        if (!live()) return;
        owner = page.owner;
        book.push(...page.records);
        cursor = page.cursor;
      } while (cursor && book.length < 2000);
      book.sort((a, b) => a.title.localeCompare(b.title));
      if (read) review();
      else if (initial) {
        if (initial.size > 512 * 1024) throw Error("Choose a card smaller than 512 KB.");
        const original = readCards(await initial.text());
        if (original.length !== 1) throw Error("This file contains multiple contacts. Attach it as a file to share them together.");
        const p = original[0];
        if (!live()) return;
        chosenFields = Object.keys(labels).filter((k) => p[k]);
        const matches = book.filter(v => v.title === p.title && (!p.email || v.email.toLowerCase() === p.email.toLowerCase()));
        share(matches.length === 1 ? {...matches[0], ...p} : p, true);
      } else share();
    } catch (e) {
      if (live()) {
        status.textContent = e.message;
        body.replaceChildren(button("Try again", start));
      }
    }
  }
  if (read || initial) start();
  else
    body.append(
      button("Choose files", () => {
        dialog.close();
        pickFile();
      }),
      button("Share contact", start, "icc-primary"),
    );
}
