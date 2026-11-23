# Atlas deployment

Atlas is served by the existing root Worker at `/atlas` and `/atlas/api/chat`. Every request checks the account service's existing admin-only Mail entitlement. No separate login or Worker route is needed.

Before deployment, run `npm ci` and `npm run test:atlas`, then the existing CI suite. Configure `OPENAI_API_KEY` using `npx wrangler secret put OPENAI_API_KEY --env next` for staging and `npx wrangler secret put OPENAI_API_KEY --env=""` for production. Configure `ATLAS_MODEL` as a Worker secret in each environment using the same command with that name, selecting a Responses API model available to the project with web search support. Never commit credentials. Deploy staging using `npx wrangler deploy --env next` and test signed-out, standard and administrator sessions, including direct API calls and existing site routes. Merge only after checks pass; existing Workers Builds handles production deployment.

This first increment is stateless and interactive only. Persistent memory, native launcher integration, external tools, budgets/rate limits and autonomous tasks are not implemented. Do not enable unattended actions. Verify API project spending limits before production use.
