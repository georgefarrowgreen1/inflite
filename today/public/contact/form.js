export function connectContactForm(form, lifetime) {
  const statusLine = form.querySelector('[role="status"]');
  const submit = form.querySelector('button[type="submit"]');
  const report = (state, message) => {
    statusLine.dataset.state = state;
    statusLine.textContent = message;
  };
  let attempt;
  form.hidden = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (lifetime?.aborted || submit.disabled || !form.reportValidity()) return;
    const fields = Object.fromEntries(new FormData(form));
    const body = JSON.stringify(fields);
    if (attempt?.body !== body) attempt = { body, key: crypto.randomUUID() };
    const doc = form.ownerDocument;
    const restoreFocus = doc.activeElement === submit;
    submit.disabled = true;
    report('sending', 'Sending your message…');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.key },
        body,
        signal: lifetime ? AbortSignal.any([controller.signal, lifetime]) : controller.signal
      });
      if (res.ok && (await res.json()).ok === true) {
        attempt = undefined;
        const unchanged = Object.entries(fields).every(([name, value]) => form.elements.namedItem(name).value === value);
        if (unchanged) form.reset();
        report('success', 'Message received. Thank you for getting in touch.');
      } else if (res.status === 429) {
        report('error', 'Too many messages in a short time. Please try again later.');
      } else if (res.status === 400 || res.status === 413) {
        report('error', 'Check your name, email and message, then try again.');
      } else {
        throw new Error('Unconfirmed delivery');
      }
    } catch {
      if (!lifetime?.aborted) report('error', 'Delivery couldn’t be confirmed. Your message is still here. You can also email hello@inflite.ai.');
    } finally {
      clearTimeout(timeout);
      submit.disabled = false;
      if (restoreFocus && !lifetime?.aborted && submit.isConnected && doc.activeElement === doc.body) {
        submit.focus({ preventScroll: true });
      }
    }
  }, { signal: lifetime });
}

const contact = document.querySelector('#contact-form');
if (contact) connectContactForm(contact);
