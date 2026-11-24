// Shared activity is a projection of durable Atlas records. Reading it never
// polls a provider, starts a task or copies private answers into the app shell.
const ID = /^[A-Za-z0-9._:-]{1,600}$/;
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const route = (section, id) => '/atlas/#' + section + '=' + encodeURIComponent(id);
export async function atlasActivity(env, owner, { limit = 12, schemaVersion = 6 } = {}) {
  const count = Number.isInteger(limit) ? Math.max(1, Math.min(20, limit)) : 12;
  const all = async (sql) => {
    const result = await env.ATLAS_DB.prepare(sql).bind(owner, count).all();
    if (result?.success === false) throw Object.assign(new Error('Atlas activity is temporarily unavailable.'), { code: 'activity_unavailable', status: 503 });
    return result?.results || [];
  };
  const [runs, briefs, conversations] = await Promise.all([
    schemaVersion >= 7 ? all('SELECT r.id,r.conversation_id,r.status,r.stage,r.updated_at,c.title FROM atlas_coding_runs r JOIN atlas_conversations c ON c.owner=r.owner AND c.id=r.conversation_id WHERE r.owner=? AND c.archived=0 ORDER BY r.updated_at DESC,r.id LIMIT ?') : [],
    all('SELECT b.id,b.conversation_id,b.title,b.created_at FROM atlas_briefs b JOIN atlas_conversations c ON c.owner=b.owner AND c.id=b.conversation_id WHERE b.owner=? AND c.archived=0 ORDER BY b.created_at DESC,b.id LIMIT ?'),
    all('SELECT id,title,updated_at FROM atlas_conversations WHERE owner=? AND archived=0 ORDER BY updated_at DESC,id LIMIT ?'),
  ]);
  const represented = new Set([...runs, ...briefs].map(row => row.conversation_id));
  const items = [
    ...runs.map(r => ({ id: r.id, kind: 'coding', runId: r.id, conversationId: r.conversation_id, title: text(r.title, 160), status: text(r.status, 40), stage: text(r.stage, 120), updatedAt: r.updated_at, href: route('tasks', r.id) })),
    ...briefs.map(b => ({ id: b.id, kind: 'brief', briefId: b.id, conversationId: b.conversation_id, title: text(b.title, 160), status: 'saved', stage: 'Saved brief', updatedAt: b.created_at, href: route('briefs', b.id) })),
    ...conversations.filter(c => !represented.has(c.id)).map(c => ({ id: c.id, kind: 'conversation', conversationId: c.id, title: text(c.title, 160), status: 'saved', stage: 'Conversation', updatedAt: c.updated_at, href: route('conversations', c.id) })),
  ].filter(item => ID.test(item.id) && ID.test(item.conversationId)).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)).slice(0, count);
  return { items, ready: true };
}
