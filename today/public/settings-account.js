// Account's views share the shell document. Shadow styles keep the standalone
// Account stylesheet local while native modal dialogs enter the shell's top layer.
export class SettingsAccount extends HTMLElement {
  disconnectedCallback() {
    this.session?.abort();
  }

  async mount({owner, part, action, sheets, onSecurity}) {
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
    loading.textContent = action ? "Loading security settings…" : "Loading account…";
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
      if (action) page.hidden = true;
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
      const ready = await startAccount({root, element:this, owner, part, action, sheets, onSecurity, signal:session.signal});
      if (session.signal.aborted) return false;
      loading.remove();
      return !action || ready === true;
    } catch (error) {
      if (session.signal.aborted) return;
      session.abort();
      if (action) throw error;
      loading.textContent = "Couldn’t load your account.";
      const retry = document.createElement("button");
      retry.type = "button"; retry.textContent = "Try again";
      retry.onclick = () => this.mount({owner,part,sheets,onSecurity});
      root.replaceChildren(loading,retry);
    } finally {
      if (session === this.session) this.removeAttribute("aria-busy");
    }
  }
}
customElements.define("inflite-settings-account", SettingsAccount);

// Confirm through the same Account sheet as Settings. A mounted/closed dialog
// is never evidence of authentication: only the fresh server check can succeed.
const confirmations = new WeakMap();
export async function confirmIdentity(F, { parent, signal, expectedOwner, current = () => true } = {}) {
  const owner = F.session?.view?.user?.id;
  const live = () => !!owner && !F.signal?.aborted && !signal?.aborted && F.session?.view?.user?.id === owner && parent?.isConnected && current();
  if (!live()) return Promise.resolve(false);
  const marker = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('atlas-owner:' + owner))), b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  if (!live() || expectedOwner && expectedOwner !== marker) return false;
  const pending = confirmations.get(F);
  if (pending) return pending.then(value => !!value && live());
  const operation = (async () => {
    const check = async () => {
      if (!live()) return {confirmed:false};
      const response = await fetch('/atlas/api/identity', { cache:'no-store', credentials:'same-origin',
        headers:{'X-Atlas-Owner':marker}, signal:AbortSignal.any([F.signal, ...(signal ? [signal] : []), AbortSignal.timeout(10000)]) });
      const result = await response.json().catch(() => ({}));
      if (!live()) return {confirmed:false};
      if (response.status >= 500) throw new Error('Your account is temporarily unavailable. Your draft is still here. Try again.');
      return { confirmed:response.ok && result.confirmed === true && result.owner === marker && response.headers.get('X-Atlas-Owner') === marker,
        required:response.status === 403 && result.code === 'identity_confirmation_required' };
    };
    const initial = await check();
    if (initial.confirmed || !initial.required || !live()) return initial.confirmed;
    return new Promise(resolve => {
      const host = document.createElement('inflite-settings-account');
      parent.append(host);
      let done = false, sheet = null, offRoute;
      const finish = value => {
        if (done) return; done = true;
        F.signal?.removeEventListener('abort', stop); signal?.removeEventListener('abort', stop); offRoute?.();
        sheet?.now?.(); host.remove(); resolve(!!value && live());
      };
      const stop = () => finish(false);
      F.signal?.addEventListener('abort', stop, {once:true}); signal?.addEventListener('abort', stop, {once:true});
      offRoute = F.on?.('route', () => { if (!live()) stop(); });
      if (!live()) return stop();
      host.mount({owner:String(owner),action:'confirm',sheets:{
        openEl(dialog, {onClose} = {}) {
          if (!live() || done) return {closed:true,close(){},now(){}};
          sheet = F.sheet.openEl(dialog, {onClose() {
            try { onClose?.(); } finally {
              if (done) return;
              check().then(result => finish(result.confirmed), error => {
                if (live() && error?.name !== 'AbortError') F.toast?.(error.message);
                finish(false);
              });
            }
          }});
          return sheet;
        }
      }}).then(mounted => { if (!mounted && !done) stop(); }, error => {
        if (live() && error?.name !== 'AbortError') F.toast?.('Couldn’t open account confirmation. Try again.');
        finish(false);
      });
    });
  })().catch(error => {
    if (live() && error?.name !== 'AbortError') F.toast?.(error.message || 'Couldn’t confirm your account. Try again.');
    return false;
  });
  confirmations.set(F, operation);
  operation.finally(() => { if (confirmations.get(F) === operation) confirmations.delete(F); });
  return operation;
}
