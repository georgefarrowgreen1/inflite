# Atlas workspace and deployment

Atlas is served by the existing root Worker at `/atlas` and `/atlas/api/*`. Every request checks the account service's existing admin-only Mail entitlement. It uses the existing InFlite sign-in and `APPS` service binding.

## Credentials and storage

Administrators configure OpenAI in **Connections & preferences**. Saving, replacing or removing credentials requires the account service's authoritative fresh-authentication proof at `/api/account/atlas/fresh`. The key and model are scoped to the signed-in owner. Atlas encrypts credentials in D1 using AES-GCM with owner-specific authenticated context and never returns their plaintext. Model changes can reuse that owner's saved key; changing the model revalidates project availability and clears the previous connection result.

Saving a connection checks model metadata. **Test with a short response** makes a real Responses request; the optional web-search check tests the Research path too. Storage readiness, saved-key readability, selected model and the most recent successful response remain separate facts. Live results are tied to the saved credential revision, so an old in-flight response cannot mark a replacement key healthy. `/health` does not send paid requests.

The model picker intersects project availability with verified Responses capabilities. Known model families have dated pricing metadata. A custom saved model is clearly labelled unverified; its availability does not prove every workspace/tool works. OpenAI authentication, model access, exhausted quota, rate limiting, timeout, malformed responses and interrupted output have distinct safe error codes. Upstream response bodies, prompts and keys are not logged. Each HTTP error includes a correlation identifier; usage records also retain a sanitized upstream request identifier where available.

Configure `ATLAS_ENCRYPTION_KEY` as a secret on each target Worker: `inflite-next` for staging and `inflite` for production. It must be the base64 encoding of exactly 32 random bytes. Keep the existing key stable: replacing it makes stored credentials unreadable. Secrets are environment-specific, so a secret added only to production or GitHub does not configure staging. The deployment workflow checks that the staging Worker has the secret and preserves it; it does not generate, copy or rotate it. Never commit secret values.

Interactive and scheduled Atlas requests use only the requesting owner's encrypted connection. There is no Worker-level `OPENAI_API_KEY` or `ATLAS_MODEL` fallback. No new provider secret belongs in GitHub Actions for these features.

`ATLAS_DB` stores encrypted provider/integration credentials, conversations, turns, source references, briefs, settings, execution ledgers, schedules, run history, patch drafts and coding tasks. Provision and bind the appropriate database with `node tools/atlas-bind.mjs next` or `node tools/atlas-bind.mjs production`. Staging uses `inflite-atlas-next`; production uses `inflite-atlas-production`. The binding helper changes only the selected environment and refuses an existing conflicting ID.

Schema version 7 adds `atlas_coding_runs` and `atlas_coding_changes` without changing existing encrypted credentials or history. Apply all migrations in `atlas/migrations` with Wrangler, or select **Prepare workspace** / **Enable coding tasks** in Atlas. The authenticated setup action sends an explicit confirmation and requires the existing fresh administrator proof. Reads never apply DDL. A version 6 database remains ready for chat while `health.coding.storageReady` reports that coding tasks need the version 7 upgrade. Existing history imports into named conversations, existing task drafts import paused, and incomplete legacy runs become uncertain. Import markers prevent deleted imported history from reappearing after a repeated upgrade.

Schema version 8 adds owner-scoped cloud environment configurations and immutable configuration snapshots on coding tasks. Existing version 7 coding tasks and version 6 conversations remain available while environment setup is pending. `health.environments.ready` reports this separately. The upgrade is additive and repeatable, including after a partial migration; it retains credentials, conversations, stored changes and spending preferences.

## Cloud environments

Open **Cloud environments** to save a repository setup, then select it in the Developer composer. Each configuration includes a name, repository, optional branch, machine size, setup command, check command and network policy. Leaving the branch blank uses the repository's current default branch. Atlas pins the selected branch to an immutable commit before preparing the workspace.

| Machine | CPU | Memory |
| --- | --- | --- |
| Small | 1 vCPU | 1 GB |
| Medium (default) | 2 vCPU | 4 GB |
| Large | 4 vCPU | 16 GB |

These are real OpenAI-hosted Linux workspaces. A saved environment is a reusable configuration, not a permanently running machine. Every new coding task gets an isolated workspace; a continuation keeps the same workspace and its edits while it is available. Workspaces can expire after inactivity, while saved results remain available in Atlas. The existing owner-saved OpenAI connection powers execution; no provider or GitHub credentials are copied into the workspace.

The setup command runs in `/workspace/repo` after Atlas has prepared and verified the repository. A failed setup prevents agent execution. The check command is supplied to the coding agent as the requested verification command; only recorded command execution establishes its result. **Package downloads** permits the existing npm, PyPI and Playwright hosts. **No network** disables outbound access. Scripts and configuration fields are not a secret store.

Atlas copies the selected environment into the task when it starts. Editing or archiving a configuration affects future tasks and does not change an existing task's setup, branch, machine or network access. Configurations are owner-scoped, capped at 40 active entries, and updates use a revision to reject stale edits. Archiving a configuration does not stop its running tasks.

The authenticated API is `GET/POST /atlas/api/environments`, `GET/PATCH /atlas/api/environments/:id`, and `DELETE /atlas/api/environments/:id` (archive). Create and update responses contain `{environment}`; list responses contain `{environments,ready}`; archive returns `{removed:true}`. Update requests can include `expectedRevision`. Coding starts accept an optional `environmentId`; omitting it retains the default Medium cloud setup.

## Conversations, sources and memory

Each conversation has its own fixed workspace and optional repository. Rename, archive, restore, delete, resume, load older messages and export are owner-scoped. A Markdown export streams every turn in bounded database pages; the visible history page limit does not truncate the export. Deleting a conversation removes its turns and saved briefs, disables linked schedules and marks linked active requests for cancellation.

The assistant receives a bounded set of recent turns, earlier excerpts, and an optional explicit conversation summary. **Summarize earlier context** creates a model-written summary and records its usage while retaining the full original history. Summaries remain specific to their conversation. Shared personal memory consists only of the editable text the owner explicitly saves and enables in settings; Atlas does not silently extract personal facts.

Research output preserves provider citation URLs, titles and offsets, and renders them as safe links. A completed answer can be saved as a brief with a snapshot of its sources and exported as Markdown. Incomplete, cancelled and uncertain output retain distinct statuses and cannot silently become completed briefs. Repository source references include the selected commit or PR/job revision; attached source text is treated as untrusted input.

The mobile page has a persistent header and composer, a conversation drawer, streamed text, Stop, explicit Retry, code copy and safe Markdown/table rendering. Private content stays in page memory and D1, without browser local storage. Every API response carries an opaque owner marker; the client checks it and sends it back on requests. A mismatching account marker is rejected before a mutation, and delayed old-account responses cannot repopulate the UI. Returning to the tab rechecks the session before revealing private content.

## Repository investigation and coding tasks

Without a saved GitHub token, the original public repository allowlist is available. An optional owner-specific encrypted GitHub token adds permitted private repositories. Reading needs Metadata, Contents, Pull requests and Actions read access as appropriate; publishing a draft needs Contents and Pull requests write access for the selected repository. Tokens are entered in the authenticated settings UI and are never returned by status APIs.

Selecting a repository in a Developer conversation gives Atlas its identity and automatic access to repository context. A request such as `import repo` starts with a pinned overview of the repository structure and introductory/configuration files. Atlas can then list directories, search and read relevant files across that selected repository as needed, without a manual file-selection step. It reads bounded context for each request rather than loading every file into one prompt. The conversation stays scoped to its selected repository, and the response records the files actually read.

**Sources** is optional: attach up to six regular UTF-8 files, pull request changes or workflow job logs to highlight specific material. These attachments do not restrict Atlas to those files. File content is pinned to a commit and verified against its blob SHA. Secret-like paths, traversal, symlinks and binary content are excluded from file reads. Job logs use GitHub's signed download link with no GitHub token or cookies forwarded to the download host. Large/truncated context and incomplete repository discovery are bounded and identified.

**Send** remains the answer and investigation action. **Work on task** starts a coding task directly from a selected repository and a written goal, including in a new conversation. It does not require a previous answer or selected files. The agent receives recent conversation context and a pinned, sanitized repository snapshot in an isolated hosted Linux workspace. It is instructed to read `AGENTS.md`, search the workspace, choose the relevant files, make changes, run focused project commands, inspect failures and fix them when possible. It can create, modify and delete regular files across the repository. A former five-file draft restriction no longer applies to this workflow. Optional **Sources** still highlights material for chat; it is not a coding edit allowlist.

Coding tasks use the owner's saved OpenAI connection and selected model through hosted Agents sessions. Health checks confirm storage and credential readiness without a paid capability probe. The actual task checks project access; a project or key without the necessary Agents read/write, Responses write, or Files read/write permissions receives a specific setup error. Files access is used for the expiring repository archive upload. There is no additional GitHub credential prompt when a suitable connection is already saved. The GitHub and OpenAI credentials remain outside the hosted workspace. The workspace has restricted network access to the package registries and browser download hosts configured in `today/src/atlas-coding.js`; it cannot use the owner's deployment credentials or push directly to GitHub.

The workspace starts from an immutable snapshot of the selected environment's branch (or the repository default), with a new local Git baseline. It includes the retained files at that commit, rather than the repository's commit history, other branches or remote Git credentials. The chosen Linux environment supports command execution and file editing; project checks still depend on the tools and packages available there. Current outbound hosts for the Package downloads policy are npm, PyPI and Playwright download services. Arbitrary web access, deployments and direct remote Git operations are outside this task workflow.

### Progress, stopping and continuation

The Developer composer offers **Code** for work in a cloud workspace and **Ask** for a repository answer. Code uses the selected environment; Ask retains the repository investigation workflow on its default branch. Repository sources are discovered automatically. Task permissions and cost details remain available in **Task options** without occupying the main composer.

The conversation displays coding task cards separately from answer turns, with older tasks collapsed. Each task has **Overview**, **Activity**, **Changes** and **Checks** tabs. These show the saved stage, bounded activity, the agent's summary, changed-file counts and executed command records. Command records use provider command-execution items with explicit exit codes and outcomes. An exit code of zero establishes that the recorded process succeeded; it does not establish that the command was a test or that all repository tests passed. Missing results say that tests are unverified. Command output is expandable, and truncated output and diff previews are labelled.

Task rows persist in D1. Reopening a Developer conversation restores them, then checks active tasks about every five seconds; transient observation failures back off to 30 seconds. Navigation, hiding a tab and closing a browser detach the observer and do not send a cancellation request. Hosted execution continues once its input has been accepted. Repository preparation, dispatch reconciliation and result collection advance in bounded API phases. An uncertain request is reconciled against its saved identifiers instead of automatically submitting another task.

The initial request also advances setup within a bounded Worker background operation. When the existing `ATLAS_VERIFY_KEY` current-administrator verification is configured, the minute cron can reconcile already authorized coding tasks, including finishing setup and collecting results while the browser is closed. This is independent of `ATLAS_AUTONOMY`, which controls recurring scheduled work; it does not authorize new coding tasks. `health.coding.backgroundAvailable` exposes whether this verification is configured. Without it, the UI advises keeping the page open until work starts and reopening it to finish setup or collect results. Hosted execution after input acceptance remains independent of the browser in either case.

**Stop task** is the explicit remote cancellation action. The UI waits for the returned task status and keeps observing if cancellation is still in progress. A cancelled turn is not represented as a completed change bundle. **Continue task** retains workspace edits, creates a new task revision and reserves another task allowance after checking that the provider session is idle and its workspace is connected. A transient connection check is labelled as needing verification instead of permanently removing continuation. Confirmed missing or expired workspaces lose the continuation action; busy and published workspaces cannot be continued.

**Start again** opens a fresh workspace using the original task's frozen environment configuration, even when its saved environment has since been edited or archived. It checks out the latest commit of the original branch and allows a revised prompt. It does not recover uncommitted files from an expired workspace. Prior task summaries remain bounded conversation context, and already saved changes remain available for review. Removing/replacing the OpenAI connection or deleting the owning conversation closes its hosted sessions through the existing owner-scoped API.

### Reviewing and publishing

Open **Tasks** from the sidebar or Workspace menu to browse your coding tasks across conversations, including archived ones. Filter by status, refresh the saved task states, or open the task's conversation to see its activity and available follow-up actions. Ready and published changes can be reviewed directly from the inbox.

After a completed turn, Atlas retrieves the change artifact for that exact turn and revision, validates it against the pinned repository and stores each changed file separately. **Review changes** lists every stored change, including additions and deletions, and fetches each diff when the file is opened. It also shows the recorded commands, exit codes and output. Failed commands remain visible. The review does not turn the agent's proposed validation plan into a claim of completed testing.

**Create draft pull request** remains a separate explicit action using the existing fresh administrator proof. It publishes the reviewed revision to a new branch and draft PR after validating the pinned base and changed file contents. A stale revision cannot be silently published. Retry/reconciliation uses the saved publication identity. Atlas does not merge or deploy the generated changes. Older prepared patch drafts remain accessible in **Draft changes**, with their original validation plans clearly identified as plans.

This implements repository work, command execution, continuation and reviewed publication. It does not claim complete Codex parity: workspace networking, input/output resources, hosted project access, session lifetime and automatic review remain concrete execution limits. A blocked command or review step is reported; it is not counted as successful execution.

### Resource and spending allowances

Each initial task and each continuation reserves **$2** in the shared request ledger and requests a best-effort hosted session spending allowance. Additional or delayed charges may apply; sandbox compute is billed separately. Provider-recorded spend can lag and is not presented as a complete bill or a guarantee covering every charge. The UI states the allowance before starting work. Daily request and estimate controls continue to apply, and uncertainty keeps the reservation instead of claiming a refund.

Resource bounds are independent of that spending allowance. They are defined in `today/src/atlas-workspace.js` and `today/src/atlas-coding-results.js`:

| Resource | Current bound |
| --- | --- |
| Retained repository files | 5,000 regular files |
| Individual repository input | 8 MiB |
| Total retained source | 32 MiB |
| Compressed / inflated repository archive | 40 MiB / 48 MiB |
| Changed files per result | 512 |
| Individual changed file content | 1 MiB |
| Total changed-file content | 16 MiB |
| Combined before/after content | 20 MiB |
| Change artifact | 32 MiB |
| Displayed diff per file | 256 KiB, with truncation indicated |
| Saved tasks per conversation | 50, with one active task at a time |

Secret-like paths, dependency/cache directories, symlinks and submodules are excluded from the input workspace. The manifest records exclusions. Repository bytes are checked against immutable Git blob IDs. If the repository or result exceeds its resource bounds, Atlas reports that limit rather than silently preparing a partial repository or incomplete change bundle. Uploaded input files have a 24-hour expiry and are cleaned up when possible; this expiry is separate from hosted workspace inactivity and saved D1 results.

The private coding API is `/atlas/api/coding/runs`: `POST` starts a task with `{conversationId, requestId, prompt}` plus optional `environmentId`, or `retryFromRunId` to restart a terminal task with its frozen configuration. Retry origins must belong to the same owner, conversation and repository, and require schema 8. `GET ?conversationId=...` returns saved snapshots including public `environment`, `cloud` and `recovery` details. `GET /:id` advances/reconciles one bounded phase. `POST /:id/cancel` stops work, and `POST /:id/continue` accepts a new `{requestId, prompt}`. `GET /:id/changes` lists the review and command evidence; `GET /:id/diff?path=...` retrieves one file diff. Publication requires `POST /:id/publish` with `{confirm:true, revision}`. Every route uses the existing owner marker and account authorization; provider session/environment identifiers are kept server-side.

`GET /atlas/api/coding/inbox` lists up to 25 saved task summaries for the current owner, newest first. Pass `filter=all|active|review|finished` to select a status and the returned `next` value as `before` for the next page. The review screen sends the displayed revision with each diff request. If a continuation changes that revision, refresh the review before publishing.

## Usage and cancellation

The default allowance is20 requests per owner per UTC day, configurable from1 to100. Chat, connection tests, summaries, coding tasks and continuations, existing patch preparation and scheduled runs share the same atomic request ledger and allowance. Reservations include concurrent work, and a repeated request identifier cannot dispatch twice. Known usage reports input/output/cache tokens and dated estimated cost. A configurable daily estimate threshold limits new reservations; it is not a guaranteed provider billing cap. Unknown usage, custom pricing, cache writes and already-dispatched requests can differ from estimates. OpenAI project spending controls remain authoritative.

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

### Coding task smoke checks

Use an authorized administrator, the reviewed deployment and a disposable repository with the existing owner connections. These are operator verification steps; the fixture tests do not perform live provider execution or GitHub publication.

1. Verify `/atlas/api/health` after deployment. General storage remains usable at version 6; coding needs version 7. On a version 6 staging database, confirm **Send** still works and **Enable coding tasks** uses the existing fresh-proof setup action. After applying the migration, verify both readiness fields and the reported background availability. Signed-out access must remain denied.
2. Create a new Developer conversation, select the test repository and start **Work on task** without adding Sources or first sending an investigation. Use a small fixture change across at least six files, including an addition and deletion, with a known focused check. Confirm one accepted task appears and its pinned branch/commit and progress survive reloading.
3. Inspect actual command records, exit codes and output. Include a deliberately failing check in the disposable test to verify the failure remains visible; a completed agent turn must not turn that failed process into “tests passed.” Confirm the result artifact was exported for the completed turn and saved revision, and that the review lists its actual file operations. Missing or invalid artifacts must be reported rather than rendered as completed edits.
4. After execution begins, leave and reopen the page. Confirm reconnecting observes the existing task and sends no cancellation or duplicate input. When `backgroundAvailable` is true, also close during preparation and verify the minute reconciliation finishes setup. When it is false, verify the instruction to keep the page open until work starts and the ability to finish setup after reopening.
5. Select **Stop task** explicitly and check the confirmed state. A reusable idle workspace may offer **Continue task**; submit a follow-up and check that its revision increases and previous edits remain in the workspace. An expired, budget-exhausted or published workspace must ask for a new task instead of silently restarting the old one.
6. Open **Review changes** at a 320-pixel viewport. Verify that each diff loads on demand, additions/deletions and failure output are readable, and any truncation is labelled. Decline publication once to confirm no write occurs. Then, with explicit authorization for this disposable repository, create its draft PR and verify the branch contents match the reviewed revision. A stale revision must be rejected; publishing must not merge or deploy.
7. Switch accounts while an observation request is pending. The previous task, prompt, activity and late response must disappear. Verify the other owner cannot retrieve the task by its identifier. Remove the test connection or delete the test conversation only when its work is no longer needed, and confirm the corresponding hosted session is closed.

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
