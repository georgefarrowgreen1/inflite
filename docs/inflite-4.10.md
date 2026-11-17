# InFlite 4.10 — capture, organise and connect

This release extends existing account-owned services rather than introducing a second task, search or note system. Calendar, Notes and People keep their immutable 4.02 graph for older open tabs and publish the new graph under 4.10. Workspaces remain retired.

## Daily tools and interface

Quick Capture is available from Today's header, the app launcher, search commands, You and the Control/Command–Shift–N shortcut outside editors. Notes and reminder text drafts use the existing encrypted device journal. Saving a capture writes through the same account-lived Notes store that the native app uses, including offline replay, acknowledged writes and conflict recovery. Photo/file capture queues an ordinary private Drive upload. It does not create a public link.

Reminders have daily, weekly, monthly and yearly schedules with a named time zone. Completing a repeating reminder advances the same record atomically to the next future occurrence, retains a completion count and resets notification eligibility. Old retry operations cannot advance it twice. Monthly/yearly dates retain their anniversary across short months and leap years. Repeating reminders do not claim a separate historical entry for every occurrence. Quiet hours and registered-device notification requirements remain in effect.

Private search matches note text, checklist text, event descriptions and contact details, with bounded contextual excerpts. Chat and Mail continue to search through their own trusted providers. Document-content search is an explicit action for text, Markdown, CSV and JSON files no larger than 256 KB. It scans twelve owned, ready, untrashed documents per page and returns short excerpts; it creates no plaintext index. PDF/OCR and arbitrary binary document extraction are not included.

Use in another app can create a linked reminder or note, prepare an unsaved calendar event, or attach an owned file/person/note/event reference. A note can share a clearly labelled excerpt of up to 500 characters using the existing Chat review sheet. Files can attach an encrypted copy of up to 8 MB in Chats: choosing a recipient opens a separate confirmation before sending. The original stays in Drive; a sent copy cannot be recalled by deleting the original. Generic attachments are inert downloads, including when their original type was HTML. Existing Chat identity, trust gates and media encryption are reused; this does not introduce a forward-secret protocol.

Customise Today adds account-scoped controls for calendar, reminders/suggestions, continuation and activity. App card visibility, ordering and density use the existing Edit Today screen and durable layout sync. Additional section changes require a connection and use optimistic versions. Cached acknowledged section choices are available offline; stale devices cannot silently overwrite a newer account preference.

Privacy and data brings real session management, remembered devices, connected calendars, app connectors and account export into one entry point. Signing out a session and forgetting a continuation device remain clearly distinct. Account export includes daily preferences, reminders and imported calendar snapshots; subscription URLs are excluded. File bytes remain separate downloads. Existing account deletion clears the new tables as well as the prior app records.

All new screens use shared Liquid Glass tokens, rounded surfaces, centered glyphs, comfortable fields and restrained transitions. They respect reduced motion, reduced transparency, contrast and forced colors. The 320 px launcher and action-toast layouts are checked explicitly. Heavy calendar work, editors, pickers and Chat attachment review remain lazy. Notes, Calendar and People retain their independent 14 KiB gzip JavaScript and 4 KiB stylesheet first-open limits. Daily tools have a separate 10/3 KiB ceiling; existing core and component budgets remain fixed.

## External calendars

Google Calendar and Outlook HTTPS iCalendar subscriptions are read-only. The server accepts only reviewed provider hosts and calendar paths, sends no InFlite credentials, follows no redirects and bounds the streamed response to 512 KB and six seconds. A preview performs no writes. Up to six calendars can be saved per account. Subscriptions refresh when Calendar opens, at most once every fifteen minutes, and have an explicit Refresh control. Imported .ics files are snapshots and require replacement to update. Provider-side publishing/availability is required; this release does not claim OAuth-based editing or two-way synchronization.

Calendar records carry their source, last sync time and read-only state. An editable copy is an explicit new local event. Disconnecting removes the saved feed and its events from InFlite; the provider's original is unchanged. Today combines the nearest owned and imported events. Calendar files remain text data: alarms, HTML and attachments never execute.

The bounded iCalendar reader handles UTC/named-zone and floating times, all-day exclusive dates, folded text, supported durations, daily/weekly/monthly/yearly repeats, interval/count/until, weekly BYDAY, exclusions, overrides and cancellations. Unsupported advanced rules and expansion limits are reported in the preview rather than treated as fully supported. This is not an assertion that every provider-specific iCalendar extension is supported.

## Verification

Evidence is recorded under `/tmp/inflite-life410/`. Checks cover the actual Root framework, real private D1/R2 account services, encrypted browser storage, Chromium and WebKit flows, narrow/tablet/desktop geometry in light and dark, existing auth/privacy regressions, Chat encryption/trust and independent loading budgets. Production accounts are not used for local test data.
