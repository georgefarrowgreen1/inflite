import { atlasReference } from "../../roof/router.js";

// Atlas supplies durable, owner-scoped metadata only. Refreshing Activity never
// starts, retries or polls a provider task, and transient errors keep good data.
export function createAtlasActivityReader(F, { registry, open, fetch: send = globalThis.fetch, now = Date.now } = {}) {
  const owner = F.session?.view?.user?.id, records = new Map(), life = new AbortController();
  let source = null, pending = null, last = -Infinity, observed = false, marker;
  const owned = () => !!owner && !life.signal.aborted && !F.signal?.aborted && F.session?.view?.user?.id === owner;
  const allowed = () => owned() && F.session?.apps?.atlas === true && F.session?.view?.apps?.mail === true;
  const hash = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
  const clear = () => { source?.destroy(); source = null; records.clear(); last = -Infinity; };
  function refresh({ force = false } = {}) {
    if (!allowed()) { clear(); return Promise.resolve({ok:true}); }
    observed = true;
    if (pending) return pending;
    if (!force && now() - last < 30000) return Promise.resolve({ok:true});
    const work = (async () => {
      // Crypto belongs to a requested refresh, not shared-workspace startup.
      // An unsupported/insecure host follows this operation's normal error path.
      const expected = marker ||= (await hash('atlas-owner:' + owner)).slice(0, 32);
      if (!allowed()) return {ok:false,cancelled:true};
      const response = await send('/atlas/api/activity?limit=12', {cache:'no-store',credentials:'same-origin',
        headers:{'X-Atlas-Owner':expected},signal:AbortSignal.any([life.signal,F.signal,AbortSignal.timeout(12000)])});
      if (!allowed()) return {ok:false,cancelled:true};
      if ([401,403,409].includes(response.status)) { clear(); return {ok:false,error:'Open Atlas to check your account connection.'}; }
      if (!response.ok) throw new Error('Activity unavailable');
      const data = await response.json();
      if (!allowed()) return {ok:false,cancelled:true};
      if (response.headers.get('X-Atlas-Owner') !== expected) { clear(); return {ok:false,cancelled:true}; }
      if (data.ready !== true || !Array.isArray(data.items)) throw new Error('Activity unavailable');
      source ||= registry.source('atlas', {signal:life.signal,current:allowed});
      const keep = new Set();
      for (const item of data.items.slice(0,20).sort((a,b)=>(a.updatedAt||0)-(b.updatedAt||0))) {
        if (!['coding','conversation','brief'].includes(item?.kind) || !(item.kind === 'conversation' ? atlasReference(item.id) : /^[A-Za-z0-9_-]{1,40}$/.test(item.id || ''))) continue;
        const section = {coding:'tasks',conversation:'conversations',brief:'briefs'}[item.kind];
        const href = '/atlas/#' + section + '=' + item.id;
        const reference = item.id.length <= 100 ? item.id : await hash(item.id);
        if (!allowed()) return {ok:false,cancelled:true};
        const id = item.kind + ':' + reference;
        if (item.href !== href) continue;
        const status = ({preparing:'queued',running:'running',publishing:'running',waiting:'waiting',uncertain:'waiting',completed:'succeeded',published:'succeeded',saved:'succeeded',failed:'failed',cancelled:'cancelled'})[item.status] || 'waiting';
        const value = {title:item.title || 'Atlas task',detail:'Atlas · ' + (item.stage || section),status,kind:'task'};
        const fingerprint = JSON.stringify([value,item.updatedAt,href]); keep.add(id);
        if (records.get(id) === fingerprint) continue;
        if (source.put(id,{...value,actions:[{id:'open',label:'Open in Atlas',current:allowed,run:()=>allowed()&&open(href)}]})) records.set(id,fingerprint);
      }
      for (const id of records.keys()) if (!keep.has(id)) { source.remove(id); records.delete(id); }
      last = now(); return {ok:true};
    })().catch(error => ({ok:false,...(!allowed()||error?.name==='AbortError'?{cancelled:true}:{error:'Atlas activity couldn’t refresh. Your previous results are still here.'})}));
    pending = work;
    work.finally(() => { if (pending === work) pending = null; });
    return work;
  }
  function destroy() { life.abort(); clear(); F.signal?.removeEventListener('abort',destroy); }
  F.signal?.addEventListener('abort',destroy,{once:true});
  return {refresh,destroy,get observed(){return observed;}};
}
