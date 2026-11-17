// Open-tab presence belongs to this document. Local reopen and remembered
// devices have longer lifetimes and are managed separately.
import {deviceId, deviceLabel} from './device-id.js';
import {resumeTarget} from './restore.js';
import {REGISTRY} from './router.js';

export function connectContinuity(F, {owner, root}) {
  const id = deviceId(owner);
  if (!id) return;
  const label = deviceLabel(), path = '/api/files/open-tabs';
  const live = () => !F.signal.aborted && F.session.view?.user?.id === owner;
  const paused = () => {
    try { return localStorage.getItem('ifl:device-paused:' + owner) === '1'; }
    catch { return true; }
  };
  const newTab = () => crypto.randomUUID().replace(/-/g, '');
  const panel = F.ui.el('section', {class:'continuation-card', hidden:true, 'aria-label':'Continue on this device'});
  root.prepend(panel);
  let tab = newTab(), sequence = 0, advertised = false, suspended = false;
  let tabs = [], signature = '', readGeneration = 0, expiryTimer, routeTimer;
  const headers = {'X-Inflite-Files-Owner':owner};

  function publish(target, keepalive = false) {
    if (!target && !advertised) return;
    advertised = !!target;
    const sentTab = tab, seq = ++sequence;
    fetch(path, {
      method:'PUT', credentials:'same-origin', mode:'same-origin', redirect:'error', cache:'no-store', keepalive,
      signal:keepalive ? undefined : AbortSignal.any([F.signal, AbortSignal.timeout(12000)]),
      headers:{...headers, 'X-Inflite':'1', 'Content-Type':'application/json'},
      body:JSON.stringify({id,tab,seq,label,target}),
    }).then(response => {
      if (!live() || sentTab !== tab || seq !== sequence) return;
      if (response.status === 400 && target) publish(null);
      if (response.status === 410) {
        localStorage.setItem('ifl:device-paused:' + owner, '1');
      }
    }).catch(() => {});
  }
  function renew() {
    if (!live() || suspended || !navigator.onLine) return;
    publish(paused() ? null : F.continuationTarget());
  }
  function paint() {
    clearTimeout(expiryTimer);
    if (!live()) return;
    const now = Date.now();
    const rows = tabs.filter(row => row.until > now && row.id !== id && (!row.app || F.session.apps?.[row.app])).slice(0,3);
    if (rows.length) expiryTimer = setTimeout(paint, Math.min(...rows.map(row => row.until-now)));
    const key = JSON.stringify(rows.map(row => [row.tab,row.target.path,row.updatedAt,row.label]));
    if (key === signature) return;
    signature = key;
    panel.replaceChildren();
    panel.hidden = !rows.length;
    if (!rows.length) return;
    const el = F.ui.el;
    panel.append(el('h2', {text:'Continue from another device'}));
    for (const row of rows) {
      const name = REGISTRY[row.app]?.name || (row.target.files ? 'Files' : 'Today');
      const open = async () => {
        if (!await read() || !live() || suspended || !panel.isConnected) return;
        const current = tabs.find(item => item.id === row.id && item.tab === row.tab && item.target.path === row.target.path && item.until > Date.now());
        if (current && (!row.app || F.session.apps?.[row.app])) F.nav.go(current.target.path, {
          state:current.target.files ? {files:{userId:owner,location:current.target.files}} : undefined,
        });
      };
      panel.append(el('button', {type:'button', class:'continuation-row', on:{click:open}},
        el('span', {}, el('strong', {text:name}), el('small', {text:row.label+' · '+new Date(row.updatedAt).toLocaleString()})),
        el('span', {'aria-hidden':'true', text:'›'})));
    }
  }
  async function read() {
    if (!live() || suspended || !navigator.onLine) return false;
    const generation = ++readGeneration, started = Date.now();
    try {
      const response = await fetch(path+'?id='+id, {headers, credentials:'same-origin', mode:'same-origin', redirect:'error', cache:'no-store', signal:AbortSignal.any([F.signal,AbortSignal.timeout(8000)])});
      if (!response.ok) throw Error();
      const result = await response.json();
      if (!live() || generation !== readGeneration) return false;
      tabs = (result.tabs || []).flatMap(row => {
        const target = resumeTarget(row.target);
        return target && Number.isFinite(row.remainingMs) ? [{...row,target,app:target.path.split('/')[1]?.split('#')[0],until:started+row.remainingMs}] : [];
      });
      paint();
      return true;
    } catch {
      if (generation === readGeneration) { tabs = []; paint(); }
      return false;
    }
  }
  function refreshCard() {
    const route = F.route;
    const today = route?.tab === 'today' || (route?.tab === 'workspace' && !route.tool);
    if (document.visibilityState === 'visible' && today) read();
  }
  function leave() {
    suspended = true;
    ++readGeneration;
    clearTimeout(routeTimer);
    publish(null, true);
    tabs = []; paint();
  }
  const options = {signal:F.signal};
  window.addEventListener('pagehide', leave, options);
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    tab = newTab(); sequence = 0; suspended = false;
    renew(); refreshCard();
  }, options);
  const refresh = () => { renew(); refreshCard(); };
  window.addEventListener('online', refresh, options);
  window.addEventListener('offline', () => { ++readGeneration; tabs = []; paint(); }, options);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); }, options);
  window.addEventListener('inflite:devices-changed', event => { if (event.detail?.owner === owner) refresh(); }, options);
  const off = F.on('route', () => {
    clearTimeout(routeTimer);
    routeTimer = setTimeout(refresh, 200);
  });
  const heartbeat = setInterval(renew, 45000), poll = setInterval(refreshCard, 10000);
  F.signal.addEventListener('abort', () => {
    leave(); off(); clearTimeout(expiryTimer); clearInterval(heartbeat); clearInterval(poll); panel.remove();
  }, {once:true});
  refresh();
}
