# Data protection operations

This is a short operating guide for Vad Massage. It supports the public Privacy Notice and does not replace advice on a specific legal issue.

## Retention review

Review retained client data at least once each year. Do not automate deletion until the review process, backups and legal holds have been approved.

| Record | Working retention rule | Review action |
| --- | --- | --- |
| Account profile, saved addresses and massage preferences | While the account is active; review after 24 months without account or booking activity | Ask whether the account is still needed, then delete or minimise data that is no longer required |
| Booking, cancellation, order and payment-status records | Up to six years where needed for tax, accounting, disputes or legal claims | Retain the minimum transaction record; remove operational notes sooner when they are no longer needed |
| Free-text appointment notes | Review after the appointment and at least annually | Remove details that are no longer needed; do not copy medical information into general notes |
| Closed or expired waitlist requests | Six months after closure or the requested date | Delete unless a current dispute or booking requires the record |
| Invitation and access audit records | Review annually | Keep while needed to secure accounts and explain access decisions; never retain or export raw invitation tokens |
| Provider and security logs | Use the shortest practical provider setting | Do not add a Log Drain containing invitation request paths; restrict log access and investigate access to token-bearing paths |
| Breach and rights-request records | Normally six years after closure | Keep the decision record, response and evidence; minimise copies of affected client data |

Historical guest bookings remain booking records. They are not bulk-linked to Auth accounts and follow the same retention review as other bookings.

## ICO data-protection fee check

Use the current official ICO self-assessment: <https://ico.org.uk/fee-checker>. It takes about ten minutes and decides both whether a fee is due and the tier. Do not record an exemption or fee tier until Vad confirms the answers.

Facts Vad must confirm in the checker include:

- legal form of the business and whether it is a charity or public authority;
- number of staff and annual turnover, which can affect the fee tier;
- every purpose for which client or staff personal information is processed;
- whether any CCTV is used for crime prevention;
- whether personal data is used for direct marketing, profiling, credit referencing or another activity outside core appointment and accounting administration;
- whether any claimed exemption covers all processing, rather than only part of it.

The ICO states that controllers, including sole traders, generally pay unless an exemption applies. The current published fee range is £52 to £3,763, depending on the organisation. The repository does not contain enough confirmed business facts to decide the outcome.

## Personal-data breach runbook

1. **Detect and start a log.** Record when the issue was discovered, what happened, systems involved, reporter and known client data. Start the 72-hour clock at awareness.
2. **Contain.** Stop the disclosure or access, revoke affected links or sessions, rotate exposed credentials, recover misdirected material where possible, and preserve evidence. Do not delete production records needed for the investigation.
3. **Assess.** Identify the people, data types, volume, sensitivity, protections, likely misuse and possible harm. Treat addresses, contact details, account access and any health information with particular care.
4. **Document the decision.** Record facts, timeline, containment, risk assessment, advice taken, decision maker and reasons whether or not the breach is reported.
5. **Notify the ICO where required.** If the breach is likely to risk people's rights and freedoms, report without undue delay and, where feasible, within 72 hours. Submit known facts first and follow up without undue delay if the investigation is incomplete. Use <https://ico.org.uk/pdb>.
6. **Notify affected clients where required.** If the risk is high, tell affected people without undue delay in clear language: what happened, likely effects, steps taken, what they should do and how to contact Vad.
7. **Close and learn.** Confirm remediation, review provider notifications and access logs, record lessons, and assign dated follow-up actions.

The ICO requires a record of every personal-data breach, including incidents that do not meet the notification threshold.

## Invitation URL logs

The invitation token is part of the first request path, so it can reach Vercel before client-side code replaces the URL. Vercel documents that its request logs include the actual request path. Runtime-log retention currently varies by plan: one hour on Hobby, one day on Pro, three days on Enterprise, and up to 30 days with Observability Plus.

Practical controls:

- keep the existing short, one-time, hashed invitation design and 30-day invitation expiry;
- retain `Referrer-Policy: no-referrer`, `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow` on invitation routes;
- give Vercel project/log access only to people who need it;
- do not log invitation URLs in application code, analytics, error reporting or external Log Drains;
- use the shortest suitable Vercel log retention and review whether Observability Plus or any Log Drain is enabled;
- revoke an invitation immediately if its URL may have been disclosed.

Client-side URL cleanup reduces later browser exposure but cannot remove the initial request from upstream hosting logs.
