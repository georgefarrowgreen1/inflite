import { credentialKeyBytes, saveCredential, loadCredential } from "./atlas-credentials.js";
import { getProviderHealth, recordProviderHealth } from "./atlas-store.js";
import { AtlasProviderError, safeProviderError, openAIJSON, modelCapabilities } from "./atlas-openai.js";

const MODEL_ID = /^[a-zA-Z0-9._-]{1,100}$/;
const keyFormat = /^sk-[A-Za-z0-9_-]{20,512}$/;
const blankHealth = { model: null, lastCheckedAt: null, lastSuccessAt: null, lastErrorCode: null, credentialUpdatedAt: null };

function configuredEncryption(env) {
  if (!env?.ATLAS_ENCRYPTION_KEY) throw new AtlasProviderError("provider_encryption_missing");
  try { credentialKeyBytes(env); }
  catch (error) { throw safeProviderError(error, "provider_encryption_invalid"); }
}

// A saved row and a successful generation are deliberately separate facts.
export async function providerStatus(env, owner) {
  const status = {
    keySaved: false, decryptable: false, connected: false, healthy: false,
    setupAvailable: false, model: null, savedAt: null,
    lastCheckedAt: null, lastSuccessAt: null, lastErrorCode: null,
  };
  if (!env?.ATLAS_DB) return { ...status, lastErrorCode: "provider_database_missing", error: new AtlasProviderError("provider_database_missing").message };
  let row;
  try { row = await env.ATLAS_DB.prepare("SELECT model,updated_at FROM atlas_credentials WHERE owner=?").bind(owner).first(); }
  catch { return { ...status, lastErrorCode: "provider_database_read_failed", error: new AtlasProviderError("provider_database_read_failed").message }; }
  status.keySaved = !!row;
  status.model = typeof row?.model === "string" ? row.model : null;
  status.savedAt = Number.isFinite(row?.updated_at) ? row.updated_at : null;
  try { configuredEncryption(env); status.setupAvailable = true; }
  catch (error) { const safe = safeProviderError(error); return { ...status, lastErrorCode: safe.code, error: safe.message }; }
  if (!row) return status;
  try {
    const credential = await loadCredential(env, owner);
    if (!credential) return { ...status, keySaved: false, model: null, savedAt: null };
    status.model = credential.model;
    status.savedAt = Number.isFinite(credential.updatedAt) ? credential.updatedAt : status.savedAt;
    status.decryptable = true;
    status.connected = true; // Legacy consumers: saved and readable, not an assertion of live API health.
  } catch (error) {
    const safe = safeProviderError(error, "provider_credential_unreadable");
    return { ...status, lastErrorCode: safe.code, error: safe.message };
  }
  let health;
  try { health = await getProviderHealth(env, owner) || blankHealth; }
  catch { return { ...status, lastErrorCode: "provider_health_unavailable", error: new AtlasProviderError("provider_health_unavailable").message }; }
  if (health.model === status.model && health.credentialUpdatedAt === status.savedAt && status.savedAt !== null) {
    status.lastCheckedAt = health.lastCheckedAt ?? null;
    status.lastSuccessAt = health.lastSuccessAt ?? null;
    status.lastErrorCode = health.lastErrorCode ?? null;
    status.healthy = Number.isFinite(status.lastSuccessAt) && status.lastErrorCode === null;
  }
  return status;
}

export async function getProvider(env, owner) {
  if (!env?.ATLAS_DB) throw new AtlasProviderError("provider_database_missing");
  configuredEncryption(env);
  let provider;
  try { provider = await loadCredential(env, owner); }
  catch (error) { throw safeProviderError(error, "provider_credential_unreadable"); }
  if (!provider) throw new AtlasProviderError("provider_not_configured");
  if (typeof provider.secret !== "string" || !keyFormat.test(provider.secret)) throw new AtlasProviderError("provider_credential_unreadable");
  if (typeof provider.model !== "string" || !MODEL_ID.test(provider.model)) throw new AtlasProviderError("provider_credential_unreadable");
  return provider;
}

// Authentication, same-origin and fresh-sign-in gates are applied by the router.
export async function connectProvider(env, owner, { key, model } = {}, { send = fetch, signal } = {}) {
  if (!env?.ATLAS_DB) throw new AtlasProviderError("provider_database_missing");
  if (typeof model !== "string" || !MODEL_ID.test(model)) throw new AtlasProviderError("provider_model_invalid");
  configuredEncryption(env);
  // Changing only the model reuses this owner's encrypted key. An explicitly
  // supplied but invalid key remains an error, rather than a silent fallback.
  if (key === undefined) key = (await getProvider(env, owner)).secret;
  if (typeof key !== "string" || !keyFormat.test(key)) throw new AtlasProviderError("provider_key_invalid");
  const selected = await openAIJSON("/v1/models/" + encodeURIComponent(model), { secret: key, send, signal });
  if (selected.id !== model) throw new AtlasProviderError("openai_invalid_response");
  // Reset health before replacement so a metadata-only check cannot inherit a
  // previous key's successful generation. Live checks are bound to updated_at.
  try { await recordProviderHealth(env, owner, { model, lastCheckedAt: null, lastSuccessAt: null, lastErrorCode: null, credentialUpdatedAt: null }); }
  catch { throw new AtlasProviderError("provider_database_write_failed"); }
  try { await saveCredential(env, owner, key, model); }
  catch (error) { throw safeProviderError(error, "provider_database_write_failed"); }
  return { keySaved: true, decryptable: true, connected: true, healthy: false, setupAvailable: true, model, lastCheckedAt: null, lastSuccessAt: null, lastErrorCode: null };
}

export async function disconnectProvider(env, owner) {
  if (!env?.ATLAS_DB) throw new AtlasProviderError("provider_database_missing");
  // Deletion remains possible even if the encryption setting is damaged.
  try {
    const result = await env.ATLAS_DB.prepare("DELETE FROM atlas_credentials WHERE owner=?").bind(owner).run();
    if (result?.success === false) throw Error();
  } catch { throw new AtlasProviderError("provider_database_delete_failed"); }
  // Health is never considered without its credential. An incomplete upgrade
  // must not prevent an owner from removing an existing saved secret.
  try { await env.ATLAS_DB.prepare("DELETE FROM atlas_provider_health WHERE owner=?").bind(owner).run(); } catch {}
  return { keySaved: false, decryptable: false, connected: false, healthy: false, model: null, lastCheckedAt: null, lastSuccessAt: null, lastErrorCode: null };
}

export async function availableModels(env, owner, { send = fetch, signal } = {}) {
  const provider = await getProvider(env, owner);
  const response = await openAIJSON("/v1/models", { secret: provider.secret, send, signal });
  if (!Array.isArray(response.data)) throw new AtlasProviderError("openai_invalid_response");
  const available = new Set(response.data.filter(item => item && typeof item.id === "string" && MODEL_ID.test(item.id)).map(item => item.id));
  const models = [...available].map(modelCapabilities).filter(item => item.capabilitiesVerified || item.id === provider.model);
  const chosen = models.find(item => item.id === provider.model);
  if (!chosen) models.push({ ...modelCapabilities(provider.model), available: false, note: "The saved model is not listed for this project. Reconnect with an available model." });
  for (const item of models) {
    if (item.available === undefined) item.available = available.has(item.id);
    if (!item.capabilitiesVerified && !item.note) item.note = "Saved custom model. Responses and workspace capabilities still need a successful connection test.";
  }
  models.sort((a, b) => (a.id === provider.model ? -1 : b.id === provider.model ? 1 : a.id.localeCompare(b.id)));
  return { models, selected: provider.model };
}
