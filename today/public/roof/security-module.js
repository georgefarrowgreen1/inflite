import { createSystemClient } from './system-client.js';
import { loadStyles } from './modules.js';

const MODES = { allow: 'Allowed', ask: 'Ask each time', block: 'Blocked' };
const SECTIONS = [['overview', 'Overview'], ['sign-in', 'Sign-in'], ['access', 'App access'], ['activity', 'Activity']];
const EVENTS = {
  'permission-changed': 'App permission changed', 'permission-once': 'Temporary app access approved',
  'file-transfer': 'File access approved for another app', 'content-search': 'Document contents searched',
  'calendar-access': 'Calendar connection used', 'sessions-revoked': 'Sessions signed out',
  'signout-others': 'Other sessions signed out', 'signout-device': 'A device signed out',
  signin: 'Signed in', export: 'Account data exported', password: 'Password changed',
  'email-confirmed': 'Email verified', 'passkey-add': 'Passkey added', 'passkey-remove': 'Passkey removed',
  'password-checked': 'Password breach check completed', signup: 'Account created', reset: 'Password reset'
};
const time = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const date = value => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const short = value => new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export async function createSecurityModule(F, options = {}) {
  const client = createSystemClient(F, { prefix: '/api/security/' });
  const { live, owner } = client;
  const { ui } = F;
  const { el } = ui;
  await loadStyles('/roof/security-module.css');
  if (!live()) return null;
  let opened, detailHost;

  const run = action => () => Promise.resolve().then(action).catch(error => {
    if (live() && error.name !== 'AbortError') F.toast(error.message);
  });
  const btn = (label, action, extra = {}) => ui.btn(label, { ...extra, run: run(action) });
  const note = text => el('p', { class: 'sm-muted', text });
  const card = (title, ...children) => el('section', { class: 'sm-card' }, el('h3', { text: title }), ...children);
  const setting = (title, symbol, action, sub) => ui.row({
    lead: { icon: symbol }, title, sub, trail: 'chevron',
    ...(typeof action === 'string' ? { href: action } : { run: run(action) })
  });
  const row = (title, copy, action, symbol = 'lock') => el('div', { class: 'sm-row' },
    el('span', { class: 'sm-icon', 'aria-hidden': 'true' }, ui.icon(symbol)),
    el('div', { class: 'sm-copy' }, el('strong', { text: title }), el('small', { text: copy })), action);

  async function accountAction(action, parent, trigger, afterClose) {
    if (!live() || !parent.isConnected || detailHost?.isConnected) return;
    trigger?.setAttribute('aria-busy', 'true');
    try {
      await import('/settings-account.js');
      if (!live() || !parent.isConnected || detailHost?.isConnected) return;
      const host = detailHost = el('inflite-settings-account', { class: 'sm-account-action' });
      parent.append(host);
      const remove = () => {
        if (detailHost === host) detailHost = null;
        host.remove();
      };
      try {
        const mounted = await host.mount({ owner: String(owner), action, sheets: {
          openEl(dialog, { onClose }) {
            return F.sheet.openEl(dialog, { onClose() {
              try { onClose?.(); } finally {
                remove();
                if (live() && parent.isConnected) {
                  // A child sheet returns to the control that opened it.
                  trigger?.focus({ preventScroll: true });
                  afterClose?.();
                }
              }
            } });
          }
        } });
        if (!mounted) {
          remove();
          if (live() && parent.isConnected) throw Error('Couldn’t open this setting. Try again.');
        }
      } catch (error) {
        remove();
        if (live() && parent.isConnected) throw error;
      }
    } finally {
      trigger?.removeAttribute('aria-busy');
    }
  }

  function reauth(body, say) {
    say.textContent = 'Confirm it’s you, then retry this action.';
    if (body.querySelector('[data-sm-reauth]')) return;
    const verify = btn('Confirm identity', () => accountAction('confirm', body, verify));
    verify.dataset.smReauth = '';
    body.append(verify);
  }

  function confirm({ title, copy, action, target, commit }) {
    if (!live()) return;
    let busy = false;
    const say = el('p', { class: 'sm-status', role: 'status' });
    const body = el('div', { class: 'security-module sm-detail' }, note(copy), say);
    const save = btn('Confirm', async () => {
      if (busy || !live() || h.closed) return;
      busy = true;
      save.disabled = true;
      h.setBusy(true);
      try {
        const proof = await client.request('confirmation', { method: 'POST', body: { action, target }, current: () => !h.closed });
        if (!live() || h.closed) return;
        await commit(proof.token, () => !h.closed);
        if (live() && !h.closed) h.now();
      } catch (error) {
        if (!live() || h.closed) return;
        h.setBusy(false);
        if (error.field === 'reauth') reauth(body, say);
        else say.textContent = error.message;
      } finally {
        busy = false;
        if (live()) save.disabled = false;
      }
    }, { primary: true });
    body.append(el('div', { class: 'sm-buttons' }, btn('Cancel', () => h.now()), save));
    const h = F.sheet.open({ sheet: 'security-confirmation', title, body });
    return h;
  }

  function permission(p, refresh) {
    let busy = false;
    const say = el('p', { class: 'sm-status', role: 'status' });
    const body = el('div', { class: 'security-module sm-detail' }, el('h2', { text: p.title }), note(p.detail), say);
    async function save(mode, ticket, current = () => !h.closed) {
      if (!live() || !current()) return;
      await client.request('permission', {
        method: 'PUT', body: { key: p.key, mode, version: p.version, ...(ticket ? { ticket } : {}) }, current
      });
      if (!live() || !current()) return;
      await refresh();
      if (!live() || !current()) return;
      h.now();
      requestAnimationFrame(() => {
        if (live() && opened && !opened.closed && F.sheet.top()?.el === opened.el) {
          [...opened.el.querySelectorAll('[data-permission]')].find(node => node.dataset.permission === p.key)?.querySelector('button')?.focus({ preventScroll: true });
        }
      });
      F.toast('Permission updated');
    }
    for (const mode of ['ask', 'allow', 'block']) {
      const currentMode = p.mode === mode;
      const choice = btn(MODES[mode], async () => {
        if (busy || !live() || h.closed || currentMode) return;
        if (mode === 'allow') return confirm({
          title: 'Allow ' + p.title.toLowerCase() + '?',
          copy: 'This connection can run when you use it without asking each time. You can revoke access here.',
          action: 'permissions-allow', target: p.key + ':' + p.version,
          commit: (token, current) => save(mode, token, () => current() && !h.closed)
        });
        busy = true;
        try { await save(mode); }
        catch (error) { if (live() && !h.closed) say.textContent = error.message; }
        finally { busy = false; }
      }, { label: MODES[mode] + (currentMode ? ' · current' : '') });
      choice.classList.add('sm-choice');
      choice.setAttribute('aria-pressed', String(currentMode));
      const details = {
        ask: 'Review each use. Approvals last two minutes.',
        allow: 'Run this connection without another prompt.',
        block: 'Stop this connection until you change it.'
      };
      choice.replaceChildren(
        el('span', { class: 'sm-icon', 'aria-hidden': 'true' }, ui.icon(currentMode ? 'check' : mode === 'block' ? 'lock' : 'info')),
        el('span', { class: 'sm-copy' }, el('strong', { text: MODES[mode] }), el('small', { text: details[mode] }))
      );
      body.append(choice);
    }
    const h = F.sheet.open({ sheet: 'security-edit-permission', title: 'App access', body });
    return h;
  }

  function open({ app = null, view: initial = 'overview' } = {}) {
    if (!live()) return;
    if (opened && !opened.closed) return opened;
    let view = SECTIONS.some(([key]) => key === initial) ? initial : 'overview';
    let summary, motion, epoch = 0;
    const reads = new AbortController();
    const positions = new Map();
    const body = el('div', { class: 'security-module sm-main' });
    const content = el('div', { class: 'sm-content', role: 'region' });
    const say = el('p', { class: 'sm-status sm-live', role: 'status' });
    const stamp = el('time', { class: 'sm-updated' });
    const refreshButton = btn('Refresh', refresh, { label: 'Refresh security information' });
    const tabs = ui.seg(SECTIONS, view, changeView, { label: 'Security section' });
    const current = () => live() && !h.closed;

    function changeView(next) {
      if (next === view) return;
      positions.set(view, content.scrollTop);
      view = next;
      paint(true, positions.get(view) || 0);
    }

    async function refresh() {
      if (!current()) return;
      const sequence = ++epoch;
      const latest = () => current() && sequence === epoch;
      refreshButton.disabled = true;
      content.setAttribute('aria-busy', 'true');
      say.textContent = 'Checking your account…';
      if (!summary) content.replaceChildren(ui.skeleton('rows', 4));
      try {
        const result = await client.request('summary', { signal: reads.signal, current: latest });
        if (!latest()) return;
        summary = result;
        stamp.textContent = 'Checked ' + short(summary.checkedAt);
        stamp.dateTime = new Date(summary.checkedAt).toISOString();
        stamp.title = time(summary.checkedAt);
        say.textContent = '';
        paint();
      } catch (error) {
        if (!latest()) return;
        summary = null;
        stamp.textContent = '';
        content.replaceChildren(ui.error({ title: 'Security couldn’t refresh', body: error.message, acts: [{ label: 'Retry', run: refresh, primary: true }] }));
        say.textContent = 'No current security status is available.';
      } finally {
        if (latest()) {
          refreshButton.disabled = false;
          content.removeAttribute('aria-busy');
        }
      }
    }

    function credentialRow(action, title, symbol, description) {
      const control = setting(title, symbol, () => accountAction(action, body, control, refresh), description);
      control.dataset.smAction = action;
      return control;
    }

    function sessionList() {
      const section = card('Signed-in sessions');
      if (summary.sessionCount > summary.sessions.length) section.append(note('Showing the ' + summary.sessions.length + ' most recent of ' + summary.sessionCount + ' sessions.'));
      function signOut(session) {
        return confirm({
          title: session ? 'Sign out this session?' : 'Sign out all other sessions?',
          copy: session ? session.label + ' will need to sign in again. Downloaded copies remain on that device.'
            : 'This session stays signed in. Other devices will need to sign in again. Downloaded copies remain on those devices. A pending email change will be cancelled.',
          action: 'sessions-revoke', target: session?.id || 'others',
          async commit(ticket, stillOpen) {
            await client.request('sessions/revoke', { method: 'POST', body: { target: session?.id || 'others', ticket }, current: stillOpen });
            if (current() && stillOpen()) await refresh();
          }
        });
      }
      for (const session of summary.sessions) {
        section.append(row(session.label,
          [session.current ? null : session.place, session.stale ? 'Inactive for 90 days' : 'Last active ' + short(session.seenAt)].filter(Boolean).join(' · '),
          session.current ? el('span', { class: 'sm-state', text: 'Current' }) : btn('Sign out', () => signOut(session), { small: true, destructive: true }),
          'device'));
      }
      if (summary.sessionCount > 1 || summary.sessions.some(session => !session.current)) {
        section.append(btn('Sign out other sessions', () => signOut(), { destructive: true }));
      }
      return section;
    }

    function overview() {
      const remaining = summary.checks.filter(check => check.state !== 'ready').length;
      const appName = app && ({ chats: 'Chats', files: 'Files' }[app] || app[0].toUpperCase() + app.slice(1));
      const title = remaining ? (remaining === 1 ? '1 check needs attention' : remaining + ' checks need attention') : 'Account protected';
      const description = remaining ? 'Review the checks below to secure your account.' : 'Your account checks are up to date.';
      const hero = el('section', { class: 'sm-hero', data: { state: remaining ? 'review' : 'ready' } },
        el('div', { class: 'sm-heading' }, el('span', { class: 'sm-emblem', 'aria-hidden': 'true' }, ui.icon(remaining ? 'lock' : 'check')),
          el('div', {}, el('h2', { text: appName ? 'Security for ' + appName : title }), note(appName ? title : description))),
        el('div', { class: 'sm-meta' }, stamp, refreshButton)
      );

      const password = summary.account.passwordCheck;
      const count = summary.account.passkeys;
      const sessions = sessionList();
      const checkDetails = {
        email: ['Recovery email', summary.account.emailVerified ? 'Verified' : 'Verify your email', 'mail', 'email'],
        passkeys: ['Passkeys', count ? count + (count === 1 ? ' passkey saved' : ' passkeys saved') : 'Add a passkey', 'key', 'passkeys'],
        stale: ['Sessions', 'Review devices you no longer use', 'device', null],
        password: ['Password breach check', password ? (password.foundInBreach ? 'Exposure reported' : 'No exposure reported') + ' · ' + date(password.checkedAt) : 'No breach check recorded', 'lock', password?.foundInBreach ? 'password' : 'password-check']
      };
      const checks = summary.checks.map(check => {
        const ready = check.state === 'ready';
        const [label, copy, symbol, action] = checkDetails[check.id] || [check.title, 'Review your account', 'info', null];
        let trigger;
        const review = ready ? el('span', { class: 'sm-check-state', 'aria-label': 'Up to date' }, ui.icon('check'))
          : (trigger = btn('Review', () => {
            if (action) return accountAction(action, body, trigger, refresh);
            if (check.id === 'stale') {
              sessions.scrollIntoView({ block: 'start' });
              sessions.querySelector('h3').focus({ preventScroll: true });
            }
          }, { label: 'Review ' + label.toLowerCase(), small: true }));
        if (check.id === 'stale' && ready) return row(label, 'None inactive for 90 days', review, symbol);
        const item = row(label, copy, review, symbol);
        item.dataset.state = check.state;
        if (trigger && action) trigger.dataset.smAction = action;
        return item;
      });
      sessions.querySelector('h3').tabIndex = -1;
      content.append(hero, card('Account protection', ...checks), sessions);
      content.append(el('details', { class: 'sm-card sm-disclosure' },
        el('summary', {}, el('span', { text: 'How your information is protected' }), ui.icon('chev')),
        el('div', { class: 'sm-boundaries' }, ...Object.values(summary.boundaries).map(note))));
    }

    function signIn() {
      content.append(
        el('h2', { class: 'sm-section-title', text: 'Sign-in & recovery' }),
        card('Credentials',
          credentialRow('passkeys', 'Passkeys', 'key', 'Manage sign-in with your device'),
          credentialRow('password', 'Change password', 'lock'),
          credentialRow('email', 'Recovery email', 'mail', summary.account.emailVerified ? 'Verified' : 'Verification needed'),
          credentialRow('password-check', 'Check for password exposure', 'shield')),
        card('Devices',
          credentialRow('computer', 'Sign in on a computer', 'device', 'Scan its InFlite sign-in code'),
          options.remembered && setting('Remembered devices', 'device', options.remembered)),
        card('Account data',
          setting('Export account data', 'download', '/#settings=account-data'))
      );
    }

    function access() {
      content.append(el('h2', { class: 'sm-section-title', text: 'App access' }));
      const applicable = summary.permissions.filter(p => !app || (app === 'files' && p.key.startsWith('files.')) ||
        (app === 'calendar' && p.key === 'calendar.subscription') || p.key === 'files.transfer.' + app);
      if (!applicable.length) content.append(ui.empty({ title: 'No extra permissions', body: 'This app uses your existing account and record ownership checks.' }));
      for (const p of applicable) {
        const section = card(p.title, note(p.detail), row(MODES[p.mode], p.inherited ? 'Default setting' : 'Changed ' + date(p.updatedAt),
          btn('Change', () => permission(p, refresh), { small: true }), 'link'));
        section.dataset.mode = p.mode;
        section.dataset.permission = p.key;
        content.append(section);
      }
      if (app) content.append(btn('View all app access', () => { app = null; paint(); }));
      content.append(card('Connections',
        options.calendars && setting('Connected calendars', 'calendar', options.calendars),
        setting('Fitness settings', 'link', '/fitness/#settings')));
      content.append(note('Revoking access applies to future use. Copies already shared stay with the recipient.'));
    }

    function activity() {
      content.append(el('h2', { class: 'sm-section-title', text: 'Recent activity' }));
      if (!summary.events.length) content.append(ui.empty({ title: 'No recent activity', body: 'Sign-ins and security changes will appear here.' }));
      let group, day;
      for (const event of summary.events) {
        const key = date(event.at);
        if (key !== day) {
          day = key;
          group = card(key === date(Date.now()) ? 'Today' : key);
          group.classList.add('sm-events');
          content.append(group);
        }
        group.append(row(EVENTS[event.kind] || event.kind.replaceAll('-', ' '),
          [new Date(event.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }), event.app, event.device].filter(Boolean).join(' · '),
          null, 'clock'));
      }
      content.append(note('Activity is kept for 30 days. Entries record the type of action taken.'));
    }

    function paint(animate = false, top = content.scrollTop) {
      if (!current() || !summary) return;
      const focused = document.activeElement?.dataset.smAction;
      motion?.cancel();
      content.replaceChildren();
      content.setAttribute('aria-label', { overview: 'Security overview', 'sign-in': 'Sign-in and recovery', access: 'App permissions', activity: 'Security activity' }[view]);
      ({ overview, 'sign-in': signIn, access, activity }[view])();
      content.scrollTop = top;
      if (focused) content.querySelector('[data-sm-action="' + CSS.escape(focused) + '"]')?.focus({ preventScroll: true });
      if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        motion = content.animate([{ opacity: .65, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }

    body.append(el('div', { class: 'sm-toolbar' }, tabs, say), content);
    const h = opened = F.sheet.open({ sheet: 'security-module', title: 'Security', body, onClose() {
      reads.abort();
      motion?.cancel();
      summary = null;
      opened = null;
    } });
    refresh();
    return h;
  }

  return { open, transfer: async (destination, item, lease = {}) =>
    client.request('file-transfer', { method: 'POST', body: { destination, id: item.id, version: item.version }, ...lease }) };
}
