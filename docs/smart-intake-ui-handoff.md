# Smart Intake Service Command Center handoff

The existing Service Command Center route was not conclusively located by repository search, so no live screen has been modified.

Integrate a section with two tabs: **Needs Attention** and **All Activity**. The latter uses history-query and history-timeline helpers, scoped by authenticated organization and staff RLS. Search/filter by sender, recipient, subject, channel, status, and date. Show original blank messages and evidence of retries. Only show staff actions after server-side authorization checks.

Do not use the service-role key in the browser. A disabled channel still preserves history. The UI must remain responsive on desktop, tablet and phone. Add loading, empty, and error states. Never represent no matching record as proof an email was not sent.

Blocked until verified: actual Command Center source location, employee role mapping, database RLS policy conventions, provider webhook signature contract, and real tests.
