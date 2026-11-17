# Security Module

Security Module is the account-owned security layer and interface introduced in Root 4.11 and Account/Auth 2.33. It is available from You, the app launcher on every native app page, and command search. Native apps also receive `F.workspace.security.open()` for contextual access. Deploy the Account/Auth assets and API together before Root. Account tabs opened before this release need to reload before using the new protected-action protocol. Workspaces remain retired.

## Enforcement and identity

The existing sign-in architecture remains authoritative. `_security-policy.js` checks captured-account preconditions in the shared cookie and Chat session resolver. Those headers never authenticate a caller. Session identity is now read with primary consistency so a stale read replica cannot revive a revoked session. This retains one identity lookup but can increase read latency compared with a nearby replica.

Files, organiser, system and Security Module routes share canonical-origin, owner and private-response helpers in `_security-core.js`. Existing public pages, native binary downloads, authentication callbacks, bearer integrations and provider-specific checks keep their respective contracts. Other app handlers retain their domain checks and inherit the shared session boundary. This is not a claim that every legacy handler has been rewritten around a single middleware.

The canonical Account proxy forwards and validates the captured-owner precondition. Account exports, account deletion and device sign-out use short-lived confirmations bound to the exact account, session, action and target. Account's existing password/passkey reauthentication remains necessary after ten minutes. The dedicated `/account/#open=confirm` entry performs that same verification and returns to Security Module; it does not substitute a cached freshness flag for verification. Proofs are hashed server-side, expire after two minutes and cannot follow a session hand-back. Session revocation through Security Module consumes its confirmation, removes sessions and records the event in one D1 transaction.

## Permissions

The current capability set is deliberately explicit:

- Read supported owned document contents for search.
- Fetch a chosen read-only calendar subscription.
- Prepare a chosen Drive file for Chats, Mail or Fitness.

Existing workflows default to Allowed to preserve previously available behavior. There is no claim that a user has explicitly approved an inherited default. The interface labels it “Default setting”; this is not a saved user approval. Changing it to Ask each time or Blocked saves a versioned account permission. Concurrent edits require review; changing a permission revokes its outstanding approvals.

Temporary approvals bind to the granting session, permission version and selected resource. Calendar approvals identify the supplied subscription link by a hash or the saved calendar ID. File approvals identify the owned file; transfer approval also verifies its current version and ready state. Blocked search/feed access is enforced at the server. Background feed refresh does not prompt: it is skipped when approval is required. Explicit connection actions can open the shared permission sheet.

Files picker and drag/drop readers share the transfer check before reading the chosen file into another app. The recipient/send and import reviews remain in the destination app. Sending or importing is not automatic. These are controls for trusted first-party workflows, not browser isolation: same-origin hostile JavaScript could make other authorized requests. Any future untrusted app requires a separate origin, a sandbox and a narrow authenticated bridge.

## Records, devices and recovery

Security Module reads real passkey, email, recorded password-check and session state. Unknown checks are shown as unrecorded. The session list is bounded to 100 entries and reports when more exist. Signing out all other sessions also covers entries outside that page and preserves the current session. As in Account’s existing sign-out-others flow, a pending email change is cancelled in the same transaction. Remembered continuation devices remain a separate control.

Activity reuses the account's 30-day event history. New events contain registered action kinds and capability names, never search text, subscription URLs, file names, file bytes or message bodies. Ordinary event recording is best effort and never falsely rolls back an acknowledged operation. Expired approvals are inaccessible immediately; bounded housekeeping purges expired ticket rows. Account deletion clears permissions and tickets. The JSON archive includes permission settings but excludes approval tokens and ticket/session hashes.

Chat encryption, encrypted device journals and safe inert file downloads retain their existing boundaries. Notes, calendars, contacts and Drive bytes remain readable by the InFlite service. Revocation cannot recall already downloaded copies. Recovery controls link to actual account/passkey management. Independent backup restoration, device malware scanning, new encryption protocols and unverified automated threat-detection claims are not presented as implemented features.

## Interface and release checks

The interface uses shared Liquid Glass tokens, semantic rounded controls, centered glyphs, visible keyboard focus and 44-pixel interaction targets. Security Module retains its window geometry across tabs. It respects reduced motion, transparency, contrast and forced colors. It fetches private status only when opened and makes no cached security assessment while offline.

The review interface and approval UI are lazy. Native Calendar, Notes and People retain their existing 14 KiB JavaScript and 4 KiB stylesheet first-open budgets. The optional security interface has a separate 9/2 KiB budget. Immutable 4.02 and 4.10 native graphs remain unchanged.

Release evidence is in `/tmp/inflite-security-module/`: D1/R2 authorization and replay tests, primary-versus-stale-replica tests, actual Account exports, Chromium and WebKit flows, phone/tablet/desktop geometry, real Root integration, framework/API regressions, source credential scans, four locked dependency audits and Worker builds. Existing supply-chain gates and backup/recovery guidance remain in place; these tests do not establish production backup coverage or an independent penetration test.

## Interface refinement in Root 4.12

Security Module keeps its tabs and refresh controls fixed above an independently scrolling panel. Tab positions survive navigation. Account checks have a single result, purpose-specific icons and localized dates. Recovery uses grouped settings rows; disclosures have visible affordances. Permission choices explain their effect, identify the current choice and restore focus to the updated connection. Pending refreshes have a skeleton, failed refreshes remove stale assessments, and retries reload authoritative information. Tab motion is cancelled on replacement or close and disabled with reduced motion. Shared glass, contrast and transparency settings remain authoritative. No authentication, approval or revocation contract changed. Native 4.10 asset graphs and existing component budgets remain unchanged.
