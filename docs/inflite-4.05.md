# InFlite 4.05 — account and data privacy

This release follows a coordinated source review of authentication, private APIs,
Files, browser storage, untrusted content and deployment controls across both
production repositories. Findings were reproduced with disposable local data,
fixed, and checked again. Production verification uses anonymous requests and
public release assets; no private production account or data was inspected.

## Changes

- Email confirmation atomically consumes the exact address and token that were
  checked. Replaced or concurrently consumed links cannot confirm another address.
- Passkey public-key parsing has explicit input, nesting and node budgets.
- Live ride shares recheck permission before reusing cached figures. Blocking,
  unfriending, revoking a share or recalling its letter takes effect on the next
  request.
- Private downloads and profile pictures use `private, no-store`, including Mail
  attachments, byte ranges, originals, account posters and admin avatars.
- Files history and historical downloads respect the same closed-account fence
  as current content. Fitness bounds streamed multipart uploads before parsing.
- Delayed activity, Health, financial-history, message, draft and trusted-key operations check the
  captured account and its lifetime before updating state or starting more work.
- Diagnostics remove JSON parser payload echoes and sensitive credential fields
  before storage or public issue publication. Sensitive exception sinks use fixed
  classifications instead of raw request/provider error objects.
- Production release checks enforce dependency audits, the complete unit suite,
  lock integrity and pinned workflow actions before deployment. Dependency
  installation and tests do not receive deployment secrets. The sign-in monitor
  accepts only explicitly owned origins before using its test credentials.

## Security boundaries

Native apps sharing `inflite.ai` are trusted code within one browser origin.
Routing capabilities are not a sandbox against hostile same-origin JavaScript.
Mail's untrusted HTML remains in its separately isolated sandbox/CSP boundary;
Files previews allow only supported inert content. Private API responses are
excluded from service-worker caches.

Chat encryption, Files storage and browser offline storage have different key
boundaries. Files content and metadata remain readable by the service. The
browser journal's nonextractable key resides in the same browser profile and
does not protect against hostile same-origin code or an unlocked profile. These
changes do not claim ecosystem-wide end-to-end encryption.

New `no-store` responses prevent future HTTP retention. Previously cached
responses remain subject to their former expiration or browser eviction, and
downloaded copies cannot be recalled. No broad cache purge evicts the offline
shell.

The Files recovery runbook in the Apps repository documents matching D1/R2
recovery and deletion reconciliation. Production IAM, independent object
backups, an actual disaster-recovery drill and an independent external
penetration test require separate infrastructure/access evidence. This review
does not represent those activities as completed or guarantee the absence of
unknown vulnerabilities.

## Release validation

Completed 17 November 2026: Apps unit suite 2,140 passed, zero failed, five
existing legacy skips; Root API 58/58, framework 326/326 and request lifecycle
13/13; integrated security browser checks 14/14 and canonical mobile/desktop
sign-in 2/2. The focused Files, account, passkey, sharing, private-storage and
diagnostic regressions are included in the full suite. Routing tests passed
10/10 and Worker bundles passed. Four locked dependency audits reported zero
published advisories at release time. Browser evidence uses local synthetic
data, not production user records or a physical iPhone penetration test.
