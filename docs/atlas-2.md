# Atlas 2.0

Atlas 2.0 should give an InFlite administrator one place to delegate work, steer it while it runs, and review the outcome. Its primary record is the run. A conversation supplies context, a project defines the workspace, and a run records what happened.

## What Atlas already has

- Conversations stream answers with sources, attached repository references and explicitly selected InFlite Mail context. Saved briefs and reviewed handoffs turn an answer into something a user can reuse.
- Coding tasks use isolated cloud workspaces and reusable environment recipes. They persist status, checks, reviewable diffs and follow-up revisions. Publishing a draft pull request already requires fresh InFlite identity confirmation.
- Scheduled work has leases, run history, cancellation and usage limits. Automatic execution is controlled by the deployment setting.
- Those paths persist different records and expose different progress and recovery flows. A disconnected user can see a task in its own area, but there is no common timeline, approval queue or checkpoint model.

## Workspace

| Surface | What the administrator can do |
| --- | --- |
| Runs | Start from a goal, pick a project and context, see active and waiting work, and return to the exact run after closing Atlas. Inspect its plan, actions, sources, changes and checks in the same view. |
| Projects | Choose an approved repository, default branch, environment recipe and checks. Keep project instructions and explicit InFlite context references together. |
| Automations | Define a repeat schedule and scope, inspect each occurrence, pause future runs, and surface outcomes that need review in Runs. |
| Settings | Manage connections, allowed capabilities, budgets, retention and audit history. Keep access limited to InFlite administrators. |

Use InFlite’s shared segmented navigation, Liquid Glass surfaces, lists and sheets. On phones, show the run list and detail as navigable views. Keep a single scroll owner per view and fit the composer to the visual viewport. When a run updates, leave the reading position and selected tab intact. Preserve the current runs and links throughout migration.

## Run protocol

1. **Delegate.** Turn a goal, project snapshot, selected references and acceptance criteria into a run. Show the plan and intended capabilities. Let people refine scope before approving sensitive actions.
2. **Execute.** Dispatch to the appropriate runner using a durable run ID, revision and idempotency key. Keep coding in an isolated workspace by default. Record ordered events and checkpoints as tools return evidence.
3. **Steer.** Allow follow-ups, scope changes, pause at a checkpoint and cancellation. Record the acknowledged instruction on the run. Show when a cancellation or provider outcome still needs reconciliation.
4. **Verify.** Collect the actual checks, output, diff and citations. Distinguish checks that passed, failed and could not run. Let the administrator request changes against the same workspace or retry from a known checkpoint.
5. **Review.** Bind approvals to the administrator, exact revision, operation and target. Keep GitHub publication and InFlite drafts behind existing trusted integrations and identity checks. Show the result and any follow-up action in the run timeline.

## Architecture

- Keep the InFlite Worker as the identity and API boundary. Add a durable coordinator for run and revision state, an append-only event sequence, and a queue or alarm to handle progress independently of the browser. Time-bounded leases and idempotency keys let jobs recover after retries or worker restarts. Use an event cursor for streaming and replay, with a bounded status read as the fallback.
- Reuse the existing hosted Agents runner for isolated repository work, the research path for sourced answers, and the scheduler for due occurrences. Adapt each runner to publish the same lifecycle and evidence events. Split work into parallel, independent subtasks only where useful. The coordinator owns the parent budget and result, and verifies each subtask’s output before incorporating it.
- Put tool calls behind an operation-specific capability policy. Read context through owner-scoped connectors and treat retrieved text as data. Scope access to the selected resources and keep credentials outside the workspace. Require explicit, expiring approvals for external writes and budget expansion. Preserve the existing account recheck on publication.
- Store large diffs and logs separately from events, with access and retention bound to the run. Use references in the timeline, paginate history and checks, and load heavier details only when opened. Describe committed actions and verified facts in the timeline.
- Evaluate end-to-end completion and recovery. Use replay after disconnect, cancelled and interrupted jobs, failed checks, stale approvals, changed base branches, denied tool calls and owner switching as acceptance cases.

## Implementation sequence

1. **Started.** Recent runs is an owner-scoped, read-only view over durable answers, coding tasks and scheduled occurrences. It opens existing detail views and avoids counting a scheduled answer twice. It requires no new schema or credentials.
2. **Next.** Add the durable run protocol and replayable timeline, initially mirroring existing executors. Test recovery and cancellation before relying on the new coordinator for any job.
3. **Then.** Ship the mobile and desktop run workspace, project configuration, revision-bound approvals and check evidence. Migrate new runs incrementally behind the existing administrator entitlement and preserve older links.
4. **After verification.** Add scoped InFlite draft handoffs, project automations and parallel subtasks with per-run limits. Release through the existing production Wrangler workflow after local and CI verification.
