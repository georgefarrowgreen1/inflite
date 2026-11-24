const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");

// Node accepts redirect:"error", but workerd rejects it before any request.
// Exercise Atlas's default global fetch in the production runtime, with every
// outbound request intercepted and only deliberately fake credentials.
test("Atlas provider and chat requests run in workerd without following redirects", { timeout: 30000 }, async (t) => {
  const apiKey = "sk-" + "fixture".repeat(8);
  const model = "runtime-test-model";
  const entry = `
    import { atlas } from ${JSON.stringify(path.resolve(__dirname, "../today/src/atlas.js"))};
    let saved;
    export default { async fetch(request) {
      let credentialWrites = 0, messageWrites = 0;
      const env = {
        ATLAS_ENCRYPTION_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(17))),
        ATLAS_DB: { prepare(sql) { return { bind(...args) { return {
          async first() {
            if (sql.includes("atlas_credentials")) return saved?.owner === args[0] ? saved : null;
            if (sql.includes("atlas_usage")) return { requests: 1 };
            throw Error("Unexpected fixture query");
          },
          async all() {
            if (sql.includes("atlas_messages")) return { results: [] };
            throw Error("Unexpected fixture query");
          },
          async run() {
            if (sql.startsWith("INSERT INTO atlas_credentials")) {
              credentialWrites++;
              saved = { owner: args[0], iv: args[1], ciphertext: args[2], model: args[3] };
            } else if (sql.startsWith("INSERT INTO atlas_messages")) messageWrites++;
            else throw Error("Unexpected fixture write");
            return { success: true };
          }
        }; } }; } }
      };
      const account = async (_env, _request, { path }) => Response.json(
        path === "today/me"
          ? { signedIn: true, user: { id: "owner" }, apps: { mail: true } }
          : { fresh: true, owner: "owner" }
      );
      const response = await atlas(request, env, { account });
      return Response.json({
        status: response.status, body: await response.json(), credentialWrites, messageWrites
      });
    } };
  `;
  const bundled = await build({
    stdin: { contents: entry, resolveDir: path.resolve(__dirname, "..") },
    bundle: true, format: "esm", platform: "neutral", target: "es2022",
    write: false, logLevel: "silent"
  });
  let redirectHost = null;
  let redirectStatus = 302;
  let calls = [];
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: bundled.outputFiles[0].text,
    compatibilityDate: "2026-10-01",
    cf: false,
    outboundService: async (request) => {
      const url = new URL(request.url);
      calls.push({
        host: url.hostname, path: url.pathname, method: request.method,
        authorized: request.headers.get("Authorization") === "Bearer " + apiKey
      });
      // This handler never calls fetch: even an accidentally followed redirect
      // remains local, is recorded, and fails the one-request assertions below.
      if (url.hostname === redirectHost) {
        return new Response(null, { status: redirectStatus, headers: { Location: "https://redirect-target.invalid/collect" } });
      }
      if (url.hostname === "api.github.com") return new Response("Fixture repository README");
      if (url.hostname !== "api.openai.com") return new Response("Unexpected fixture destination", { status: 500 });
      if (url.pathname === "/v1/models/" + model) return Response.json({ id: model });
      if (url.pathname !== "/v1/responses") return new Response("Unexpected fixture endpoint", { status: 404 });
      const payload = await request.json();
      assert.equal(payload.model, model);
      assert.equal(payload.store, false);
      return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: "Runtime answer" }] }] });
    }
  }));
  t.after(() => mf.dispose());

  async function request(endpoint, body) {
    calls = [];
    const response = await mf.dispatchFetch("https://inflite.ai/atlas/api/" + endpoint, {
      method: "POST",
      headers: { Cookie: "account=abcdefghijklmnopqrstuvwxyz", Origin: "https://inflite.ai", "X-Inflite": "1", "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    assert.ok(!text.includes(apiKey), "API responses must not expose the fixture key");
    return JSON.parse(text);
  }

  await t.test("provider validation reaches OpenAI and saves the encrypted credential", async () => {
    const result = await request("provider", { key: apiKey, model });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { connected: true, model });
    assert.equal(result.credentialWrites, 1);
    assert.deepEqual(calls, [{ host: "api.openai.com", path: "/v1/models/" + model, method: "GET", authorized: true }]);
  });

  for (const status of [302, 307]) await t.test("provider rejects HTTP " + status + " without forwarding credentials or writing", async () => {
    redirectHost = "api.openai.com";
    redirectStatus = status;
    const result = await request("provider", { key: apiKey, model });
    assert.equal(result.status, 400);
    assert.equal(result.credentialWrites, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].host, "api.openai.com");
  });

  await t.test("chat decrypts the saved credential and reaches Responses", async () => {
    redirectHost = null;
    const result = await request("chat", { mode: "research", prompt: "Fixture prompt" });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { answer: "Runtime answer", sources: [] });
    assert.equal(result.messageWrites, 1);
    assert.deepEqual(calls, [{ host: "api.openai.com", path: "/v1/responses", method: "POST", authorized: true }]);
  });

  await t.test("chat rejects a redirect without forwarding credentials or saving an answer", async () => {
    redirectHost = "api.openai.com";
    const result = await request("chat", { mode: "research", prompt: "Fixture prompt" });
    assert.equal(result.status, 502);
    assert.equal(result.messageWrites, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].host, "api.openai.com");
  });

  await t.test("developer context reaches GitHub without the provider credential", async () => {
    redirectHost = null;
    const result = await request("chat", { mode: "developer", prompt: "Fixture prompt", githubRepo: "georgefarrowgreen1/inflite" });
    assert.equal(result.status, 200);
    assert.deepEqual(calls.map(({ host, authorized }) => ({ host, authorized })), [
      { host: "api.github.com", authorized: false }, { host: "api.openai.com", authorized: true }
    ]);
  });
});
