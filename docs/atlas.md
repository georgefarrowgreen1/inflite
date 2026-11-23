# Atlas deployment

Atlas is served by the existing root Worker at `/atlas` and `/atlas/api/*`. Every request checks the account service's existing admin-only Mail entitlement. It uses the existing InFlite sign-in and `APPS` service binding.

## Credentials and storage

Administrators enter their OpenAI API key and model ID in **OpenAI connection settings** in Atlas. Choose a Responses API model available to the OpenAI project with web search support. Saving or removing a key requires the account service's authoritative fresh-authentication proof at `/api/account/atlas/fresh`; deploy the companion account change before testing this flow. The key and model are scoped to the signed-in owner. Atlas encrypts the key in D1 and never returns it from the provider-status endpoint.

Configure `ATLAS_ENCRYPTION_KEY` as a secret on each target Worker: `inflite-next` for staging and `inflite` for production. It must be the base64 encoding of exactly 32 random bytes. Keep the existing key stable: replacing it makes stored credentials unreadable. Secrets are environment-specific, so a secret added only to production or GitHub does not configure staging. The deployment workflow checks that the staging Worker has the secret and preserves it; it does not generate, copy or rotate it. Never commit secret values.

Interactive Atlas does not require `OPENAI_API_KEY` or `ATLAS_MODEL` in GitHub. The administrator selects both in the interface. The code retains a legacy Worker-level fallback, but the staging workflow does not configure it.

`ATLAS_DB` stores encrypted provider credentials, recent conversations, usage counters, task drafts and evaluation records. Provision and bind the appropriate database with `node tools/atlas-bind.mjs next` or `node tools/atlas-bind.mjs production`, then apply all migrations in `atlas/migrations` to that environment. Staging uses `inflite-atlas-next`; production uses `inflite-atlas-production`. Persist verified database IDs in their matching Wrangler sections to make resource selection explicit and remote migration commands reproducible. The binding helper changes only the selected environment and refuses an existing conflicting ID.

## Automated staging deployment

The GitHub environment `atlas-staging` supplies `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Scope the token to the account with Workers Scripts edit, D1 edit and the necessary route permissions. Verify the environment's actual access controls; naming it in YAML does not establish reviewer protection. The `inflite-next` Worker must already have `ATLAS_ENCRYPTION_KEY` and the existing shared `HUB_KEY`; the account service must allow the staging origin as described in `wrangler.toml`. The workflow checks secret names only. It cannot verify their values or that the encryption key can decrypt existing records.

`.github/workflows/atlas-staging.yml` is manual and restricted to the canonical default branch, `claude/inflite`. It checks out that default-branch commit and cannot deploy `atlas-integration` or another feature branch. GitHub also requires the workflow definition on the default branch before manual dispatch. This preserves the repository's default-branch restriction for jobs with deployment secrets.

The workflow runs the Atlas tests, verifies deployment credentials and existing Worker secret names, binds the staging D1 database, applies migrations, and deploys with `ATLAS_AUTONOMY="0"` from the Wrangler configuration. It then checks anonymous requests to the page and private APIs are denied. It leaves the existing encryption secret unchanged.

## Staging a tested feature commit before merge

The default-only workflow cannot validate an unmerged Atlas release. An authorized release operator with Cloudflare access must use a local checkout of the reviewed `atlas-integration` commit after its CI passes. Do not merge the application merely to make its staging workflow available.

Install the locked dependencies and run `npm run test:atlas`. Use `npx wrangler secret list --env next --format json` to confirm `ATLAS_ENCRYPTION_KEY` and `HUB_KEY` are already configured on `inflite-next`, without reading or replacing their values. Check that the staging Wrangler configuration still has `ATLAS_AUTONOMY="0"`, then run:

```sh
node tools/atlas-bind.mjs next
npx wrangler d1 migrations apply ATLAS_DB --remote --env next
npx wrangler deploy --env next
```

Record the tested commit and deployed Worker version, then complete the authenticated and anonymous checks below. A passing CI run does not establish that this staging deployment or verification occurred.

## Release verification

Run `npm ci --ignore-scripts --no-audit --no-fund`, `npm run test:atlas` and the existing CI suite before deployment. On staging, verify signed-out and standard-user denial, administrator access, fresh-authentication enforcement, credential connect and removal, an actual AI request, owner-scoped history, and existing site routes. The authenticated credential round trip must verify the encryption secret is usable; the anonymous smoke check alone is insufficient. Only release to production after these checks pass, the production database migrations are applied, and the production Worker secret is configured. Existing Workers Builds handles production deployment after merge.

Interactive AI requests are limited to 20 per owner per UTC day. Review OpenAI project spending limits separately; this request cap is not a monetary budget.

## Scheduled work

Task drafts and cancellation are available, but keep `ATLAS_AUTONOMY="0"` for this release. The current scheduler still reads the legacy Worker-level OpenAI key and model rather than the owner's saved UI credentials. Do not enable it until that credential flow is implemented and verified. Enabling scheduled work also requires the companion current-admin verification endpoint and matching `ATLAS_VERIFY_KEY` secrets on both services. Administrator verification must use the `APPS` service binding, as other requests to the account Worker do.
