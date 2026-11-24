import { field } from "../../roof/ui.js";

// Atlas keeps its form nodes and drafts while InFlite owns sheet focus,
// dismissal, routing and the account lifetime.
export function nativeSheets(fw) {
  const stack = [];
  const top = () => stack.filter(handle => !handle.closed).at(-1) || null;
  return {
    openEl(source, options = {}) {
      const existing = stack.find(handle => handle.source === source && !handle.closed);
      if (existing) return existing;
      const content = source.querySelector(".ifs-body"), id = source.id, sourceHead = source.querySelector(".ifs-head");
      const title = source.querySelector(".ifs-head h2")?.textContent || "Atlas";
      const placeholder = document.createComment("Atlas sheet content");
      content.before(placeholder);
      // Scope Atlas controls to the content, never the shell's dialog host.
      // The host's surface, glass, viewport fit and backdrop remain native.
      content.classList.remove("ifs-body");
      content.classList.add("atlas-app", "atlas-native-content");
      source.removeAttribute("id");
      let handle, nativeHead, closeButtons = [];
      const close = () => handle?.close();
      const restore = () => {
        for (const button of closeButtons) button.removeEventListener("click", close);
        if (nativeHead) sourceHead.append(...nativeHead.childNodes);
        content.classList.remove("atlas-app", "atlas-native-content");
        content.classList.add("ifs-body");
        if (placeholder.parentNode) placeholder.replaceWith(content);
        source.id = id;
        const index = stack.indexOf(handle); if (index >= 0) stack.splice(index, 1);
        options.onClose?.();
      };
      try {
        handle = (options.framework || fw).sheet.open({
          sheet: "atlas-" + id.replace(/-dialog$/, ""), title, body: content,
          onClose: restore, focus: options.focus,
        });
        if (handle.closed) { restore(); return handle; }
        handle.source = source;
        handle.el.id = id;
        handle.el.classList.add("atlas-native-sheet", "atlas-dialog");
        for (const name of ["wide-dialog", "environments-dialog"]) if (source.classList.contains(name)) handle.el.classList.add(name);
        // Keep live form titles and their associated IDs as the client updates
        // them (for example "Review changes"). The frame still owns dismissal.
        nativeHead = handle.el.querySelector(".ifs-head");
        nativeHead.replaceChildren(...sourceHead.childNodes);
        closeButtons = [...nativeHead.querySelectorAll("[data-close]")];
        for (const button of closeButtons) button.addEventListener("click", close);
        const heading = nativeHead.querySelector("h2");
        if (heading?.id) handle.el.setAttribute("aria-labelledby", heading.id);
        (options.focus || heading)?.focus({ preventScroll: true });
        stack.push(handle);
        return handle;
      } catch (error) { restore(); throw error; }
    },
    top,
    elements: () => stack.filter(handle => !handle.closed).map(handle => handle.el),
    closeAll() { for (const handle of [...stack].reverse()) handle.now(); },
  };
}

export async function confirmAction(fw, message) {
  if (!fw) return window.confirm(message);
  return new Promise(resolve => {
    let result = false;
    const body = document.createElement("p"); body.className = "ifl-sub"; body.textContent = message;
    const handle = fw.sheet.open({ sheet: "atlas-confirm", title: "Confirm action", body,
      acts: [{ label: "Cancel", run: () => handle.close() }, { label: "Continue", primary: true, run: () => { result = true; handle.close(); } }],
      onClose: () => resolve(result),
    });
    if (handle.closed) resolve(false);
  });
}

export async function promptValue(fw, title, initial = "") {
  if (!fw) return window.prompt(title, initial);
  return new Promise(resolve => {
    let result = null;
    const body = field({ label: title, value: initial });
    body.input.maxLength = 160;
    const handle = fw.sheet.open({ sheet: "atlas-name", title, body, focus: body.input,
      acts: [{ label: "Cancel", run: () => handle.close() }, { label: "Save", primary: true, run: () => { result = body.input.value; handle.close(); } }],
      onClose: () => resolve(result),
    });
    if (handle.closed) resolve(null);
  });
}
