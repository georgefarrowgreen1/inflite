// Mail's demo (?demo): the whole of Mail's API, in memory, made up, loaded only for the demo (app.js: part("demo"), as
// Mail opens). Given what it uses of Mail's own (M: app.js partsContext); what it gives back is what app.js calls.
export default (M) => {
  const { dayMs, wait, htmlToText, ApiError } = M;

  function demoApi() {
    const now = Date.now();
    const min = 60000;
    const hr = 60 * min;
    const ME = { name: "George Farrow-Green", email: "hello@inflite.ai" };
    const P = {
      maya: { name: "Maya Chen", email: "maya@studio-north.co" },
      leo: { name: "Leo Martins", email: "leo.martins@fastmail.com" },
      priya: { name: "Priya Shah", email: "priya@lumen.vc" },
      cf: { name: "Cloudflare", email: "noreply@notify.cloudflare.com" },
      alex: { name: "Alex Rivera", email: "alex@rivera.photo" },
      sam: { name: "Sam Okafor", email: "sam@okafor.dev" },
      nw: { name: "Northwind Airlines", email: "trips@northwind-air.example" },
      byte: { name: "The Weekly Byte", email: "editor@weeklybyte.example" },
      parcel: { name: "Parcel & Co", email: "updates@parcel.example" },
      jo: { name: "Jo Whitfield", email: "jo@whitfield.studio" },
    };
    const card = (title, body, cta) => `
      <div style="background:#f4f5f8;padding:28px 12px;font-family:-apple-system,Helvetica,Arial,sans-serif">
        <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden">
          <tr><td style="background:linear-gradient(135deg,#f6821f,#fbad41);height:6px"></td></tr>
          <tr><td style="padding:28px 28px 8px"><h1 style="margin:0;font-size:22px;color:#111">${title}</h1></td></tr>
          <tr><td style="padding:8px 28px 8px;color:#444;font-size:15px;line-height:1.55">${body}</td></tr>
          ${cta ? `<tr><td style="padding:12px 28px 30px"><a href="https://dash.cloudflare.com" style="display:inline-block;background:#0a84ff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">${cta}</a></td></tr>` : ""}
        </table>
      </div>`;
    let seq = 0;
    const mk = (folder, from, subject, text, ago, extra = {}) => ({
      id: `demo-${++seq}`,
      folder,
      threadId: `t-${seq}`,
      mailbox: extra.mailbox || ME.email,
      category: extra.category || "people",
      snoozeUntil: null,
      from,
      to: extra.to || [ME],
      cc: extra.cc || [],
      bcc: [],
      subject,
      snippet: (text || htmlToText((extra.html || "").split(/<blockquote/i)[0])).replace(/\s+/g, " ").slice(0, 200),
      text,
      html: extra.html || "",
      date: now - ago,
      unread: !!extra.unread,
      starred: !!extra.starred,
      hasAttachments: !!extra.attachments?.length,
      attachments: extra.attachments || [],
      messageId: `demo-${seq}@inflite.ai`,
      references: null,
      replyTo: null,
      compose: extra.compose || null,
    });
    const swatch = (c1, c2) =>
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>`)}`;

    // (a small PDF, made here, so the demo's viewer has one to show)
    const demoPdf = (() => {
      try {
        const text = "BT /F1 28 Tf 60 720 Td (October investor update) Tj /F1 14 Tf 0 -40 Td (Activation up 41% month on month.) Tj ET";
        const objs = [
          "<< /Type /Catalog /Pages 2 0 R >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
          `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
          "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        ];
        let pdf = "%PDF-1.4\n";
        const at = objs.map((o, i) => {
          const n = pdf.length;
          pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
          return n;
        });
        const x = pdf.length;
        pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
        return URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
      } catch {
        return "#";
      }
    })();

    const msgs = [
      mk("inbox", P.maya, "Liquid Glass explorations — round 2", "Hi George,\n\nAttached are the updated explorations for the mail client. I pushed the glass a little further on the toolbar and softened the rim highlight so it reads better over photos.\n\nThe sidebar on iPad now floats with a 10pt inset, which feels much closer to the system apps. Let me know what you think before Thursday's review.\n\nMaya", 6 * min, {
        unread: true,
        starred: true,
        attachments: [
          { id: "a1", filename: "Toolbar-v2.png", type: "image/png", size: 842113, url: swatch("#6fb1ff", "#6a3bff") },
          { id: "a2", filename: "Sidebar-iPad.png", type: "image/png", size: 1210331, url: swatch("#19d3c5", "#3a7bff") },
        ],
      }),
      mk("inbox", P.cf, "inflite.ai is ready for Email Sending", "", 38 * min, {
        unread: true,
        category: "updates",
        html: card(
          "Your domain is verified",
          "<p>Good news — <b>inflite.ai</b> passed DNS verification and can now send email through Cloudflare Email Service.</p><p>Bind <code>send_email</code> in your Worker to start sending. Your daily quota is <b>1,000 messages</b> while the service is in beta.</p>",
          "Open dashboard"
        ),
      }),
      mk("inbox", P.leo, "Re: Dinner Friday?", "", 2 * hr, {
        unread: true,
        html: '<div dir="ltr">Brilliant, booked for six at 8. See you there!</div><div dir="ltr"><br></div><div dir="ltr">Leo</div><div dir="ltr"><br><blockquote type="cite">On 27 Oct 2026, at 18:02, George Farrow-Green &lt;hello@inflite.ai&gt; wrote:<br><br></blockquote></div><blockquote type="cite"><div dir="ltr">Count me in! Can you book for six?</div><div dir="ltr"><br><blockquote type="cite">On 27 Oct 2026, at 17:40, Leo Martins wrote:<br><br>A few of us are going to that new place on Columbia Road on Friday around 8. Fancy it?</blockquote></div></blockquote>',
      }),
      mk("sent", ME, "Re: Dinner Friday?", "Count me in! Can you book for six?", 3 * hr, { to: [P.leo] }),
      mk("inbox", P.priya, "Re: Investor update draft", "This reads really well. Two small notes:\n\n1. Lead with the activation numbers — they're the headline.\n2. The roadmap slide can go in the appendix.\n\nHappy to jump on a call tomorrow if useful.\n\nPriya\n\n> On Monday, George wrote:\n> Here's the first draft of the October update…", 5 * hr, {
        starred: true,
        attachments: [
          { id: "a6", filename: "October-update-notes.pdf", type: "application/pdf", size: 184320, url: demoPdf },
          { id: "a7", filename: "Roadmap-appendix.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 48211, url: "#" },
        ],
      }),
      mk("inbox", P.alex, "Photos from the weekend", "Here are a few favourites from Saturday. Full gallery link to follow once I've finished the edit!", 22 * hr, {
        attachments: [
          { id: "a3", filename: "IMG_2041.jpg", type: "image/jpeg", size: 3204112, url: swatch("#ff9a8b", "#ff6a88") },
          { id: "a4", filename: "IMG_2058.jpg", type: "image/jpeg", size: 2876433, url: swatch("#fbc2eb", "#a6c1ee") },
          { id: "a5", filename: "IMG_2077.jpg", type: "image/jpeg", size: 3011876, url: swatch("#84fab0", "#8fd3f4") },
        ],
      }),
      mk("inbox", P.nw, "Your trip to Lisbon is confirmed", "", 26 * hr, {
        category: "updates",
        html: `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px 16px">
          <div style="font-size:13px;letter-spacing:.08em;color:#0a84ff;font-weight:700">BOOKING CONFIRMED</div>
          <h1 style="font-size:26px;margin:6px 0 18px">London → Lisbon</h1>
          <table width="100%" style="border-collapse:collapse;font-size:15px">
            <tr><td style="padding:10px 0;color:#666">Flight</td><td style="text-align:right;font-weight:600">NW 482</td></tr>
            <tr><td style="padding:10px 0;color:#666;border-top:1px solid #eee">Departs</td><td style="text-align:right;border-top:1px solid #eee">Fri 14 Nov · 07:40 LHR</td></tr>
            <tr><td style="padding:10px 0;color:#666;border-top:1px solid #eee">Arrives</td><td style="text-align:right;border-top:1px solid #eee">10:25 LIS</td></tr>
            <tr><td style="padding:10px 0;color:#666;border-top:1px solid #eee">Seat</td><td style="text-align:right;border-top:1px solid #eee">14A</td></tr>
          </table>
          <p style="color:#666;font-size:13px;margin-top:22px">Check-in opens 24 hours before departure.</p></div>`,
      }),
      mk("inbox", P.sam, "Quick question about the API", "Hey George — is the /messages endpoint paginated by cursor or offset? Want to make sure the sync job doesn't double-count.\n\nCheers,\nSam", 2 * dayMs + 3 * hr, { mailbox: "support@inflite.ai", unread: true }),
      mk("inbox", P.byte, "Issue #142: The quiet return of the web app", "", 3 * dayMs, {
        category: "updates",
        unread: true,
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:24px 18px;color:#222">
          <div style="font-family:-apple-system,Helvetica,sans-serif;font-size:12px;letter-spacing:.12em;color:#888">THE WEEKLY BYTE · ISSUE 142</div>
          <h1 style="font-size:30px;line-height:1.15;margin:10px 0 14px">The quiet return of the web app</h1>
          <p style="font-size:17px;line-height:1.6">Home-screen web apps have grown up. With edge runtimes doing the heavy lifting, a single HTML file can feel as native as anything in the App Store…</p>
          <p style="font-size:17px;line-height:1.6">This week: why the best new tools ship as URLs first, and what that means for the rest of us.</p></div>`,
      }),
      mk("inbox", P.parcel, "Your parcel is out for delivery", "Good news! Your parcel is with our driver and will arrive today between 13:00 and 15:00.", 4 * dayMs, { category: "updates" }),
      mk("sent", { name: ME.name, email: "support@inflite.ai" }, "Re: Quick question about the API", "Cursor-based — pass the date of the last message as `before`. Shout if anything looks off.\n\nG", 2 * dayMs, { to: [P.sam], mailbox: "support@inflite.ai" }),
      mk("sent", ME, "Investor update draft", "Hi Priya,\n\nHere's the first draft of the October update. Would love your eyes on it before it goes out.\n\nThanks,\nGeorge", 3 * dayMs, { to: [P.priya] }),
      mk("drafts", ME, "Thursday review agenda", "1. Toolbar glass\n2. iPad sidebar\n3. Compose sheet motion", 1 * hr, {
        to: [P.maya],
        compose: { from: ME.email, to: [P.maya], cc: [], bcc: [], subject: "Thursday review agenda", text: "1. Toolbar glass\n2. iPad sidebar\n3. Compose sheet motion" },
      }),
      mk("archive", P.jo, "Brand guidelines v3", "Final guidelines attached — thanks for all the feedback!", 9 * dayMs),
      mk("trash", P.parcel, "Rate your delivery", "How did we do? Tap a star to rate your delivery.", 6 * dayMs, { category: "updates" }),
    ];
    // (Priya's reply and the message it answers are one conversation)
    const priya = msgs.find((x) => x.subject === "Re: Investor update draft"), sentDraft = msgs.find((x) => x.subject === "Investor update draft");
    if (priya && sentDraft) priya.threadId = sentDraft.threadId;
    const leoIn = msgs.find((x) => x.folder === "inbox" && x.subject === "Re: Dinner Friday?"), leoOut = msgs.find((x) => x.folder === "sent" && x.subject === "Re: Dinner Friday?");
    if (leoIn && leoOut) leoIn.threadId = leoOut.threadId;
    const samIn = msgs.find((x) => x.subject === "Quick question about the API"), samOut = msgs.find((x) => x.subject === "Re: Quick question about the API");
    if (samIn && samOut) samOut.threadId = samIn.threadId;
    const contacts = Object.values(P);
    const delay = () => wait(140 + Math.random() * 160);
    const summary = ({ text, html, attachments, compose, ...m }) => m;

    // The server's conversations (src/threads.js), worked out here from the messages above
    const cleanSubject = (s) => (s || "").replace(/^((re|fwd?)\s*:\s*)+/i, "").trim();
    function threadOf(tid, ms) {
      ms = ms.slice().sort((a, b) => b.date - a.date);
      const latest = ms[0], incoming = ms.find((m) => m.folder !== "sent") || latest, people = [];
      for (const m of ms) {
        const who = m.folder === "sent" ? { name: "You", email: m.from.email, me: true } : m.from;
        if (!people.some((p) => p.email === who.email && !!p.me === !!who.me)) people.push(who);
      }
      const now = Date.now(), snooze = Math.max(0, ...ms.map((m) => m.snoozeUntil || 0));
      return {
        id: tid,
        subject: cleanSubject(latest.subject) || "(No Subject)",
        latest: summary(latest),
        from: incoming.from,
        people,
        count: ms.length,
        unread: ms.filter((m) => m.folder === "inbox" && m.unread).length,
        starred: ms.some((m) => m.starred),
        hasAttachments: ms.some((m) => m.hasAttachments),
        category: ms.some((m) => m.category === "people") ? "people" : "updates",
        done: !ms.some((m) => m.folder === "inbox"),
        trashed: latest.folder === "trash",
        snoozeUntil: snooze > now ? snooze : null,
        mailbox: incoming.mailbox,
        canUnsub: incoming.category === "updates" && /byte|github|stripe|parcel|cloudflare/i.test(incoming.from.email || ""),
        date: latest.date,
        messages: ms.map(summary),
      };
    }
    function allThreads(trash) {
      const map = new Map();
      for (const m of msgs) {
        if (m.folder === "drafts" || (trash ? m.folder !== "trash" : m.folder === "trash")) continue;
        if (!map.has(m.threadId)) map.set(m.threadId, []);
        map.get(m.threadId).push(m);
      }
      return [...map].map(([tid, ms]) => threadOf(tid, ms)).sort((a, b) => b.date - a.date);
    }
    function matches(m, q) {
      return q.split(/\s+/).filter(Boolean).every((t) => {
        const [op, ...rest] = t.split(":"), v = rest.join(":").toLowerCase();
        if (!rest.length) return [m.subject, m.snippet, m.from.name, m.from.email, ...m.to.map((x) => x.email), ...(m.attachments || []).map((a) => a.filename)].join(" ").toLowerCase().includes(t.toLowerCase());
        if (op === "from") return (m.from.name + m.from.email).toLowerCase().includes(v);
        if (op === "to") return [m.mailbox, ...m.to.map((x) => x.email + x.name)].join(" ").toLowerCase().includes(v);
        if (op === "file") return (m.attachments || []).some((a) => a.filename.toLowerCase().includes(v));
        if (op === "has")
          return /^(image|photo)/.test(v)
            ? (m.attachments || []).some((a) => /^image\//.test(a.type))
            : /^pdf/.test(v)
              ? (m.attachments || []).some((a) => a.type === "application/pdf")
              : m.hasAttachments;
        if (op === "is") return v === "unread" ? m.unread : v === "flagged" ? m.starred : v === "done" ? m.folder === "archive" : true;
        if (op === "after" || op === "before") {
          const t = Date.parse(v);
          return !Number.isFinite(t) || (op === "after" ? m.date >= t : m.date < t);
        }
        return true;
      });
    }
    const threadMsgs = (id) => msgs.filter((m) => m.threadId === id && m.folder !== "drafts");
    const demoSet = {
      domain: "inflite.ai",
      catchall: "keep",
      signature: "",
      colors: ["blue", "green", "orange", "pink", "purple", "teal", "grey"],
      addresses: [
        { email: "hello@inflite.ai", name: ME.name, color: "blue", category: null, notify: true, isDefault: true, count: 214, signature: "" },
        { email: "support@inflite.ai", name: "inflite Support", color: "green", category: "updates", notify: false, isDefault: false, count: 38, signature: "The InFlite team\nsupport@inflite.ai" },
      ],
    };
    return {
      async session() {
        return { access: "ok", accountOrigin: "", user: { name: ME.name, handle: "george", email: ME.email, admin: true } };
      },
      async logout() {
        return { ok: true };
      },
      async me() {
        const def = demoSet.addresses.find((a) => a.isDefault)?.email || ME.email;
        return { displayName: ME.name, domain: "inflite.ai", defaultFrom: def, identities: demoSet.addresses.map((a) => a.email), addresses: demoSet.addresses, signature: demoSet.signature };
      },
      async settings() {
        await delay();
        return JSON.parse(JSON.stringify(demoSet));
      },
      async saveSettings(patch) {
        Object.assign(demoSet, patch);
        return this.settings();
      },
      async checkAddress(local) {
        const l = String(local || "").toLowerCase();
        const bad = !/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(l) ? "Use letters, numbers, dots, dashes or underscores, starting and ending with a letter or number." : null;
        const taken = !bad && demoSet.addresses.some((a) => a.email === `${l}@inflite.ai`);
        return { ok: !bad && !taken, problem: bad || (taken ? "That’s already one of your addresses." : null) };
      },
      async createAddress(b) {
        const c = await this.checkAddress(b.local);
        if (!c.ok) throw new ApiError(400, c.problem);
        const a = { email: `${b.local.toLowerCase()}@inflite.ai`, name: b.name || "", color: b.color || "blue", category: b.category ?? null, notify: b.notify !== false, isDefault: false, count: 0 };
        demoSet.addresses.push(a);
        return a;
      },
      async updateAddress(email, patch) {
        const a = demoSet.addresses.find((x) => x.email === email);
        if (patch.isDefault) demoSet.addresses.forEach((x) => (x.isDefault = x === a));
        const { isDefault, ...rest } = patch;
        Object.assign(a, rest);
        return { ...a };
      },
      async deleteAddress(email) {
        demoSet.addresses = demoSet.addresses.filter((a) => a.email !== email);
        return { ok: true };
      },
      async version() {
        return { v: String(Date.now()), build: null };
      },
      async unsubInfo(id) {
        const t = threadOf(id, threadMsgs(id));
        const all = msgs.filter((m) => m.from.email === t.from.email);
        return { sender: t.from, opened: all.filter((m) => !m.unread).length, of: all.length, how: "oneclick" };
      },
      async unsubscribe(id) {
        await delay();
        const from = threadOf(id, threadMsgs(id)).from.email;
        for (const m of msgs) if (m.from.email === from && m.folder === "inbox") m.folder = "archive";
        return { ok: true };
      },
      async counts() {
        const out = { people: { threads: 0, unread: 0 }, updates: { threads: 0, unread: 0 }, flagged: 0, snoozed: 0 };
        for (const t of allThreads()) {
          if (!t.done && t.snoozeUntil) out.snoozed++;
          else if (!t.done) {
            out[t.category].threads++;
            if (t.unread) out[t.category].unread++;
          }
          if (t.starred) out.flagged++;
        }
        out.trash = allThreads(true).length;
        out.drafts = msgs.filter((m) => m.folder === "drafts").length;
        const addr = new Map();
        for (const m of msgs) if (["inbox", "archive"].includes(m.folder)) addr.set(m.mailbox, (addr.get(m.mailbox) || 0) + (m.folder === "inbox" && m.unread ? 1 : 0));
        out.addresses = [...addr].map(([address, unread]) => ({ address, unread }));
        out.inbox = { unread: out.people.unread };
        const later = allThreads().filter((t) => !t.done && t.snoozeUntil).sort((a, b) => a.snoozeUntil - b.snoozeUntil)[0];
        if (later) out.nextLater = { id: later.id, at: later.snoozeUntil, from: later.from, subject: later.subject };
        out.updatesFrom = allThreads().filter((t) => !t.done && !t.snoozeUntil && t.category === "updates").slice(0, 4).map((t) => t.from);
        return out;
      },
      async count(q) {
        return { count: (await this.threads({ view: "all", q })).threads.length };
      },
      async threads({ view, category, address, q }) {
        await delay();
        let list;
        // (in:trash: the search made in the Trash)
        const inTrash = /(^|\s)in:trash(?=\s|$)/i.test(q || "");
        q = (q || "").replace(/(^|\s)in:\S+/gi, " ").trim();
        if (inTrash) list = allThreads(true).filter((t) => !q || threadMsgs(t.id).some((m) => matches(m, q)));
        else if (q) list = allThreads().filter((t) => threadMsgs(t.id).some((m) => matches(m, q)));
        else if (view === "trash") list = allThreads(true);
        else {
          list = allThreads().filter((t) =>
            view === "unread" ? t.unread && !t.done && !t.snoozeUntil : view === "flagged" ? t.starred : view === "attachments" ? t.hasAttachments : view === "done" ? t.done : view === "later" ? !t.done && t.snoozeUntil : !t.done && !t.snoozeUntil
          );
          if (category) list = list.filter((t) => t.category === category);
        }
        if (address) list = list.filter((t) => threadMsgs(t.id).some((m) => m.mailbox === address));
        const drafts = view === "all" && category !== "updates" && !q && !address ? msgs.filter((m) => m.folder === "drafts").map(summary) : [];
        return { threads: list.map(({ messages, ...t }) => t), drafts, hasMore: false };
      },
      async thread(id) {
        await delay();
        const ms = threadMsgs(id);
        const live = ms.filter((m) => m.folder !== "trash");
        if (!ms.length) throw new ApiError(404, "Conversation not found");
        return threadOf(id, live.length ? live : ms);
      },
      async threadAction(id, { action, category, sender, until }) {
        const ms = threadMsgs(id), latestIn = ms.filter((m) => ["inbox", "archive"].includes(m.folder)).sort((a, b) => b.date - a.date)[0];
        if (action === "snooze" && !ms.some((m) => m.folder === "inbox")) for (const m of ms) if (m.folder === "archive") m.folder = "inbox";
        for (const m of ms) {
          if (action === "done" && m.folder === "inbox") Object.assign(m, { folder: "archive", snoozeUntil: null });
          if (action === "inbox" && m.folder === "archive") m.folder = "inbox";
          if (action === "read") m.unread = false;
          if (action === "unflag") m.starred = false;
          if (action === "trash" && m.folder !== "trash") Object.assign(m, { prevFolder: m.folder, folder: "trash", snoozeUntil: null });
          if (action === "restore" && m.folder === "trash") Object.assign(m, { folder: m.prevFolder || "inbox", prevFolder: null });
          if (action === "category") m.category = category;
          if (action === "snooze") m.snoozeUntil = m.folder === "inbox" ? until : m.snoozeUntil;
          if (action === "unsnooze") m.snoozeUntil = null;
        }
        if (action === "unread" && latestIn) latestIn.unread = true;
        if (action === "flag") ms.sort((a, b) => b.date - a.date)[0].starred = true;
        if (action === "category" && sender && latestIn) for (const m of msgs) if (m.from.email === latestIn.from.email) m.category = category;
        if (action === "delete") for (const m of ms) msgs.splice(msgs.indexOf(m), 1);
        return { ok: true };
      },
      async threadBatch({ ids, every, ...body }) {
        for (const id of ids || (await this.threads(every)).threads.map((t) => t.id)) await this.threadAction(id, body);
        return { ok: true };
      },
      async emptyTrash() {
        for (const m of msgs.filter((x) => x.folder === "trash")) msgs.splice(msgs.indexOf(m), 1);
        return { ok: true };
      },
      async message(id) {
        await delay();
        const m = msgs.find((x) => x.id === id);
        if (!m) throw new ApiError(404, "Message not found");
        return { ...m };
      },
      async remove(id) {
        const i = msgs.findIndex((x) => x.id === id);
        if (i >= 0) msgs.splice(i, 1);
        return { ok: true };
      },
      async contacts(q) {
        const s = (q || "").toLowerCase();
        return { contacts: contacts.filter((c) => (c.name + c.email).toLowerCase().includes(s)).slice(0, 6) };
      },
      async send(p) {
        await wait(600);
        const parent = p.inReplyTo && msgs.find((x) => x.messageId === p.inReplyTo);
        const m = mk("sent", { name: ME.name, email: p.from }, p.subject, p.text, 0, { to: p.to, cc: p.cc, html: p.html });
        if (parent) {
          m.threadId = parent.threadId;
          for (const x of msgs) if (x.threadId === parent.threadId) x.unread = false;
        }
        msgs.unshift(m);
        if (p.draftId) await this.remove(p.draftId);
        return { ok: true, id: m.id };
      },
      async saveDraft(d) {
        let m = d.id && msgs.find((x) => x.id === d.id);
        if (!m) {
          m = mk("drafts", ME, d.subject, d.text, 0, { to: d.to });
          msgs.unshift(m);
        }
        Object.assign(m, { subject: d.subject, text: d.text, to: d.to, snippet: d.text.slice(0, 200), date: Date.now(), compose: d });
        return { ok: true, id: m.id };
      },
      rawUrl: () => "#",
    };
  }

  return { demoApi };
};
