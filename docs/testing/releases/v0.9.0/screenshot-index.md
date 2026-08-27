# ERP v0.9.0 screenshot index

Status: **107 current screenshots reviewed; release matrix still incomplete**
Review time: 2026-08-28 01:44 CST (Asia/Shanghai)

All files use synthetic E2E identities. Invitation and reset links are redacted
before capture. The primary reviewer opened every image through the labelled
contact sheets `traces/review-contact-sheets/all-review-01.jpg` through
`all-review-12.jpg` and observed no Runtime Error overlay, blank failed route,
real password, token or private address.

| File group | Scenario / actor / route | Expected and observed result | DB / test assertion | Reviewed |
|---|---|---|---|---|
| `01-01-*` … `01-11-*` | 1; owner and invited member; team/invite/reset/login/workbench | invite-only registration, locked email, one-time reset, old-session rejection, revoked and expired invite denial | `internal-account-onboarding.spec.ts` | yes (11/11) |
| `05-01-*` … `05-09-*` | 5; requesting and target organizations; connections/notifications | exact-code request, counterparty accept, immutable end/reject/reconnect history and both-side notifications | `organization-connection-flow.spec.ts` | yes (9/9) |
| `06-01-*` … `06-11-*` | 6; client and provider organizations; business structure/notifications | proposal, no self-confirm, counterparty activation, pause/resume, v2 revision, v1 preserved, end | `service-agreement-lifecycle.spec.ts` plus v1/v2 DB reads | yes (11/11) |
| `01-purchase-*` … `15-consolidation-*` | 12; synthetic owner/store; procurement/inventory/listing/sales/logistics/reports | CNY purchase, receipt, listing, sale, shipment, profit and consolidation status flow | `full-flow-evidence.spec.ts` | yes (15/15) |
| `16-task-*` … `19-assignee-*` | 9 partial; assigner and assignee; workbench/notifications | unassigned task, assignment and assignee receipt | `full-flow-evidence.spec.ts` | yes (4/4) |
| `18-desktop-*` | 18; synthetic owner; all production desktop navigation routes | 46 routes render under production build without runtime overlay | `release-route-screenshots.spec.ts` | yes (46/46) |
| `18-mobile-*` | 18 and 16 partial; synthetic owner; key `/m` routes | 11 mobile routes render at phone viewport without runtime overlay | `release-route-screenshots.spec.ts` | yes (11/11) |

Total: **107/107 files visually reviewed**.

This index intentionally does not mark the absent evidence as passed. Scenarios
2–4, 7–8, 10–11 and 13–14 are missing their current multi-actor UI sequence;
scenarios 9 and 15–17 are only partially evidenced. See `acceptance-report.md`
for the production hold decision.
