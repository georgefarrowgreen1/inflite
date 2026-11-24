import { AtlasStoreError } from './atlas-store.js';

const ID = /^[A-Za-z0-9._:-]{1,600}$/;
const MAIL_ID = /^[A-Za-z0-9_-]{1,64}$/;
const queries = {
  answer: `
    SELECT c.title,t.status,1 AS revision,t.answer AS text,t.sources_json,t.context_json
    FROM atlas_turns t JOIN atlas_conversations c ON c.owner=t.owner AND c.id=t.conversation_id
    WHERE t.owner=? AND t.id=?
  `,
  background: `
    SELECT c.title,r.status,r.revision,t.answer AS text,t.sources_json
    FROM atlas_answer_runs r JOIN atlas_conversations c ON c.owner=r.owner AND c.id=r.conversation_id
    LEFT JOIN atlas_turns t ON t.owner=r.owner AND t.conversation_id=r.conversation_id AND t.id=r.request_id AND t.status='completed'
    WHERE r.owner=? AND r.id=?
  `,
  coding: `
    SELECT substr(prompt,1,140) AS title,status,revision,summary AS text,repository,base_sha,publish_url
    FROM atlas_coding_runs WHERE owner=? AND id=?
  `,
  scheduled: `
    SELECT s.title,r.status,1 AS revision,r.result AS text,r.sources_json
    FROM atlas_schedule_runs r JOIN atlas_schedules s ON s.owner=r.owner AND s.id=r.task_id
    WHERE r.owner=? AND r.id=?
  `,
};

function parseArray(value) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

function sourceList(row) {
  const candidates = parseArray(row.sources_json);
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(row.repository || '')) {
    const repository = 'https://github.com/' + row.repository;
    if (/^[a-f0-9]{40}$/i.test(row.base_sha || '')) candidates.push({ title: 'Repository revision', url: repository + '/tree/' + row.base_sha });
    if (row.publish_url?.startsWith(repository + '/pull/')) candidates.push({ title: 'Reviewed changes on GitHub', url: row.publish_url });
  }
  const seen = new Set(), sources = [];
  for (const source of candidates) {
    let url;
    try { url = new URL(source?.url); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 4096 || seen.has(url.href)) continue;
    seen.add(url.href);
    sources.push({ url: url.href, title: typeof source.title === 'string' ? source.title.slice(0, 160) : url.hostname });
    if (sources.length === 12) break;
  }
  return sources;
}

export function runDraftAvailable(kind, status, hasOutput) {
  return !!hasOutput && (status === 'completed' || kind === 'coding' && status === 'published');
}

export async function readAtlasRunDraft(env, owner, kind, id, revision) {
  if (!Object.hasOwn(queries, kind) || !ID.test(id)) throw new AtlasStoreError('not_found', 'This Atlas run is unavailable.', 404);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new AtlasStoreError('invalid_run_revision', 'Open a saved run revision to prepare a draft.', 400);
  const row = await env.ATLAS_DB.prepare(queries[kind]).bind(owner, id).first();
  if (!row) throw new AtlasStoreError('not_found', 'This Atlas run is unavailable.', 404);
  if (row.revision !== revision) throw new AtlasStoreError('run_changed', 'The run has changed. Refresh its timeline to review the latest result.', 409);
  if (!runDraftAvailable(kind, row.status, row.text?.trim())) throw new AtlasStoreError('run_result_unavailable', 'A completed result is needed to prepare a draft.', 409);
  const original = parseArray(row.context_json).find(item => item?.kind === 'mail' && MAIL_ID.test(item.threadId || ''));
  const mail = original && { threadId: original.threadId, ...(MAIL_ID.test(original.messageId || '') ? { messageId: original.messageId } : {}) };
  return {
    draft: { title: row.title.split('\n')[0].slice(0, 160), text: row.text.slice(0, 64000),
      truncated: row.text.length > 64000, sources: sourceList(row), ...(mail ? { mail } : {}) },
  };
}
