# Atlas workspace and deployment

Atlas is served by the existing root Worker at `/atlas` and `/atlas/api/*`. Every request checks the account service's existing admin-only Mail entitlement. It uses the existing InFlite sign-in and `APPS` service binding.

## Credentials and storage

Administrators configure OpenAI in **Connections & preferences**. Saving, replacing or removing credentials requires the account service's authoritative fresh-authentication proof at `/api/account/atlas/fresh`. The key and model are scoped to the signed-in owner. Atlas encrypts credentials in D1 using AES-GCM with owner-specific authenticated context and never returns their plaintext. Model changes can reuse that owner's saved key; changing the model revalidates project availability and clears the previous connection result.

Saving a connection checks model metadata. **Test with a short response** makes a real Responses request; the optional web-search check tests the Research path too. Storage readiness, saved-key readability, selected model and the most recent successful response remain separate facts. Live results are tied to the saved credential revision, so an old in-flight response cannot mark a replacement key healthy. `/health` does not send paid requests.

The model picker intersects project availability with verified Responses capabilities. Known model families have dated pricing metadata. A custom saved model is clearly labelled unverified; its availability does not prove every workspace/tool works. OpenAI authentication, model access, exhausted quota, rate limiting, timeout, malformed responses and interrupted output have distinct safe error codes. Upstream response bodies, prompts and keys are not logged. Each HTTP error includes a correlation identifier; usage records also retain a sanitized upstream request identifier where available.

Configure `ATLAS_ENCRYPTION_KEY` as a secret on each target Worker: `inflite-next` for staging and `inflite` for production. It must be the base64 encoding of exactly 32 random bytes. Keep the existing key stable: replacing it makes stored credentials unreadable. Secrets are environment-specific, so a secret added only to production or GitHub does not configure staging. The deployment workflow checks that the staging Worker has the secret and preserves it; it does not generate, copy or rotate it. Never commit secret values.

Interactive and scheduled Atlas requests use only the requesting owner's encrypted connection. There is no Worker-level `OPENAI_API_KEY` or `ATLAS_MODEL` fallback. No new provider secret belongs in GitHub Actions for these features.

`ATLAS_DB` stores encrypted provider/integration credentials, conversations, turns, source references, briefs, settings, execution ledgers, schedules, run history and patch drafts. Provision and bind the appropriate database with `node tools/atlas-bind.mjs next` or `node tools/atlas-bind.mjs production`. Staging uses `inflite-atlas-next`; production uses `inflite-atlas-production`. The binding helper changes only the selected environment and refuses an existing conflicting ID.

Schema version6 is additive and idempotent. Apply all migrations in `atlas/migrations` with Wrangler, or use the authenticated **Finish storage setup** action in Atlas. The latter requires a fresh administrator proof and an explicit confirmation. Reads never apply DDL. Existing history imports into named conversations, existing task drafts import paused, and incomplete legacy runs become uncertain. Import markers prevent deleted imported history from reappearing after a repeated upgrade. Existing encrypted credentials and original legacy records remain intact.

## Conversations, sources and memory

Each conversation has its own fixed workspace and optional repository. Rename, archive, restore, delete, resume, load older messages and export are owner-scoped. A Markdown export streams every turn in bounded database pages; the visible history page limit does not truncate the export. Deleting a conversation removes its turns and saved briefs, disables linked schedules and marks linked active requests for cancellation.

The assistant receives a bounded set of recent turns, earlier excerpts, and an optional explicit conversation summary. **Summarize earlier context** creates a model-written summary and records its usage while retaining the full original history. Summaries remain specific to their conversation. Shared personal memory consists only of the editable text the owner explicitly saves and enables in settings; Atlas does not silently extract personal facts.

Research output preserves provider citation URLs, titles and offsets, and renders them as safe links. A completed answer can be saved as a brief with a snapshot of its sources and exported as Markdown. Incomplete, cancelled and uncertain output retain distinct statuses and cannot silently become completed briefs. Repository source references include the selected commit or PR/job revision; attached source text is treated as untrusted input.

The mobile page has a persistent header and composer, a conversation drawer, streamed text, Stop, explicit Retry, code copy and safe Markdown/table rendering. Private content stays in page memory and D1, without browser local storage. Every API response carries an opaque owner marker; the client checks it and sends it back on requests. A mismatching account marker is rejected before a mutation, and delayed old-account responses cannot repopulate the UI. Returning to the tab rechecks the session before revealing private content.

## Repository investigation and reviewed patches

Without a saved GitHub token, the original public repository allowlist is available. An optional owner-specific encrypted GitHub token adds permitted private repositories. Reading needs Metadata, Contents, Pull requests and Actions read access as appropriate; publishing a draft needs Contents and Pull requests write access for the selected repository. Tokens are entered in the authenticated settings UI and are never returned by status APIs.

Selecting a repository in a Developer conversation gives Atlas its identity and automatic access to repository context. A request such as `import repo` starts with a pinned overview of the repository structure and introductory/configuration files. Atlas can then list directories, search and read relevant files across that selected repository as needed, without a manual file-selection step. It reads bounded context for each request rather than loading every file into one prompt. The conversation stays scoped to its selected repository, and the response records the files actually read.

**Sources** is optional: attach up to six regular UTF-8 files, pull request changes or workflow job logs to highlight specific material. These attachments do not restrict Atlas to those files. File content is pinned to a commit and verified against its blob SHA. Secret-like paths, traversal, symlinks and binary content are excluded from file reads. Job logs use GitHub's signed download link with no GitHub token or cookies forwarded to the download host. Large/truncated context and incomplete repository discovery are bounded and identified.

**Prepare changes** produces a stored, reviewable patch for one to five existing files at one revision. Explicit file attachments take priority; otherwise, it reuses eligible files read for the latest completed answer in the selected repository. If that answer spans more than five files or multiple revisions, ask Atlas to focus the change or add specific files in **Sources**. This patch limit does not restrict repository investigation in chat. The draft displays full proposed changes and a validation plan. Atlas does not execute the proposed code or tests. New files, deletions and workflow-file modifications are outside this first patch workflow. **Create draft pull request** is a separate explicit action with a fresh administrator proof. Publication rechecks the immutable base and approved file scope, creates a dedicated branch and a draft PR, and records its URL. Retrying publication cannot silently add a second unrelated branch or accept a changed branch tree. The product never merges or deploys these generated patches.

## Usage and cancellation

The default allowance is20 requests per owner per UTC day, configurable from1 to100. Chat, connection tests, summaries, patch preparation and scheduled runs share the same atomic request ledger and allowance. Reservations include concurrent work, and a repeated request identifier cannot dispatch twice. Known usage reports input/output/cache tokens and dated estimated cost. A configurable daily estimate threshold limits new reservations; it is not a guaranteed provider billing cap. Unknown usage, custom pricing, cache writes and already-dispatched requests can differ from estimates. OpenAI project spending controls remain authoritative.

Stop aborts local streaming and persists an owner-specific cancellation marker checked by running work. Partial text is retained where received. Requests that may have reached the provider are recorded honestly as failed, incomplete, cancelled or uncertain, not automatically refunded or silently replayed. Explicit Retry creates a new request and may incur another charge.

## Automated staging deployment

The GitHub environment `atlas-staging` supplies `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Scope the token to the account with Workers Scripts edit, D1 edit and the necessary route permissions. Verify the environment's actual access controls; naming it in YAML does not establish reviewer protection. The `inflite-next` Worker must already have `ATLAS_ENCRYPTION_KEY` and the existing shared `HUB_KEY`; the account service must allow the staging origin as described in `wrangler.toml`. The workflow checks secret names only. It cannot verify their values or that the encryption key can decrypt existing records.

`.github/workflows/atlas-staging.yml` is manual and restricted to the canonical default branch, `claude/inflite`. It checks out that default-branch commit and cannot deploy `atlas-integration` or another feature branch. GitHub also requires the workflow definition on the default branch before manual dispatch. This preserves the repository's default-branch restriction for jobs with deployment secrets.

The workflow runs the Atlas tests, verifies deployment credentials and existing Worker secret names, binds the staging D1 database, applies migrations, and deploys with `ATLAS_AUTONOMY="0"` from the Wrangler configuration. It then checks anonymous requests to the page and private APIs are denied. It leaves the existing encryption secret unchanged.

## Staging a tested feature commit before merge

The default-only workflow cannot validate an unmerged Atlas release. An authorized release operator with Cloudflare access must use a local checkout of the reviewed feature commit after its CI passes. Do not merge the application merely to make its staging workflow available.

Install the locked dependencies and run `npm run test:atlas`. Use `npx wrangler secret list --env next --format json` to confirm `ATLAS_ENCRYPTION_KEY` and `HUB_KEY` are already configured on `inflite-next`, without reading or replacing their values. Check that the staging Wrangler configuration still has `ATLAS_AUTONOMY="0"`, then run:

```sh
node tools/atlas-bind.mjs next
npx wrangler d1 migrations apply ATLAS_DB --remote --env next
npx wrangler deploy --env next
```

Record the tested commit and deployed Worker version, then complete the authenticated and anonymous checks below. A passing CI run does not establish that this staging deployment or verification occurred.

## Release verification

Run `npm ci --ignore-scripts --no-audit --no-fund`, `npm run test:atlas` and the existing CI suite before deployment. On staging, verify signed-out and standard-user denial, administrator access, fresh-authentication enforcement, credential connect and removal, an actual AI request, owner-scoped history, and existing site routes. The authenticated credential round trip must verify the encryption secret is usable; the anonymous smoke check alone is insufficient. Only release to production after these checks pass, the production database migrations are applied, and the production Worker secret is configured. Existing Workers Builds handles production deployment after merge.

`npm run test:atlas` exercises the provider, router, scheduler and storage in real workerd/Miniflare and D1 with fixture outbound services. It includes redirects, credential revision changes, partial streams, duplicate paid requests, account boundaries, more than1000 exported turns, source/brief persistence, cost reservations, timezone transitions and scheduler recovery. `npm run test:atlas:browser` runs fixture-only mobile/desktop flows; use `WEB_UI_BROWSER=webkit` for WebKit. The dedicated Atlas CI workflow installs both browsers and stores screenshots. No real keys, paid OpenAI requests or GitHub writes are used by CI. These checks establish application behavior; they do not prove the currently deployed live account, encryption secret or provider balance is valid.

## Scheduled work

Tasks support intervals, daily local time and selected weekdays with an IANA timezone. New tasks are always paused. A task has a stable results conversation and run history. Daily/weekly schedules account for daylight-saving gaps and repeated local times; a repeated local time runs once, while a nonexistent time shifts forward by the gap. Cron checks every minute. Unique occurrence records and leases prevent concurrent duplicate runs, and abandoned leases become explainable uncertain runs instead of being replayed.

Background execution remains disabled by `ATLAS_AUTONOMY="0"` in both checked-in environments. After deployment configuration is ready, an administrator can explicitly enable individual tasks. Enabling background execution requires matching `ATLAS_VERIFY_KEY` secrets on the Today and account Workers, the companion `/api/atlas-admin` current-admin endpoint and the `APPS` service binding. An explicit manual run works while the master switch is off and rechecks the signed-in/current administrator before provider dispatch. Pausing a task or all tasks signals active work and prevents future occurrences.

Every run decrypts the owner's saved OpenAI connection and shares the interactive request allowance and estimate threshold. No browser cookies or Worker-global provider key are saved for background use. Fitness context needs explicit consent on a Fitness task. The companion POST `/api/atlas-context` endpoint authenticates the shared verifier, checks current administrator membership and returns only the requested owner's Fitness card summary. It accepts only `scope:"fitness"`; it is not a general account-data proxy. The endpoint follows the same account-host and shared-verifier boundary as `/api/atlas-admin`.

## Answer quality benchmark

`atlas/quality/cases.json` defines eight representative tasks covering primary-source research, missing evidence, scoped code changes, untrusted instructions, conversation continuity, prioritization, Fitness consent boundaries and structured comparisons. The optional collector runs nine model requests through a current owner's configured Atlas connection. It creates separate conversations, keeps shared personal memory disabled for comparability, records results after each case and archives completed benchmark conversations. It never provisions or reads an OpenAI key and never automatically retries paid work.

To collect live results in an authenticated operator session, provide `ATLAS_SESSION_COOKIE` through a secure local environment (never commit it or place it on a command line), set `ATLAS_BASE_URL` to `https://next.inflite.ai` or `https://inflite.ai`, and run:

```sh
node tools/atlas-quality.mjs run /private/path/atlas-results.json --confirm-api-usage
node tools/atlas-quality.mjs evaluate /private/path/atlas-results.json
```

The collector requires explicit acknowledgement of API usage. It stops and preserves partial results on failure. A reviewer scores each case's correctness, grounding and usefulness from0 to4 using its recorded rubric, adding `review:{correctness:3,grounding:3,usefulness:3,reviewer:"name"}` to the result file. A pass needs every case, passing automatic completion/source/length checks and a score of at least3 in all three review dimensions. Until then the report says `needs_review`. Citation shape checks do not prove factual support. The report includes median/p95 latency, known estimated cost and the count of unknown-cost cases. Evaluator fixtures in CI test the scoring mechanism; they are not claims of measured production model quality.
