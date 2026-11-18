const form = document.querySelector('#contact-form');
const statusLine = document.querySelector('#contact-status');
const submit = form.querySelector('button[type="submit"]');
form.hidden = false;
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled || !form.reportValidity()) return;
  const fields = Object.fromEntries(new FormData(form));
  submit.disabled = true;
  statusLine.textContent = 'Sending your message…';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
      signal: controller.signal
    });
    if (res.ok && (await res.json()).ok === true) {
      const unchanged = Object.entries(fields).every(([name, value]) => form.elements.namedItem(name).value === value);
      if (unchanged) form.reset();
      statusLine.textContent = 'Message received. Thank you for getting in touch.';
    } else if (res.status === 429) {
      statusLine.textContent = 'Too many messages in a short time. Please try again later.';
    } else if (res.status === 400) {
      statusLine.textContent = 'Check your name, email and message, then try again.';
    } else {
      throw new Error('Unconfirmed delivery');
    }
  } catch {
    statusLine.textContent = 'Delivery couldn’t be confirmed. Your message is still here. You can also email hello@inflite.ai.';
  } finally {
    clearTimeout(timeout);
    submit.disabled = false;
  }
});
