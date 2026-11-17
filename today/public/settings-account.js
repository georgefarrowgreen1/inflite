// Account's views share the shell document. Shadow styles keep the standalone
// Account stylesheet local while native modal dialogs enter the shell's top layer.
export class SettingsAccount extends HTMLElement {
  disconnectedCallback() {
    this.session?.abort();
  }

  async mount({owner, part, sheets}) {
    this.session?.abort();
    const session = this.session = new AbortController();
    const root = this.shadowRoot || this.attachShadow({mode:"open"});
    const followTheme = () => {
      const theme = document.documentElement.dataset.theme;
      if (theme) this.dataset.theme = theme;
      else delete this.dataset.theme;
    };
    followTheme();
    const themeObserver = new MutationObserver(followTheme);
    themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    session.signal.addEventListener("abort", () => themeObserver.disconnect(), {once:true});
    this.setAttribute("aria-busy","true");
    const loading = document.createElement("p");
    loading.setAttribute("role","status");
    loading.textContent = "Loading account…";
    root.replaceChildren(loading);
    try {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "/account/styles.css";
      const styled = new Promise((resolve,reject) => {
        css.onload = resolve;
        css.onerror = () => reject(new Error("Account styles unavailable"));
      });
      root.prepend(css);
      const [{startAccount}] = await Promise.all([import("/account/app.js"), styled]);
      if (session.signal.aborted) return;
      const page = document.createElement("div");
      page.id = "page";
      const main = document.createElement("div");
      main.id = "main";
      page.append(main);
      const dialog = document.createElement("dialog");
      dialog.className = "sheet";
      dialog.id = "sheet";
      dialog.setAttribute("aria-labelledby","sheet-title");
      const toast = document.createElement("div");
      toast.id = "toast";
      toast.className = "toast";
      toast.setAttribute("role","status");
      root.append(page, dialog, toast);
      await startAccount({root, element:this, owner, part, sheets, signal:session.signal});
      if (!session.signal.aborted) loading.remove();
    } catch {
      if (session.signal.aborted) return;
      session.abort();
      loading.textContent = "Couldn’t load your account.";
      const retry = document.createElement("button");
      retry.type = "button"; retry.textContent = "Try again";
      retry.onclick = () => this.mount({owner,part,sheets});
      root.replaceChildren(loading,retry);
    } finally {
      if (session === this.session) this.removeAttribute("aria-busy");
    }
  }
}
customElements.define("inflite-settings-account", SettingsAccount);
