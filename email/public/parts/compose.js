// Mail's compose sheet, loaded the first time it's needed (app.js: part("compose")): a message written (new, a reply, a
// forward, a draft opened again), its files, and sending it, with Undo, by way of the outbox. app.js keeps the outbox
// itself, what's on its way (pendingSends) and the one copy kept of what's being written (keepUnsent), as Mail opens
// and closes with those. Given what it uses of Mail's own (M: app.js partsContext); what it gives back is what app.js
// calls.
export default (M) => {
  const { icon, h, setKids, avatar, fmtSize, extOf, debounce, textToHtml, htmlToText, bodyInner, parseAddress, EMAIL_RE, fileToBase64, dataBlob, ApiError, api, S, showMenu, closeMenu, confirmMenu, undoFor, toast, sigFor, addrColor, renderListChrome, loadList, refreshCounts, openThread, retryFailed, keepUnsent, forgetUnsent, outbox, pendingSends, focusedBefore } = M;

  let sheetOpener = null;

  // An attached file's contents: the file picked, or kept with a draft; one forwarded, from Mail's own copy. One that
  // can't be had is said, never left out (a message or a draft would otherwise go, or be saved over, without it)
  async function attachmentBlob(a) {
    if (a.file) return a.file;
    if (!a.url) return null;
    // (a data: address, made here: the page's own rules, connect-src, don't let fetch read one)
    if (a.url.startsWith("data:")) return dataBlob(a.url);
    const r = await fetch(a.url, { credentials: "same-origin" }).catch(() => null);
    if (!r?.ok) throw new ApiError(r?.status || 0, `Couldn’t attach “${a.filename}”.${r ? "" : " Try again in a moment."}`);
    return r.blob();
  }

  // A draft's attachments kept with it (as data, since the files picked won't be there next time)
  async function draftAttachments(list) {
    const out = [];
    for (const a of list || []) {
      const blob = await attachmentBlob(a);
      if (blob) out.push({ filename: a.filename, type: a.type || blob.type, size: blob.size, content: await fileToBase64(blob) });
    }
    return out;
  }

  async function openDraft(id) {
    try {
      const msg = await api.message(id);
      const c = msg.compose || { to: msg.to, cc: msg.cc, subject: msg.subject, text: msg.text };
      // (the files kept with it, as files again: sent or saved as if just picked)
      c.attachments = (c.attachments || []).map((a) => {
        if (!a.content) return a;
        const file = dataBlob(`data:${a.type || "application/octet-stream"};base64,${a.content}`);
        return { filename: a.filename, type: a.type, size: a.size || file.size, file, preview: /^image\//.test(a.type) ? URL.createObjectURL(file) : null };
      });
      openCompose({ ...c, draftId: id });
    } catch (err) {
      toast(err.message, { error: true });
    }
  }

  // What the outbox kept from before (Mail closed, or put away and closed by iOS, before a message's answer came): those
  // that went after all, let go (Mail's asked); those that were on their way, as messages that didn't send (the dot sends
  // them again); those being changed, to open. Never one another Mail window has, sending it or waiting out its Undo
  // (take). → whether anything was said
  async function offerOutbox() {
    const known = new Set([...pendingSends, ...S.failedSends, ...heldSends].map((j) => j.id));
    const kept = [];
    for (const r of await outbox.all()) {
      if (!r?.id || !r.c || known.has(r.id)) continue;
      if (Date.now() - r.at > 14 * 864e5) outbox.drop(r.id);
      else if (await take(r)) kept.push(r);
    }
    const went = new Set(kept.length ? (await api.sent(kept.map((r) => r.id)).catch(() => null))?.sent || [] : []);
    const jobs = [];
    for (const r of kept) {
      if (went.has(r.id)) { outbox.drop(r.id); letGo(r); continue; }
      const attachments = (r.c.attachments || []).map((a) => ({ ...a, preview: a.file && /^image\//.test(a.type) ? URL.createObjectURL(a.file) : null }));
      jobs.push({ id: r.id, at: r.at, edit: r.edit, kept: true, cancelled: false, timer: null, letGo: r.letGo, c: { ...r.c, attachments } });
    }
    const toSend = jobs.filter((j) => !j.edit), toEdit = jobs.find((j) => j.edit);
    // (those to open, let go: offered, not kept here, so another window, or next time, offers them too)
    for (const j of jobs) if (j.edit) letGo(j);
    if (toSend.length) {
      S.failedSends.push(...toSend);
      renderListChrome();
    }
    if (toEdit) {
      const s = toEdit.c.subject;
      toast(s ? `“${s.slice(0, 40)}” wasn’t sent` : "A message wasn’t sent", { icon: "drafts", actionLabel: "Open", duration: 9000, action: () => bringBack(toEdit) });
    } else if (toSend.length) {
      toast(`${toSend.length === 1 ? "A message" : `${toSend.length} messages`} didn’t send`, { icon: "sent", actionLabel: "Try Again", duration: 9000, action: retryFailed });
    }
    return jobs.length > 0;
  }

  function openCompose(init = {}) {
    if (M.sheetState) return;
    closeMenu(true);
    const c = {
      mode: init.mode || "new",
      from: init.from || S.me?.defaultFrom || "",
      to: (init.to || []).map((p) => ({ ...p })),
      cc: (init.cc || []).map((p) => ({ ...p })),
      bcc: (init.bcc || []).map((p) => ({ ...p })),
      subject: init.subject || "",
      text: init.text || "",
      quote: init.quote || null,
      inReplyTo: init.inReplyTo || null,
      references: init.references || null,
      threadId: init.threadId || null,
      attachments: init.attachments || [],
      draftId: init.draftId || null,
      showCc: !!((init.cc && init.cc.length) || (init.bcc && init.bcc.length)),
    };
    // (the signature for the address it's from, under a new message or reply, as Settings has it; kept as c.sig, so a
    // change of address changes it too, while it's as it was put in)
    c.sig = !init.draftId && !c.text ? sigFor(c.from) : "";
    if (c.sig) c.text = `\n\n${c.sig}`;
    const snapshot = JSON.stringify([c.to, c.cc, c.bcc, c.subject, c.text, c.attachments.length]);

    const scrim = h("div.sheet-scrim");
    const titleEl = h("h2");
    const sendBtn = h(
      "button.gbtn.glass.tinted",
      { "aria-label": "Send", title: "Send", onclick: () => doSend() },
      icon("arrowUp")
    );
    const closeBtn = h("button.gbtn.glass", { "aria-label": "Close", title: "Close", onclick: () => requestCloseCompose() }, icon("x"));
    const head = h("div.sheet-head", closeBtn, titleEl, sendBtn);

    const fileInput = h("input", {
      type: "file",
      multiple: true,
      style: { display: "none" },
      onchange: () => addFiles(fileInput.files),
    });

    const fields = {};
    const suggestBox = h("div");

    function tokenField(key, label, extra = null) {
      const tokens = h("div.tokens");
      const input = h("input", {
        type: "email",
        inputmode: "email",
        autocomplete: "off",
        autocapitalize: "off",
        autocorrect: "off",
        spellcheck: "false",
        enterkeyhint: "next",
        "aria-label": label,
      });
      const field = h("div.field", { "data-k": key }, h("label", `${label}:`), tokens, extra);
      field.addEventListener("click", (e) => {
        if (e.target === field || e.target === field.firstChild || e.target === tokens) input.focus({ preventScroll: true });
      });
      // Keep the input mounted so committing an address retains the keyboard.
      const chips = new Map();
      tokens.append(input);
      const draw = () => {
        for (const [p, node] of chips) if (!c[key].includes(p)) { node.remove(); chips.delete(p); }
        let previous = null;
        for (const p of c[key]) {
          let node = chips.get(p);
          if (!node) {
            node = h(
              "button.token",
              {
                type: "button",
                class: EMAIL_RE.test(p.email) ? null : "invalid",
                title: p.email,
                onclick: (e) => {
                  showMenu(e.currentTarget, [
                    { label: p.email, disabled: true },
                    "-",
                    {
                      label: "Remove",
                      icon: "x",
                      destructive: true,
                      action: () => {
                        const i = c[key].indexOf(p);
                        if (i < 0) return;
                        c[key].splice(i, 1);
                        draw();
                        update();
                        input.focus({ preventScroll: true });
                      },
                    },
                  ]);
                },
              },
              avatar(p, "tok-av"),
              h("span.tok-n", p.name || p.email)
            );
            chips.set(p, node);
            if (previous) previous.after(node); else tokens.prepend(node);
          }
          previous = node;
        }
      };
      const commit = () => {
        const parts = input.value.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
        if (!parts.length) return false;
        for (const p of parts) c[key].push(parseAddress(p));
        input.value = "";
        draw();
        update();
        return true;
      };
      input.addEventListener("keydown", (e) => {
        if (suggestState.items.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          e.preventDefault();
          suggestState.hl = (suggestState.hl + (e.key === "ArrowDown" ? 1 : -1) + suggestState.items.length) % suggestState.items.length;
          drawSuggest();
          return;
        }
        if (e.key === "Enter" && suggestState.items.length && suggestState.hl >= 0) {
          e.preventDefault();
          pickSuggestion(suggestState.items[suggestState.hl]);
          return;
        }
        if (e.key === "Enter" || e.key === "," || e.key === ";" || (e.key === "Tab" && input.value.trim())) {
          if (commit()) e.preventDefault();
          else if (e.key === "Enter") {
            e.preventDefault();
            focusNext(key);
          }
          clearSuggest();
        } else if (e.key === "Backspace" && !input.value && c[key].length) {
          c[key].pop();
          draw();
          update();
        }
      });
      input.addEventListener("input", () => {
        if (/[,;]/.test(input.value)) {
          commit();
          clearSuggest();
        } else (suggest(key, input), update());
      });
      input.addEventListener("blur", () =>
        setTimeout(() => {
          if (document.activeElement === input || document.activeElement?.closest?.(".suggestions")) return;
          commit();
          if (suggestState.key === key) clearSuggest();
        }, 120)
      );
      input.addEventListener("paste", () => setTimeout(commit, 0));
      draw();
      fields[key] = { field, input, draw, commit };
      return field;
    }

    const suggestState = { key: null, items: [], hl: -1, input: null };
    const suggestFetch = debounce(async (q, key) => {
      try {
        const { contacts } = await api.contacts(q);
        if (suggestState.key !== key || suggestState.input?.value.trim() !== q) return;
        const taken = new Set([...c.to, ...c.cc, ...c.bcc].map((p) => p.email.toLowerCase()));
        suggestState.items = contacts.filter((x) => !taken.has(x.email.toLowerCase())).slice(0, 5);
        suggestState.hl = suggestState.items.length ? 0 : -1;
        drawSuggest();
      } catch {}
    }, 140);

    function suggest(key, input) {
      const q = input.value.trim();
      suggestState.key = key;
      suggestState.input = input;
      if (q.length < 1) return clearSuggest();
      suggestFetch(q, key);
    }

    function clearSuggest() {
      suggestState.items = [];
      suggestState.hl = -1;
      drawSuggest();
    }

    function pickSuggestion(p) {
      const key = suggestState.key;
      c[key].push({ name: p.name || "", email: p.email });
      suggestState.input.value = "";
      fields[key].draw();
      clearSuggest();
      update();
      fields[key].input.focus();
    }

    function drawSuggest() {
      const target = suggestState.key && fields[suggestState.key]?.field;
      if (!suggestState.items.length || !target) {
        setKids(suggestBox);
        return;
      }
      if (suggestBox.previousSibling !== target) target.after(suggestBox);
      setKids(suggestBox, 
        h(
          "div.suggestions",
          suggestState.items.map((p, i) =>
            h(
              "button.suggestion",
              {
                type: "button",
                class: i === suggestState.hl ? "hl" : null,
                onpointerdown: (e) => e.preventDefault(),
                onclick: () => pickSuggestion(p),
              },
              avatar(p),
              h("div", h("b", marked(p.name || p.email, suggestState.input?.value.trim())), p.name ? h("span", marked(p.email, suggestState.input?.value.trim())) : null)
            )
          )
        )
      );
    }

    // (the letters typed, picked out in what they matched)
    function marked(text, q) {
      const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
      return i < 0 ? text : [text.slice(0, i), h("mark", text.slice(i, i + q.length)), text.slice(i + q.length)];
    }

    function focusNext(key) {
      if (key === "to" && c.showCc) fields.cc.input.focus();
      else if (key === "cc") fields.bcc.input.focus();
      else subjectInput.focus();
    }

    const ccRow = h("div");
    function drawCcRow() {
      if (c.showCc && !ccRow.firstChild) ccRow.append(tokenField("cc", "Cc"), tokenField("bcc", "Bcc"));
      if (!c.showCc && ccRow.contains(document.activeElement)) subjectInput.focus({ preventScroll: true });
      ccRow.hidden = !c.showCc;
      ccBtn.classList.toggle("on", c.showCc);
      ccBtn.setAttribute("aria-pressed", String(c.showCc));
    }

    // Who it's from: a small chip at the end of the To line, the addresses behind it
    const fromBtn = h("button.from-chip", {
      type: "button",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      onclick: () =>
        M.menuState?.opener === fromBtn
          ? closeMenu()
          : showMenu(
          fromBtn,
          (S.me?.identities || [c.from]).map((addr) => ({
            label: addr,
            checked: addr === c.from,
            dot: addrColor(addr),
            action: () => {
              swapSig(addr);
              c.from = addr;
              drawFrom();
              update();
            },
          })),
          { title: "Send From", dropdown: true }
        ),
    });
    // (another address: its signature in place of the last one's, if that's still there as it was put in)
    function swapSig(addr) {
      const next = sigFor(addr);
      if (next === c.sig) return;
      const was = c.sig ? `\n\n${c.sig}` : "";
      if (was && !c.text.endsWith(was)) return;
      c.text = (was ? c.text.slice(0, -was.length) : c.text.trimEnd()) + (next ? `\n\n${next}` : "");
      c.sig = next;
      textArea.value = c.text;
      autoGrow();
    }

    function drawFrom() {
      fromBtn.setAttribute("aria-label", `From ${c.from}`);
      fromBtn.title = `From ${c.from}`;
      // (your photo; and the address, when it isn't the one new mail goes from: a reply from the one the mail came to,
      // say, as the reply at a conversation's foot says it)
      const other = S.me?.defaultFrom && c.from && c.from.toLowerCase() !== S.me.defaultFrom.toLowerCase();
      setKids(fromBtn, avatar({ name: S.me?.displayName, email: c.from, me: true }, "from-av"), other ? h("span", `${c.from.split("@")[0]}@`) : null, icon("chevronDown"));
    }
    drawFrom();

    const subjectInput = h("input.c-subject", {
      type: "text",
      value: c.subject,
      placeholder: "Subject",
      autocomplete: "off",
      enterkeyhint: "next",
      "aria-label": "Subject",
      oninput: () => {
        c.subject = subjectInput.value;
        update();
      },
      onkeydown: (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          textArea.focus();
        }
      },
    });

    const textArea = h("textarea.compose-text", {
      "aria-label": "Message",
      placeholder: "Message",
      oninput: () => {
        c.text = textArea.value;
        autoGrow();
        update();
      },
    });
    textArea.value = c.text;
    const autoGrow = () => {
      textArea.style.height = "auto";
      textArea.style.height = `${Math.max(c.attachments.length ? 120 : 220, textArea.scrollHeight)}px`;
    };

    const attsEl = h("div.compose-atts");
    function drawAtts() {
      setKids(
        attsEl,
        ...c.attachments.map((a, i) => {
          const img = /^image\//.test(a.type) && (a.preview || a.url);
          const ext = extOf(a.filename);
          return h(
            "div.c-att",
            { title: `${a.filename}, ${fmtSize(a.size)}`, class: img ? "pic" : null },
            img ? h("img", { src: a.preview || a.url, alt: "" }) : [h("b", ext && ext.length <= 4 ? ext : icon("doc")), h("span.c-att-n", a.filename)],
            h(
              "button.c-att-x",
              {
                type: "button",
                "aria-label": `Remove ${a.filename}`,
                onclick: () => {
                  if (a.preview) URL.revokeObjectURL(a.preview);
                  c.attachments.splice(i, 1);
                  drawAtts();
                  update();
                },
              },
              icon("x")
            )
          );
        })
      );
    }

    const MAX_ATTACH = 20 * 1024 * 1024;
    function addFiles(files) {
      for (const f of files) {
        const total = c.attachments.reduce((n, a) => n + (a.size || 0), 0);
        if (total + f.size > MAX_ATTACH) {
          toast("Attachments are limited to 20 MB", { error: true });
          break;
        }
        c.attachments.push({
          filename: f.name,
          type: f.type || "application/octet-stream",
          size: f.size,
          file: f,
          preview: /^image\//.test(f.type) ? URL.createObjectURL(f) : null,
        });
      }
      fileInput.value = "";
      drawAtts();
      update();
      autoGrow();
    }

    const quoteEl = c.quote
      ? h(
          "div.compose-quote",
          h("div.qh", c.quote.header.split("\n")[0]),
          (c.quote.text || htmlToText(c.quote.html)).slice(0, 2000)
        )
      : null;

    const hint = h("span.hint");
    const ccBtn = h(
      "button.c-tool.c-cc",
      {
        type: "button",
        onpointerdown: (e) => e.preventDefault(),
        onclick: () => {
          c.showCc = !c.showCc;
          drawCcRow();
          if (c.showCc) fields.cc.input.focus();
        },
      },
      "Cc/Bcc"
    );
    const body = h(
      "div.sheet-body",
      tokenField("to", "To", fromBtn),
      ccRow,
      subjectInput,
      textArea,
      attsEl,
      quoteEl
    );
    drawCcRow();
    drawAtts();

    // The toolbar on the keyboard: Cc/Bcc, Photos, Camera, Files; the size of what's attached; the keyboard away
    const photoInput = h("input", { type: "file", multiple: true, accept: "image/*,video/*", style: { display: "none" }, onchange: () => (addFiles(photoInput.files), (photoInput.value = "")) });
    const cameraInput = h("input", { type: "file", accept: "image/*", capture: "environment", style: { display: "none" }, onchange: () => (addFiles(cameraInput.files), (cameraInput.value = "")) });
    const tool = (name, label, onclick, cls = "") => h(`button.c-tool${cls}`, { type: "button", "aria-label": label, title: label, onpointerdown: (e) => e.preventDefault(), onclick }, icon(name));
    const accessory = h(
      "div.compose-accessory",
      h(
        "div.c-bar.glass",
        ccBtn,
        h("span.c-sep"),
        tool("photo", "Photos", () => photoInput.click()),
        S.layout === "phone" ? tool("camera", "Camera", () => cameraInput.click()) : null,
        tool("clip", "Files", () => fileInput.click()),
        hint,
        tool("chevronDown", "Hide Keyboard", () => document.activeElement?.blur?.(), ".c-kb")
      ),
      fileInput,
      photoInput,
      cameraInput
    );

    const sheet = h(
      "div.sheet",
      { role: "dialog", "aria-modal": "true", "aria-label": "New Message" },
      h("div.sheet-grabber"),
      head,
      body,
      accessory
    );

    // Drag files onto the sheet (iPad)
    sheet.addEventListener("dragover", (e) => e.preventDefault());
    sheet.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
    });

    function dirty() {
      return JSON.stringify([c.to, c.cc, c.bcc, c.subject, c.text, c.attachments.length]) !== snapshot;
    }

    function update() {
      titleEl.textContent = c.subject.trim() || (c.mode === "forward" ? "Forward" : c.mode.startsWith("reply") ? "Reply" : "New Message");
      const all = [...c.to, ...c.cc, ...c.bcc];
      // (an address typed but not yet made a name counts: Send takes it as it is, and says if it isn't one (doSend))
      const typed = ["to", "cc", "bcc"].some((k) => fields[k]?.input.value.trim());
      sendBtn.disabled = (!all.length && !typed) || all.some((p) => !EMAIL_RE.test(p.email));
      const size = c.attachments.reduce((n, a) => n + (a.size || 0), 0);
      hint.textContent = size ? fmtSize(size) : "";
    }

    async function doSend() {
      // (what's typed and not yet a name, made one, as Return would: shown as it's taken, red if it isn't an address)
      for (const k of ["to", "cc", "bcc"]) fields[k]?.commit();
      const all = [...c.to, ...c.cc, ...c.bcc];
      const bad = all.find((p) => !EMAIL_RE.test(p.email));
      if (!all.length || bad) {
        toast(bad ? `“${bad.email}” isn't a valid address` : "Add a recipient", { error: true });
        return;
      }
      if (!c.subject.trim()) {
        const ok = await confirmMenu(sendBtn, "This message has no subject.", "Send Anyway");
        if (!ok) return subjectInput.focus();
      }
      closeSheet("sending");
      queueSend(c, { sheet: true });
    }

    function closeSheet(mode) {
      const st = M.sheetState;
      if (!st || st !== composeState) return;
      M.sheetState = null;
      clearInterval(st.keepT);
      // (nothing written: no copy kept; sent, its copy's the outbox's once it has it (queueSend); thrown away or saved,
      // its own action forgets it once it's done)
      if (mode !== "sending" && !st.dirty()) forgetUnsent();
      document.activeElement?.blur?.();
      const appEl = document.getElementById("app");
      if (appEl) appEl.inert = false;
      if (sheetOpener?.isConnected) sheetOpener.focus({ preventScroll: true });
      sheetOpener = null;
      document.body.classList.remove("sheet-open");
      scrim.classList.remove("open");
      if (mode === "sending") sheet.classList.add("sending");
      sheet.classList.remove("open");
      let removed = false, timer;
      const finish = () => {
        if (removed) return;
        removed = true; clearTimeout(timer);
        sheet.removeEventListener("transitionend", ended);
        scrim.remove();
        sheet.remove();
        // (a message brought back while this one was open (bringBack): now it can be)
        if (!M.sheetState && heldSends.length) bringBack(heldSends.shift());
      };
      const ended = (e) => { if (e.target === sheet && e.propertyName === "transform") finish(); };
      sheet.addEventListener("transitionend", ended);
      timer = setTimeout(finish, 650);
      // The closing sheet owns only its own motion. A later composer can open
      // immediately without a descendant's transition removing either sheet.
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) queueMicrotask(finish);
      else if (typeof sheet.getAnimations === "function") {
        try { Promise.allSettled(sheet.getAnimations().map((a) => a.finished)).then(finish); } catch {}
      }
    }

    // Drag the sheet down to dismiss (iPhone)
    let drag = null;
    head.addEventListener("pointerdown", (e) => {
      if (S.layout !== "phone" || e.target.closest("button")) return;
      drag = { y0: e.clientY, dy: 0, t: performance.now(), id: e.pointerId };
      head.setPointerCapture(e.pointerId);
      sheet.classList.add("dragging");
    });
    head.addEventListener("pointermove", (e) => {
      if (!drag) return;
      drag.dy = Math.max(0, e.clientY - drag.y0);
      const resist = drag.dy > 0 && dirty() ? drag.dy * 0.5 : drag.dy;
      sheet.style.transform = `translateY(${resist}px)`;
    });
    const endDrag = () => {
      if (!drag) return;
      const { dy, t } = drag;
      drag = null;
      sheet.classList.remove("dragging");
      sheet.style.transform = "";
      const v = dy / Math.max(1, performance.now() - t);
      if (dy > 140 || v > 0.8) requestCloseCompose();
    };
    head.addEventListener("pointerup", endDrag);
    head.addEventListener("pointercancel", endDrag);

    const composeState = M.sheetState = {
      c,
      dirty,
      closeBtn,
      close: closeSheet,
      keepT: setInterval(() => { if (dirty()) keepUnsent(c); }, 2000),
      saveDraft: async () => {
        keepUnsent(c);
        closeSheet();
        try {
          await api.saveDraft({
            id: c.draftId,
            from: c.from,
            to: c.to,
            cc: c.cc,
            bcc: c.bcc,
            subject: c.subject,
            text: c.text,
            inReplyTo: c.inReplyTo,
            references: c.references,
            quote: c.quote,
            attachments: await draftAttachments(c.attachments),
          });
          forgetUnsent();
          toast("Draft Saved", { icon: "drafts" });
          refreshCounts();
          loadList({ quiet: true });
        } catch (err) {
          // (not saved: it's still on this device, and opens again from here)
          toast(`${err.message} It’s kept on this device.`, { error: true, actionLabel: "Open", duration: 8000, action: () => { forgetUnsent(); openCompose({ ...c }); } });
        }
      },
      deleteDraft: async () => {
        forgetUnsent();
        closeSheet();
        if (c.draftId) {
          try {
            await api.remove(c.draftId);
            refreshCounts();
            loadList({ quiet: true });
          } catch {}
        }
      },
    };

    update();
    // (the sheet holds the focus while it's up: what's behind it can't be reached, and it goes back where it was after)
    // (where the focus was as it opened: what had it before the keyboard was held up for this, app.js holdKeyboard)
    const opener = focusedBefore();
    const appEl = document.getElementById("app");
    if (appEl) appEl.inert = true;
    sheet.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const f = [...sheet.querySelectorAll("button:not(:disabled),input,textarea,[tabindex]:not([tabindex='-1'])")].filter((x) => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) (e.preventDefault(), f[f.length - 1].focus());
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) (e.preventDefault(), f[0].focus());
    });
    sheetOpener = opener;
    document.body.append(scrim, sheet);
    scrim.addEventListener("click", () => S.layout === "pad" && requestCloseCompose());
    sheet.offsetHeight;
    document.body.classList.add("sheet-open");
    scrim.classList.add("open");
    sheet.classList.add("open");
    requestAnimationFrame(autoGrow);

    // Focus synchronously so iOS raises the keyboard within the tap.
    if (c.mode === "new" && !c.to.length) fields.to.input.focus({ preventScroll: true });
    else if (c.mode !== "new" || c.draftId) {
      if (!c.to.length) fields.to.input.focus({ preventScroll: true });
      else {
        textArea.focus({ preventScroll: true });
        try {
          textArea.setSelectionRange(0, 0);
        } catch {}
      }
    }
  }

  function requestCloseCompose() {
    const st = M.sheetState;
    if (!st) return;
    if (!st.dirty()) {
      if (st.c.draftId) return st.close();
      return st.close();
    }
    showMenu(st.closeBtn, [
      { label: "Delete Draft", icon: "trash", destructive: true, action: st.deleteDraft },
      { label: "Save Draft", icon: "drafts", action: st.saveDraft },
    ]);
  }

  // (brought back while another message was open: each opens once that one's closed)
  const heldSends = [];
  const jobId = () => crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  // A job's this window's alone while it's sending it, or keeping it for the dot or to open (pendingSends,
  // S.failedSends, heldSends), by a lock in its name: so another Mail window opened meanwhile doesn't offer it as one
  // that didn't send (offerOutbox). → whether this window has it now (where the browser has no locks, always)
  const take = (job) =>
    new Promise((got) => {
      if (!navigator.locks?.request) return got(true);
      navigator.locks
        .request(`mail-send:${job.id}`, { ifAvailable: true }, (lock) => {
          got(!!lock);
          return lock && !job.gone ? new Promise((done) => (job.letGo = done)) : null;
        })
        .catch(() => got(true));
    });
  // (let go once it's sent, back in the sheet, or Mail's said it's to be changed)
  const letGo = (job) => {
    job.gone = true;
    job.letGo?.();
  };

  // sheet: from the compose sheet, whose own copy on this device the outbox's now takes over from
  function queueSend(c, { sheet = false } = {}) {
    const job = { id: jobId(), at: Date.now(), c, sheet, cancelled: false, timer: null };
    pendingSends.add(job);
    take(job);
    outbox.keep(job).then((ok) => {
      job.kept = !!ok;
      if (sheet) ok ? forgetUnsent() : keepUnsent(c);
    });
    // (longer to undo, for those who'd take longer to reach Undo: undoFor)
    const wait = undoFor();
    toast("Sending…", {
      icon: "sent",
      actionLabel: "Undo",
      duration: wait + 200,
      action: () => {
        if (job.started) return toast("Too late to undo: it’s on its way", { icon: "sent" });
        job.cancelled = true;
        clearTimeout(job.timer);
        pendingSends.delete(job);
        bringBack(job);
      },
    });
    job.timer = setTimeout(() => runSend(job), wait);
  }

  // A message back in the sheet to be changed (Undo, or Edit on one that didn't send): out of the outbox, the sheet's
  // own copy kept from the start. With another message open, it opens once that's closed, kept meanwhile (and offered
  // as Mail next opens, should Mail close first)
  function bringBack(job) {
    S.failedSends = S.failedSends.filter((j) => j !== job);
    renderListChrome();
    if (M.sheetState) {
      job.edit = true;
      if (!heldSends.includes(job)) heldSends.push(job);
      // (this window's again while it waits, if it had let it go: one Mail refused, or offered to open)
      if (job.gone) ((job.gone = false), take(job));
      outbox.keep(job);
      return toast("It opens again once you’ve closed this one", { icon: "drafts" });
    }
    outbox.drop(job.id);
    letGo(job);
    keepUnsent(job.c);
    openCompose(job.c);
  }

  async function buildPayload(c) {
    let text = c.text;
    let html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.45;color:#1c1c1e">${textToHtml(c.text)}</div>`;
    if (c.quote) {
      const qText = c.quote.text || htmlToText(c.quote.html);
      text += `\n\n${c.quote.header}\n\n${c.quote.forward ? qText : qText.split("\n").map((l) => `> ${l}`).join("\n")}`;
      // (pictures shown from Mail's own attachments are Mail's links, no use to anyone else: they're left out)
      const qHtml = c.quote.html ? bodyInner(c.quote.html).replace(/<img\b[^>]*\bsrc\s*=\s*["']?\/api\/attachments\/[^>]*>/gi, "") : textToHtml(c.quote.text);
      html += `<br><div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#6e6e73;font-size:14px">${textToHtml(c.quote.header)}</div><blockquote type="cite" style="margin:10px 0 0;padding:0 0 0 12px;border-left:2px solid #c7c7cc">${qHtml}</blockquote>`;
    }
    const attachments = [];
    for (const a of c.attachments) {
      const blob = await attachmentBlob(a);
      if (!blob) continue;
      attachments.push({ filename: a.filename, type: a.type, content: await fileToBase64(blob) });
    }
    return {
      from: c.from,
      to: c.to,
      cc: c.cc,
      bcc: c.bcc,
      subject: c.subject,
      text,
      html,
      inReplyTo: c.inReplyTo,
      references: c.references,
      attachments,
      draftId: c.draftId,
    };
  }

  async function runSend(job, { keepalive } = {}) {
    if (job.cancelled || job.started) return;
    job.started = true;
    // (on its way till Mail answers: the updater waits for it)
    pendingSends.add(job);
    try {
      const payload = await buildPayload(job.c);
      await api.send({ ...payload, key: job.id }, { keepalive });
      toast("Message Sent", { icon: "check" });
      outbox.drop(job.id);
      letGo(job);
      if (job.sheet && !job.kept) forgetUnsent();
      S.failedSends = S.failedSends.filter((j) => j !== job);
      refreshCounts();
      loadList({ quiet: true });
      // (a reply shows in its conversation, if that's the one open: not in another gone to meanwhile)
      if (job.c.inReplyTo && job.c.threadId && S.thread?.id === job.c.threadId) openThread(S.thread.id, { fromNav: true });
    } catch (err) {
      // (kept for the dot to offer again, as it is in the outbox for next time, unless Mail said it's the message itself
      // that's wrong: that's to be changed (Edit), and offered to open next time. Signed out, it's sent again once you're
      // back. Where the outbox couldn't keep it, the one copy this device keeps, as before)
      if (!job.kept) keepUnsent(job.c);
      const refused = err.status >= 400 && err.status < 500 && err.status !== 401;
      if (refused) {
        job.edit = true;
        if (job.kept) outbox.keep(job);
        letGo(job);
      } else {
        S.failedSends.push(job);
        renderListChrome();
      }
      // (no answer, or none that says whether it went (the connection lost, Mail failing, or still sending it from the
      // time before): asked again as itself, from Try Again. Not Edit, which would make it another message, sent twice if
      // the first did go. Edit only where Mail refused it, or it never left here: a file that couldn't be read, say)
      const again = !refused && err.status !== undefined;
      toast(err.message || "Couldn't send", {
        error: true,
        actionLabel: again ? "Try Again" : "Edit",
        duration: 8000,
        action: again ? retryFailed : () => bringBack(job),
      });
    } finally {
      pendingSends.delete(job);
    }
  }

  return { openCompose, openDraft, offerOutbox, requestCloseCompose, queueSend, runSend };
};
