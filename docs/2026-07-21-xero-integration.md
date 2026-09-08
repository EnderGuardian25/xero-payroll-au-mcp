# Research: Xero Integration Options — as of 2026-07-21

Produced by a research agent on 2026-07-21 for the Payday Super Reconciler Phase 2 design.

## 1. Official Xero MCP server — NOT suitable

- `github.com/XeroAPI/xero-mcp-server`: official, maintained (v0.0.16+, Jun 2026), ~50 tools —
  but payroll tools cover **employees, leave, timesheets only, NZ/UK regions**. Verified via
  the `src/tools/` tree: **no pay run, payslip, superannuation, super fund, or STP tools.**
- Auth: local stdio; Custom Connections (one org per connection) or bring-your-own bearer
  token. No official remote/hosted MCP endpoint.
- Conclusion: build a custom connector for Payroll AU (adopted in the design).

## 2. Payroll AU API (base `https://api.xero.com/payroll.xro/1.0`, OpenAPI spec v16.1.0)

| Need | Endpoint | Scope | Key fields |
|---|---|---|---|
| Completed pay runs | `GET /PayRuns`, `/PayRuns/{id}` | `payroll.payruns.read` | `PayRunStatus` (DRAFT/POSTED), `PaymentDate`, period dates, totals incl. `Super`, `UpdatedDateUTC`; detail incl. `Payslips[]` with per-employee `Super` |
| Per-employee SG lines | `GET /Payslip/{PayslipID}` | `payroll.payslip.read` | `SuperannuationLines[]`: `SuperMembershipID`, `ContributionType` (**SGC**/SALARYSACRIFICE/…), `CalculationType`, `Amount`, expense/liability account codes |
| Employee super memberships | `GET /Employees/{id}` | `payroll.employees.read` | `SuperMemberships[]` (fund + member number) |
| Fund details | `GET /Superfunds`, `/SuperfundProducts` | `payroll.settings.read` | REGULATED/SMSF, ABN, USI |
| Org settings | `GET /Settings`, `/PayItems`, `/PayrollCalendars` | `payroll.settings.read` | Super expense/liability account codes |

All list endpoints support `If-Modified-Since`, `where`, `order`, `page` (100/page) —
ideal for incremental polling.

**Hard gap #1 — STP filing status is NOT exposed via API.** No STP submission endpoints or
timestamps exist. Nearest proxy: pay run POSTED status + `UpdatedDateUTC`.

**Payday Super API changes:** `IsQualifyingEarnings` added to Earnings Rates/Pay Items/Leave
Types; `IncludeLeaveLoadingInQualifyingEarnings` on employee Tax Declaration; validation
enforced from 1 Sep 2026.

## 3. Super payment / Beam data — NOT available via API (hard gap #2)

Xero Auto Super batch statuses (Filed → Sent → Completed via Beam) are **UI-only**; open
uservoice request since Aug 2023 unanswered. Workaround: watch the Superannuation Payable
liability account via Accounting API — `GET /api.xro/2.0/BankTransactions`
(`accounting.transactions.read`) and `GET /api.xro/2.0/Journals` (`accounting.journals.read`).
Gives payment date/amount but NOT fund-level receipt confirmation.

## 4. OAuth 2.0 multi-tenant

- Standard authorization-code flow; `offline_access` + read scopes; `GET /connections` lists
  authorized tenants; `xero-tenant-id` header on every call.
- Access tokens 30 min; refresh tokens expire after 60 days unused and **rotate on every
  refresh** (~30 min grace). Store newest atomically per connection; serialize refreshes with
  a per-tenant lock; lost rotation = `invalid_grant` = full re-consent.
- Custom connections: one org per connection, paid add-on — wrong shape for multi-client.
- **Uncertified app cap: 25 tenant connections**; beyond that requires Xero App Partner
  certification (months). Plan early.

## 5. Webhooks — none for payroll

Xero webhooks cover accounting resources only. Pattern: incremental polling with
`If-Modified-Since` on PayRuns.

## 6. Rate limits

60 calls/min/tenant, 5,000/day/tenant, 5 concurrent/tenant, 10,000/min app-wide.
429s include `Retry-After`. Daily per-tenant polling budget is tiny; stagger tenants.

## Sources

- https://github.com/XeroAPI/xero-mcp-server
- https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-payroll-au.yaml (ground truth; doc site was intermittently down)
- https://developer.xero.com/documentation/api/payrollau/overview
- https://www.xero.com/au/initiative/payday-super/
- https://xero.uservoice.com/forums/250567-payroll-api/suggestions/47053921-au-payroll-report-api
- https://developer.xero.com/documentation/guides/oauth2/auth-flow/ · /token-types · /custom-connections
- https://developer.xero.com/documentation/best-practices/api-call-efficiencies/rate-limits
- https://developer.xero.com/documentation/guides/webhooks/overview/
