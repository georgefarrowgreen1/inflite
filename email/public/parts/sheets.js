// Mail's sheets for now and then, loaded the first time one's needed (app.js: part("sheets")): Settings, Notifications
// turned on or off on this device, and Unsubscribe. Given what it uses of Mail's own (M: app.js partsContext); what it
// gives back is what app.js calls.
export default (M) => {
  const { icon, h, setKids, avatar, displayName, locale, debounce, DEMO, STANDALONE, PUSH_OK, api, S, els, showMenu, closeMenu, confirmMenu, toast, ADDR_COLORS, loadList, refreshCounts } = M;

  // (at: a page to open it at, over its first: "signature")
  function openSettings(at) {
    if (M.setState || M.sheetState) return;
    closeMenu(true);
    let data = null;
    let failed = null;
    const stack = [];
    const appEl = document.getElementById("app");
    const opener = document.activeElement;
    const scrim = h("div.sheet-scrim", { onclick: () => S.layout === "pad" && close() });
    const pages = h("div.set-pages");
    const sheet = h("div.sheet.set-sheet", { role: "dialog", "aria-modal": "true", "aria-label": "Mail Settings" }, h("div.sheet-grabber"), pages);

    const load = async () => {
      try {
        data = await api.settings();
        failed = null;
      } catch (err) {
        failed = err.message;
      }
      redraw();
      // (opened at the signature: its page, once what it shows has come)
      if (at === "signature" && data && stack.length === 1) push(signatureView);
      at = null;
    };
    // (the rest of Mail told: the From menu, colours and signature)
    const refreshMe = () =>
      api
        .me()
        .then((me) => {
          S.me = { ...S.me, ...me };
        })
        .catch(() => {});

    // A page: its bar (back, title, an action) and what scrolls under it
    let current = null;
    function draw(dir) {
      const view = stack[stack.length - 1];
      const v = view();
      const page = h(
        "div.set-page",
        h("div.set-bar", h("div.set-l", v.left || null), h("div.set-t", v.title || ""), h("div.set-r", v.right || null)),
        h("div.set-scroll", v.body)
      );
      if (current && dir) {
        const old = current;
        page.classList.add(dir === "in" ? "from-right" : "from-left");
        old.classList.add(dir === "in" ? "to-left" : "to-right");
        pages.append(page);
        page.offsetHeight;
        page.classList.remove("from-right", "from-left");
        setTimeout(() => old.remove(), 420);
      } else {
        current?.remove();
        pages.append(page);
      }
      current = page;
      // (a new address: its field, so the keyboard comes up within the tap; else the page's first control)
      if (dir) (page.querySelector(".set-local") || page.querySelector(".set-bar button, .set-scroll button"))?.focus({ preventScroll: true });
    }
    // (a page's controls, in order: the focus kept on the same one when it's drawn again, as what it shows comes)
    const controls = (page) => [...page.querySelectorAll("button, input, textarea")];
    function redraw() {
      if (!M.setState) return;
      const keep = current?.querySelector(".set-scroll")?.scrollTop || 0;
      const focusKey = document.activeElement?.dataset?.k;
      const at = current ? controls(current).indexOf(document.activeElement) : -1;
      draw(null);
      current.querySelector(".set-scroll").scrollTop = keep;
      const f = (focusKey && current.querySelector(`[data-k="${focusKey}"]`)) || (at >= 0 && controls(current)[at]);
      if (f) {
        f.focus({ preventScroll: true });
        try {
          f.setSelectionRange(f.value.length, f.value.length);
        } catch {}
      }
    }
    const push = (view) => (stack.push(view), draw("in"));
    const pop = () => {
      if (stack.length > 1) stack.pop(), draw("out");
      else close();
    };

    // (InFlite's Settings sheet, the same in every app: a round ‹ back on a page inside, a round ✕ to close on every one)
    const backBtn = (label) => h("button.ifs-btn", { type: "button", "aria-label": `Back to ${label}`, onclick: pop }, icon("chevronLeft"));
    const closeBtn = () => h("button.ifs-btn", { type: "button", "aria-label": "Close", onclick: close }, icon("x"));
    const group = (...rows) => h("div.set-group", rows);
    const k = (text) => h("div.set-k", text);
    const hint = (text) => h("p.set-hint", text);
    const dot = (color) => h("span.set-dot", { style: { background: ADDR_COLORS[color] || ADDR_COLORS.blue } });
    function row({ ic, tint, lead, title, sub, value, onclick, end, cls }) {
      return h(
        onclick ? "button.set-row" : "div.set-row",
        { type: onclick ? "button" : null, onclick, class: cls || null },
        ic ? h(`span.set-ic.${tint}`, icon(ic)) : lead || null,
        h("span.set-tx", h("b", title), sub ? h("small", sub) : null),
        value != null ? h("span.set-val", value) : null,
        end !== undefined ? end : onclick ? icon("chevronRight", "set-chev") : null
      );
    }
    function swOf(on, label, onchange) {
      const b = h("button.switch", { type: "button", role: "switch", "aria-checked": String(!!on), "aria-label": label });
      b.addEventListener("click", () => {
        const v = b.getAttribute("aria-checked") !== "true";
        b.setAttribute("aria-checked", String(v));
        onchange(v);
      });
      return b;
    }
    // (Mail decides, or always People, or always Updates)
    function segOf(value, onpick) {
      const opts = [
        [null, "Auto"],
        ["people", "People"],
        ["updates", "Updates"],
      ];
      return h(
        "div.set-seg",
        { role: "radiogroup", "aria-label": "Sort into" },
        opts.map(([v, label]) =>
          h(
            "button",
            { type: "button", role: "radio", "aria-checked": String(value === v), class: value === v ? "on" : null, onclick: () => value !== v && onpick(v) },
            label
          )
        )
      );
    }
    function swatches(value, onpick) {
      return h(
        "div.set-swatches",
        { role: "radiogroup", "aria-label": "Colour" },
        Object.entries(ADDR_COLORS).map(([name, hex]) =>
          h("button.set-swatch", {
            type: "button",
            role: "radio",
            "aria-label": name[0].toUpperCase() + name.slice(1),
            "aria-checked": String(value === name),
            class: value === name ? "on" : null,
            style: `--c: ${hex}`,
            onclick: () => value !== name && onpick(name),
          })
        )
      );
    }
    const arrivesSaid = (a) =>
      [a.name || S.me?.displayName || null, a.category === "updates" ? "to Updates" : a.category === "people" ? "to People" : null, a.notify ? null : "no notifications"]
        .filter(Boolean)
        .join(" · ") || "As Mail sorts it";

    // The first page: the addresses, other addresses, the signature
    function mainView() {
      const done = closeBtn();
      if (!data)
        return {
          title: "Settings",
          right: done,
          body: failed ? group(row({ title: "Couldn’t load Settings", sub: failed, onclick: load, end: null })) : h("div.load-more", h("div.spinner")),
        };
      const catchBtn = row({
        ic: "shield",
        tint: "indigo",
        title: "Mail to other addresses",
        sub: `Anything else @${data.domain}`,
        value: data.catchall === "reject" ? "Turn Away" : "Keep",
        end: icon("chevronDown", "set-chev"),
        onclick: (e) =>
          showMenu(
            e.currentTarget,
            [
              { label: "Keep", sub: "It arrives in Mail, as now", checked: data.catchall !== "reject", action: () => saveSettings({ catchall: "keep" }) },
              { label: "Turn Away", sub: "Its sender hears it doesn’t exist", checked: data.catchall === "reject", action: () => saveSettings({ catchall: "reject" }) },
            ],
            { title: "Mail to Other Addresses", dropdown: true }
          ),
      });
      return {
        title: "Settings",
        right: done,
        body: [
          h("div.set-head", h("img", { src: "/icon-180.png", alt: "", width: 64, height: 64 }), h("b", "Mail"), h("span", "Your addresses and how mail arrives")),
          k("Addresses"),
          group(
            data.addresses.map((a) =>
              row({
                lead: dot(a.color),
                title: [a.email, a.isDefault ? h("span.set-badge", "Default") : null],
                sub: arrivesSaid(a),
                onclick: () => push(() => addressView(a.email)),
              })
            ),
            h("button.set-row.set-add", { type: "button", onclick: () => push(newView()) }, h("span.set-plus", "+"), h("span.set-tx", h("b", "New Address")))
          ),
          k("Receiving"),
          group(catchBtn),
          k("Sending"),
          group(
            row({
              ic: "pen",
              tint: "amber",
              title: "Signature",
              sub: data.signature ? data.signature.split("\n")[0] : "None, for every address",
              onclick: () => push(signatureView),
            })
          ),
          // (Mail on Your Day: what Mail looks for in mail, for Today; read back over 60 days once it's turned on)
          k("Spot in your mail"),
          group(
            row({
              ic: "calendar",
              tint: "green",
              title: "Trips and bookings",
              sub: "Flights, trains, hotels, tables, tickets",
              end: swOf(data.spot?.trips, "Trips and bookings", (v) => {
                let tz = null;
                try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
                saveSettings({ spot: { trips: v, tz } });
              }),
            })
          ),
          hint(
            data.spot?.reading
              ? "Reading the last 60 days of mail for bookings, a few at a time."
              : "Read on Mail’s own server, by rules alone: no AI, and nothing sent anywhere to be read. What it finds is on Your Day, for you alone."
          ),
        ],
      };
    }

    async function saveSettings(patch) {
      const was = data;
      data = { ...data, ...patch };
      redraw();
      try {
        data = await api.saveSettings(patch);
        refreshMe();
      } catch (err) {
        data = was;
        toast(err.message, { error: true });
      }
      redraw();
    }

    async function saveAddress(email, patch) {
      const i = data.addresses.findIndex((a) => a.email === email);
      if (i < 0) return;
      const was = data.addresses[i];
      data.addresses[i] = { ...was, ...patch };
      if (patch.isDefault) data.addresses.forEach((a, j) => (a.isDefault = j === i));
      redraw();
      try {
        const got = await api.updateAddress(email, patch);
        data.addresses[i] = { ...data.addresses[i], ...got };
        refreshMe();
      } catch (err) {
        data.addresses[i] = was;
        toast(err.message, { error: true });
      }
      redraw();
    }

    // An address's own page
    function addressView(email) {
      const a = data?.addresses.find((x) => x.email === email);
      if (!a) return { title: "", left: backBtn("Settings"), right: closeBtn(), body: hint("That address has gone.") };
      const nameInput = h("input.set-input", {
        type: "text",
        value: a.name,
        placeholder: S.me?.displayName || "Name",
        "data-k": "name",
        autocomplete: "off",
        enterkeyhint: "done",
        "aria-label": "Name",
        onkeydown: (e) => e.key === "Enter" && e.currentTarget.blur(),
        onchange: (e) => saveAddress(email, { name: e.currentTarget.value.trim() }),
      });
      return {
        title: `${email.split("@")[0]}@`,
        left: backBtn("Settings"),
        right: closeBtn(),
        body: [
          h(
            "div.set-head",
            h("span.set-big", { style: { background: ADDR_COLORS[a.color] } }, icon("at")),
            h("b", email),
            h("span", a.count ? `${a.count.toLocaleString(locale)} message${a.count === 1 ? "" : "s"}` : "No mail yet")
          ),
          group(h("label.set-field", h("span.set-fl", "Name"), nameInput)),
          hint("The name people see on mail from this address."),
          k("Signature"),
          group(
            h("textarea.set-sig", {
              rows: 4,
              placeholder: data.signature ? `As every address’s: ${data.signature.split("\n")[0]}` : "None",
              "data-k": "asig",
              "aria-label": `Signature for ${email}`,
              onchange: (e) => saveAddress(email, { signature: e.currentTarget.value }),
              value: a.signature || "",
            })
          ),
          hint("Under new messages and replies from this address. Left empty, it has the signature for every address."),
          k("Arrives in"),
          group(row({ ic: "inbox", tint: "blue", title: "Sort into", end: segOf(a.category, (v) => saveAddress(email, { category: v })) })),
          hint("Whether new mail to it notifies you is set in your account, under Notifications."),
          k("Colour"),
          group(h("div.set-row.plain", swatches(a.color, (v) => saveAddress(email, { color: v })))),
          a.isDefault
            ? hint("New messages are sent from this address.")
            : [
                group(row({ ic: "star", tint: "amber", title: "Make Default", sub: "Where new messages are sent from", onclick: () => saveAddress(email, { isDefault: true }), end: null })),
                group(
                  h(
                    "button.set-row.set-danger",
                    {
                      type: "button",
                      onclick: async (e) => {
                        const ok = await confirmMenu(e.currentTarget, `Delete ${email}? Its mail stays in Mail.`, "Delete Address", { destructive: true });
                        if (!ok) return;
                        try {
                          await api.deleteAddress(email);
                          data.addresses = data.addresses.filter((x) => x.email !== email);
                          refreshMe();
                          pop();
                          toast("Address Deleted", { icon: "trash" });
                        } catch (err) {
                          toast(err.message, { error: true });
                        }
                      },
                    },
                    "Delete Address"
                  )
                ),
                hint(data.catchall === "reject" ? "Once it’s deleted, new mail to it is turned away." : "Once it’s deleted, new mail to it still arrives, as mail to other addresses."),
              ],
        ],
      };
    }

    // A new address: what's before the @ (checked as it's typed), its name, where its mail goes, its colour
    function newView() {
      const n = { local: "", name: "", category: null, notify: true, color: Object.keys(ADDR_COLORS)[data.addresses.length % 7], check: null, busy: false };
      let checkToken = 0;
      // (what the check found, said in place, so the field being typed in isn't drawn again)
      const showCheck = () => {
        if (n.saidEl) {
          n.saidEl.className = `set-avail${n.check ? (n.check.ok ? " ok" : " bad") : ""}`;
          setKids(n.saidEl, n.check ? (n.check.ok ? [icon("check"), "Available"] : n.check.problem) : "");
        }
        if (n.createBtn) n.createBtn.disabled = !n.check?.ok || n.busy;
        if (n.hintEl) n.hintEl.textContent = n.local ? `Mail to ${n.local.toLowerCase()}@${data.domain} arrives straight away, and you can send from it.` : "Mail to it arrives straight away, and you can send from it.";
      };
      const check = debounce(async () => {
        const t = ++checkToken;
        const local = n.local.trim().toLowerCase();
        if (!local) return ((n.check = null), showCheck());
        try {
          const r = await api.checkAddress(local);
          if (t === checkToken) ((n.check = r), showCheck());
        } catch {}
      }, 250);
      const create = async () => {
        if (!n.check?.ok || n.busy) return;
        n.busy = true;
        redraw();
        try {
          const a = await api.createAddress({ local: n.local.trim().toLowerCase(), name: n.name.trim(), category: n.category, notify: n.notify, color: n.color });
          data.addresses.push(a);
          refreshMe();
          pop();
          toast(`${a.email} Created`, { icon: "check" });
        } catch (err) {
          n.busy = false;
          toast(err.message, { error: true });
          redraw();
        }
      };
      return () => {
        const localInput = h("input.set-local", {
          type: "text",
          value: n.local,
          placeholder: "name",
          "data-k": "local",
          autocomplete: "off",
          autocapitalize: "off",
          autocorrect: "off",
          spellcheck: "false",
          inputmode: "email",
          enterkeyhint: "next",
          "aria-label": `Address, before @${data.domain}`,
          size: Math.max(4, n.local.length + 1),
          oninput: (e) => {
            e.currentTarget.size = Math.max(4, e.currentTarget.value.length + 1);
            n.local = e.currentTarget.value.replace(/\s+/g, "");
            n.check = null;
            showCheck();
            check();
          },
        });
        const said = h(
          "div.set-avail",
          { class: n.check ? (n.check.ok ? "ok" : "bad") : null, "aria-live": "polite" },
          n.check ? (n.check.ok ? [icon("check"), "Available"] : n.check.problem) : ""
        );
        const createBtn = h("button.set-link.strong", { type: "button", disabled: !n.check?.ok || n.busy, onclick: create }, n.busy ? "Creating…" : "Create");
        n.saidEl = said;
        n.createBtn = createBtn;
        return {
          title: "New Address",
          left: h("button.set-link", { type: "button", onclick: pop }, "Cancel"),
          right: createBtn,
          body: [
            group(h("label.set-addr", localInput, h("span.set-dom", `@${data.domain}`))),
            said,
            k("Shown as"),
            group(
              h(
                "label.set-field",
                h("span.set-fl", "Name"),
                h("input.set-input", {
                  type: "text",
                  value: n.name,
                  placeholder: S.me?.displayName || "Name",
                  "data-k": "nname",
                  autocomplete: "off",
                  "aria-label": "Name",
                  oninput: (e) => (n.name = e.currentTarget.value),
                })
              )
            ),
            k("Arrives in"),
            group(row({ ic: "inbox", tint: "blue", title: "Sort into", end: segOf(n.category, (v) => ((n.category = v), redraw())) })),
            k("Colour"),
            group(h("div.set-row.plain", swatches(n.color, (v) => ((n.color = v), redraw())))),
            (n.hintEl = hint(n.local ? `Mail to ${n.local.toLowerCase()}@${data.domain} arrives straight away, and you can send from it.` : "Mail to it arrives straight away, and you can send from it.")),
          ],
        };
      };
    }

    // The signature: added under new messages and replies
    function signatureView() {
      let t = null;
      const area = h("textarea.set-sig", {
        rows: 6,
        placeholder: "Your signature",
        "data-k": "sig",
        "aria-label": "Signature",
        oninput: () => {
          clearTimeout(t);
          t = setTimeout(() => saveSig(area.value), 700);
        },
        onblur: () => (clearTimeout(t), saveSig(area.value)),
      });
      area.value = data.signature;
      const saveSig = async (v) => {
        if (v === data.signature) return;
        data.signature = v;
        try {
          await api.saveSettings({ signature: v });
          refreshMe();
        } catch (err) {
          toast(err.message, { error: true });
        }
      };
      return { title: "Signature", left: backBtn("Settings"), right: closeBtn(), body: [group(area), hint("Added under new messages and replies, from every address that hasn’t one of its own.")] };
    }

    function close() {
      if (!M.setState) return;
      M.setState = null;
      document.activeElement?.blur?.();
      if (appEl) appEl.inert = false;
      document.body.classList.remove("sheet-open");
      scrim.classList.remove("open");
      sheet.classList.remove("open");
      setTimeout(() => (scrim.remove(), sheet.remove()), 650);
      // (back where it was opened from: your photo, mostly, where InFlite's menu leaves it as it closes; that drawn
      // again meanwhile, or opened with nothing in focus (from the account page), your photo still)
      const back = opener?.isConnected && opener !== document.body ? opener : els.listNav?.querySelector(".profile");
      back?.focus?.({ preventScroll: true });
    }

    sheet.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const f = [...sheet.querySelectorAll(".set-page:last-child button:not(:disabled), .set-page:last-child input, .set-page:last-child textarea")].filter((x) => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) (e.preventDefault(), f[f.length - 1].focus());
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) (e.preventDefault(), f[0].focus());
    });

    M.setState = { back: () => (M.menuState ? closeMenu() : pop()), close };
    stack.push(mainView);
    if (appEl) appEl.inert = true;
    document.body.append(scrim, sheet);
    draw(null);
    // (the focus in it, on its first control, so VoiceOver and the keyboard start there rather than behind it, where
    // nothing can be reached now)
    current.querySelector(".set-bar button, .set-scroll button")?.focus({ preventScroll: true });
    sheet.offsetHeight;
    document.body.classList.add("sheet-open");
    scrim.classList.add("open");
    sheet.classList.add("open");
    load();
  }

  const keyBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

  async function togglePush() {
    if (DEMO) return toast("Demo mode — notifications need the real Mail", { icon: "bell" });
    if (!PUSH_OK) {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      return toast(ios && !STANDALONE ? "Add Mail to your Home Screen to get notifications" : "This browser can’t show notifications", { icon: "bell", duration: 4200 });
    }
    if (S.pushOn) {
      S.pushOn = false;
      try {
        const sub = await (M.swReg || (await navigator.serviceWorker.ready)).pushManager.getSubscription();
        if (sub) {
          await api.pushUnsubscribe(sub.endpoint).catch(() => {});
          await sub.unsubscribe();
        }
      } catch {}
      return toast("Notifications Off", { icon: "bell" });
    }
    // (asked first, while the tap still counts as one)
    const perm = await Notification.requestPermission();
    if (perm !== "granted")
      return toast(perm === "denied" ? "Notifications are blocked for Mail in Settings" : "Notifications stay off", { icon: "bell", duration: 4200 });
    try {
      const reg = M.swReg || (await navigator.serviceWorker.register("/sw.js"));
      M.swReg = reg;
      await navigator.serviceWorker.ready;
      const { key } = await api.pushKey();
      let sub = await reg.pushManager.getSubscription();
      if (sub && keyOf(sub) !== key) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      await api.pushSubscribe(sub.toJSON());
      S.pushOn = true;
      toast("Notifications On: new mail from people", { icon: "bell" });
    } catch (err) {
      toast(err.message || "Couldn’t turn notifications on", { error: true });
    }
  }

  function keyOf(sub) {
    const k = sub.options?.applicationServerKey;
    if (!k) return null;
    return btoa(String.fromCharCode(...new Uint8Array(k))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // Unsubscribe, asked first, with how often you actually open them
  async function unsubSheet(t) {
    closeMenu(true);
    let info;
    try {
      info = await api.unsubInfo(t.id);
    } catch (err) {
      return toast(err.message, { error: true });
    }
    const who = displayName(info.sender) || info.sender.email;
    const layer = h("div.menu-layer.center.unsub-layer");
    const close = () => closeMenu();
    // (their page: opened by the tap itself, a link, as one opened once Mail's answered can be blocked as a pop-up. Asked
    // of Mail first, and its page then turned away, the toast has it to open instead)
    const finish = (url) => {
      const w = url && window.open(url, "_blank");
      if (w) w.opener = null;
      toast(`Finish on ${who}'s page`, w || !url ? { icon: "news" } : { icon: "news", actionLabel: "Open", duration: 10000, action: () => window.open(url, "_blank", "noopener") });
    };
    const go = info.page
      ? h("a.pbtn.danger-btn", { href: info.page, target: "_blank", rel: "noopener noreferrer", onclick: () => (close(), finish()) }, "Unsubscribe")
      : h("button.pbtn.danger-btn", { type: "button" }, "Unsubscribe");
    if (!info.page) go.addEventListener("click", async () => {
      go.disabled = true;
      go.textContent = "Unsubscribing…";
      try {
        const r = await api.unsubscribe(t.id);
        close();
        if (r.open) return finish(r.open);
        toast(`Unsubscribed from ${who}`, { icon: "check" });
        refreshCounts();
        loadList({ quiet: true });
      } catch (err) {
        go.disabled = false;
        go.textContent = "Unsubscribe";
        toast(err.message, { error: true });
      }
    });
    const card = h(
      "div.menu.unsub-card",
      { role: "dialog", "aria-label": `Unsubscribe from ${who}` },
      avatar(info.sender, "unsub-av"),
      h("h3", `Unsubscribe from ${who}?`),
      h(
        "p",
        info.of > 1 ? `You've opened ${info.opened} of their last ${info.of} emails. ` : "",
        info.how === "page" ? "Mail will open their page to finish." : info.how === "mail" && info.to ? `Mail will email ${info.to} to ask them to stop, and move what's here to Done.` : "Mail will ask them to stop, and move what's here to Done."
      ),
      go,
      h("button.pbtn.quiet-btn", { type: "button", onclick: close }, "Cancel")
    );
    layer.addEventListener("pointerdown", (e) => e.target === layer && close());
    layer.append(card);
    document.body.append(layer);
    M.menuState = { layer, menu: card, opener: document.activeElement };
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("open")));
    go.focus({ preventScroll: true });
  }

  return { openSettings, togglePush, unsubSheet };
};
