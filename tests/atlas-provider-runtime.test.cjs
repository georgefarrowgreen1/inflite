const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");

test("provider setup and health use encrypted owner credentials in workerd and D1", { timeout: 30000 }, async t => {
  const secret = "sk-" + "fixture".repeat(8), replacement = "sk-" + "replacement".repeat(5);
  const model = "gpt-6.2-sol";
  const entry = `
    import { providerStatus, getProvider, connectProvider, disconnectProvider, availableModels } from ${JSON.stringify(path.resolve(__dirname, "../today/src/atlas-provider.js"))};
    import { upgradeStorage, recordProviderHealth } from ${JSON.stringify(path.resolve(__dirname, "../today/src/atlas-store.js"))};
    export default { async fetch(request, env) {
      const url = new URL(request.url), owner = url.searchParams.get("owner") || "owner";
      const config = { ...env, ATLAS_ENCRYPTION_KEY: btoa("k".repeat(32)), OPENAI_API_KEY: ${JSON.stringify(secret)} };
      if (url.searchParams.has("broken")) config.ATLAS_ENCRYPTION_KEY = "wrong";
      if (url.searchParams.has("changed")) config.ATLAS_ENCRYPTION_KEY = btoa("x".repeat(32));
      if (url.searchParams.has("missing")) delete config.ATLAS_DB;
      const body = request.method === "POST" ? await request.json() : {};
      try {
        let value;
        if (url.pathname === "/setup") value = await upgradeStorage(config);
        else if (url.pathname === "/status") value = await providerStatus(config, owner);
        else if (url.pathname === "/connect") value = await connectProvider(config, owner, body);
        else if (url.pathname === "/disconnect") value = await disconnectProvider(config, owner);
        else if (url.pathname === "/models") value = await availableModels(config, owner);
        else if (url.pathname === "/record-health") value = await recordProviderHealth(config, owner, body);
        else if (url.pathname === "/credential") {
          const provider = await getProvider(config, owner);
          value = { model: provider.model, updatedAt: provider.updatedAt, correctSecret: provider.secret === ${JSON.stringify(secret)} || provider.secret === ${JSON.stringify(replacement)} };
        } else return new Response(null, { status: 404 });
        return Response.json(value);
      } catch (error) { return Response.json({ code: error.code, error: error.message }, { status: error.status || 500 }); }
    } };
  `;
  const bundled = await build({ stdin: { contents: entry, resolveDir: path.resolve(__dirname, "..") }, bundle: true, format: "esm", platform: "neutral", target: "es2022", write: false, logLevel: "silent" });
  let upstream = "ok", calls = [], ids = [model, "gpt-6.2-astra", "gpt-6.2-sol-2026-11-01", "text-embedding-fixture", "custom-model"];
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: bundled.outputFiles[0].text, compatibilityDate: "2026-10-01", cf: false, d1Databases: ["ATLAS_DB"],
    outboundService: async request => {
      const url = new URL(request.url);
      calls.push({ host: url.hostname, path: url.pathname, method: request.method, authorized: [secret, replacement].some(key => request.headers.get("Authorization") === "Bearer " + key) });
      if (upstream === "redirect") return new Response(null, { status: 307, headers: { Location: "https://redirect-target.invalid/collect" } });
      if (url.hostname !== "api.openai.com") return Response.json({ error: { message: "Unexpected fixture host" } }, { status: 500 });
      if (upstream === "denied") return Response.json({ error: { code: "invalid_api_key", message: secret } }, { status: 401 });
      if (url.pathname === "/v1/models") return Response.json({ data: ids.map(id => ({ id })) });
      if (url.pathname.startsWith("/v1/models/")) return Response.json({ id: url.pathname.slice(11) });
      return Response.json({ error: {} }, { status: 404 });
    },
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("ATLAS_DB");
  async function request(route, body) {
    calls = [];
    const response = await mf.dispatchFetch("https://fixture.invalid" + route, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const text = await response.text();
    assert.ok(!text.includes(secret) && !text.includes(replacement), "public provider replies never contain secrets");
    return { status: response.status, value: JSON.parse(text) };
  }
  assert.equal((await request("/setup", {})).value.ready, true);

  await t.test("missing storage and missing owner credentials are explicit without a global-key fallback", async () => {
    const missing = await request("/status?missing=1");
    assert.equal(missing.value.lastErrorCode, "provider_database_missing");
    const status = (await request("/status")).value;
    assert.equal(status.keySaved, false); assert.equal(status.healthy, false); assert.equal(status.setupAvailable, true);
    assert.equal((await request("/credential")).value.code, "provider_not_configured");
    assert.equal(calls.length, 0);
    assert.equal((await request("/connect", { model })).value.code, "provider_not_configured");
    assert.equal(calls.length, 0);
  });

  await t.test("metadata validation saves encrypted credentials without claiming live generation health", async () => {
    const connected = await request("/connect", { key: secret, model });
    assert.equal(connected.status, 200); assert.equal(connected.value.keySaved, true); assert.equal(connected.value.healthy, false);
    assert.deepEqual(calls, [{ host: "api.openai.com", path: "/v1/models/" + model, method: "GET", authorized: true }]);
    const row = await db.prepare("SELECT * FROM atlas_credentials WHERE owner='owner'").first();
    assert.ok(!JSON.stringify(row).includes(secret)); assert.equal(atob(row.iv).length, 12);
    const credential = (await request("/credential")).value;
    assert.equal(credential.correctSecret, true); assert.equal(credential.model, model); assert.ok(credential.updatedAt > 0);
    const status = (await request("/status")).value;
    assert.equal(status.keySaved, true); assert.equal(status.decryptable, true); assert.equal(status.lastSuccessAt, null); assert.equal(status.healthy, false);
    assert.equal((await request("/status?owner=other")).value.keySaved, false);
    assert.equal((await request("/credential?owner=other")).value.code, "provider_not_configured");
  });

  await t.test("live success and failure health is tied to the current credential revision", async () => {
    const credential = (await request("/credential")).value;
    await request("/record-health", { model, credentialUpdatedAt: credential.updatedAt, lastCheckedAt: 100, lastSuccessAt: 100, lastErrorCode: null });
    let status = (await request("/status")).value;
    assert.equal(status.healthy, true); assert.equal(status.lastSuccessAt, 100);
    await request("/record-health", { model, credentialUpdatedAt: credential.updatedAt, lastCheckedAt: 200, lastErrorCode: "openai_quota" });
    status = (await request("/status")).value;
    assert.equal(status.healthy, false); assert.equal(status.lastSuccessAt, 100); assert.equal(status.lastErrorCode, "openai_quota");
    const futureRevision = Date.now() + 60000;
    await db.prepare("UPDATE atlas_credentials SET updated_at=? WHERE owner='owner'").bind(futureRevision).run();
    assert.equal((await request("/connect", { key: replacement, model })).status, 200);
    const replaced = (await request("/credential")).value;
    assert.equal(replaced.updatedAt, futureRevision + 1, "replacements have a new revision even when timestamps collide or clocks lag");
    await request("/record-health", { model, credentialUpdatedAt: credential.updatedAt, lastCheckedAt: 300, lastSuccessAt: 300, lastErrorCode: null });
    status = (await request("/status")).value;
    assert.equal(status.healthy, false); assert.equal(status.lastSuccessAt, null);
    await request("/record-health", { model, credentialUpdatedAt: replaced.updatedAt, lastCheckedAt: 400, lastSuccessAt: 400, lastErrorCode: null });
    assert.equal((await request("/status")).value.healthy, true);
  });

  await t.test("project models expose verified capabilities and do not recommend arbitrary model families", async () => {
    const result = await request("/models");
    assert.equal(result.status, 200); assert.equal(result.value.selected, model);
    assert.deepEqual(result.value.models.map(item => item.id), [model, "gpt-6.2-astra", "gpt-6.2-sol-2026-11-01"]);
    assert.ok(result.value.models.every(item => item.available && item.capabilitiesVerified && item.webSearch));
    assert.deepEqual(calls, [{ host: "api.openai.com", path: "/v1/models", method: "GET", authorized: true }]);
  });

  await t.test("model-only reconnect reuses the owner key, revalidates access and invalidates old health", async () => {
    const before = (await request("/credential")).value;
    const changed = await request("/connect", { model: "gpt-6.2-astra" });
    assert.equal(changed.status, 200); assert.equal(changed.value.model, "gpt-6.2-astra"); assert.equal(changed.value.healthy, false);
    assert.deepEqual(calls, [{ host: "api.openai.com", path: "/v1/models/gpt-6.2-astra", method: "GET", authorized: true }]);
    const provider = (await request("/credential")).value;
    assert.equal(provider.correctSecret, true); assert.equal(provider.model, "gpt-6.2-astra"); assert.ok(provider.updatedAt > before.updatedAt);
    const status = (await request("/status")).value;
    assert.equal(status.decryptable, true); assert.equal(status.lastSuccessAt, null); assert.equal(status.healthy, false);
    assert.equal((await request("/connect?owner=other", { model })).value.code, "provider_not_configured"); assert.equal(calls.length, 0);
    assert.equal((await request("/connect", { model, key: "" })).value.code, "provider_key_invalid"); assert.equal(calls.length, 0);
    assert.equal((await request("/connect", { model })).status, 200);
  });

  await t.test("failed validation and redirects preserve the saved encrypted connection", async () => {
    const before = await db.prepare("SELECT * FROM atlas_credentials WHERE owner='owner'").first();
    for (const [mode, code] of [["denied", "openai_authentication"], ["redirect", "openai_redirect"]]) {
      upstream = mode;
      const result = await request("/connect", { key: secret, model });
      assert.equal(result.value.code, code); assert.equal(calls.length, 1); assert.equal(calls[0].host, "api.openai.com");
      assert.deepEqual(await db.prepare("SELECT * FROM atlas_credentials WHERE owner='owner'").first(), before);
    }
    upstream = "ok";
    const invalid = await request("/connect?broken=1", { key: secret, model });
    assert.equal(invalid.value.code, "provider_encryption_invalid"); assert.equal(calls.length, 0);
  });

  await t.test("a custom saved model is labelled unverified and missing project access remains visible", async () => {
    assert.equal((await request("/connect", { key: secret, model: "custom-model" })).status, 200);
    let selected = (await request("/models")).value.models[0];
    assert.equal(selected.id, "custom-model"); assert.equal(selected.available, true); assert.equal(selected.capabilitiesVerified, false); assert.equal(selected.pricing, null);
    ids = ids.filter(id => id !== "custom-model");
    selected = (await request("/models")).value.models[0];
    assert.equal(selected.available, false); assert.match(selected.note, /not listed for this project/);
  });

  await t.test("valid-format key rotation reports unreadable ciphertext and deletion still works with broken encryption", async () => {
    const unreadable = await request("/status?changed=1");
    assert.equal(unreadable.value.keySaved, true); assert.equal(unreadable.value.decryptable, false); assert.equal(unreadable.value.healthy, false);
    assert.equal(unreadable.value.lastErrorCode, "provider_credential_unreadable");
    assert.equal((await request("/credential?changed=1")).value.code, "provider_credential_unreadable");
    assert.equal((await request("/connect?changed=1", { model })).value.code, "provider_credential_unreadable"); assert.equal(calls.length, 0);
    const removed = await request("/disconnect?broken=1", {});
    assert.equal(removed.status, 200); assert.equal(removed.value.keySaved, false);
    assert.equal(await db.prepare("SELECT * FROM atlas_credentials WHERE owner='owner'").first(), null);
    assert.equal((await request("/status")).value.keySaved, false);
  });
});
