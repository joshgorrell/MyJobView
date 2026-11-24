# Responsive audit — #1256

Inventory derived from src/lib/workspaceRoutes.ts. Pending means not verified, not a pass. Aliases may share implementations but must be checked. Add settings subsections, public/portal routes and detail/dialog states as discovered from App.tsx before closing the audit.

Widths: 320, 375, 390, 430, 768, 1024, 1440. Check body and workspace overflow, accessible controls, sticky header, local table scroll, themes, loading/empty/error states, permissions and desktop behavior.

| Workspace route key | Status |
|---|---|
| assist | Pending |
| bonus_approvals | Pending |
| bug_management | Pending |
| calendar | Layout merged #1261; verification pending |
| change_orders | Pending |
| commission_management | Pending |
| company_directory | Pending |
| commissions | Pending |
| contact_import | Pending |
| contacts | Layout merged #1259; verification pending |
| contract_import | Pending |
| contract_management | Pending |
| customer_comms | Pending |
| daily_clock | Pending |
| daily_clock_sessions | Pending |
| daily_sales_report_import | Pending |
| design_queue | Pending |
| dispatch_dashboard | Pending |
| equipment_warranty | Pending |
| feature_suggestions | Pending |
| feed | Pending |
| finance_dashboard | Pending |
| fishbowl | Pending |
| gps_diagnostics | Pending |
| help | Pending |
| historical_sales_import | Pending |
| improvements | Pending |
| individual_dashboard | Pending |
| inventory | Pending |
| invoices | Layout merged #1260; modal #1264 open |
| job_acceptance | Pending |
| job_photos | Pending |
| job_status | Pending |
| leads | Detail #1262 open; verification pending |
| maintenance_agreements | Pending |
| materials | Pending |
| my_mileage | Pending |
| my_time_off | Pending |
| mycard | Pending |
| parts_requests | Pending |
| payroll | Pending |
| pipeline_board | Pending |
| points_rewards | Pending |
| portal_punchlist | Pending |
| preferences | Pending |
| production_dashboard | Pending |
| production_manager | Pending |
| products | Pending |
| products_catalog | Layout merged #1257; catalog browser review passed on that PR; full audit pending |
| project_work_orders | Layout merged #1261; verification pending |
| projects | Detail #1263 open; verification pending |
| proposals | Layout merged #1259; builder #1263 open |
| pto_management | Pending |
| punchlist | Pending |
| purchase_orders | Pending |
| recur | Pending |
| report_templates | Pending |
| reviews | Pending |
| rewards_dashboard | Pending |
| sales | Shared proposals layout #1259; verification pending |
| sales_dashboard | Pending |
| sales_orders | List merged #1259; detail #1262 open |
| sales_performance | Pending |
| sales_service_requests | Pending |
| security_onboarding | Pending |
| service_billing | Pending |
| service_request_analytics | Pending |
| service_requests | Pending |
| settings | Layout merged #1260; integration dialogs #1264 open |
| sticky-notes | Pending |
| tasks | Pending |
| tax_filing_guide | Pending |
| tax_reports | Pending |
| team_leaderboard | Pending |
| tech_center | Pending |
| tech_map | Pending |
| tech_skills | Pending |
| tech_stats | Pending |
| tech_status | Pending |
| test_tune | Pending |
| time | Pending |
| time_approval | Pending |
| time_clock_management | Pending |
| labor_dashboard | Layout #1263 open; verification pending |
| travel_bonus | Layout merged #1261; verification pending |
| travel_bonus_settings | Shared travel bonus layout #1261; verification pending |
| vehicle-tracking | Pending |
| vip-plans | Pending |
| work_orders | List merged #1260; detail #1262 open |

## Admin settings subsections

Derived from Settings.tsx adminItems. All require separate verification, including permissions and deep links.

| Section | Status |
|---|---|
| company | Pending |
| cards | Pending |
| portal | Pending |
| billing | Pending |
| automation | Pending |
| users | Pending |
| sessions | Pending |
| roles | Pending |
| permissions | Pending |
| departments | Pending |
| rewards | Pending |
| kiosk | Pending |
| proposals | Pending |
| salestax | Pending |
| salestargets | Pending |
| contracts | Pending |
| work_orders | Pending |
| labor | Pending |
| timeclock | Pending |
| travel | Pending |
| priorities | Pending |
| emails | Pending |
| email_config | Pending |
| messages | Pending |
| integrations | Pending |
| products | Pending |
| catalog | Pending |
| contact_import | Pending |
| orphaned | Pending |

## Public, portal and standalone routes

Derived from App.tsx path branches; grouped aliases still require individual checks.

| Path or route family | Status |
|---|---|
| / | Pending |
| /assist (guest) | Pending |
| /shared/proposal | Pending |
| /portal/proposals and /portal/proposals/* | Pending |
| /proposals/* | Pending |
| /proposal-check-response | Pending |
| /lost-opportunity-review | Pending |
| /portal/security, /security-onboarding, /onboarding | Pending |
| /portal/service-approval | Pending |
| /portal/dashboard | Pending |
| /auth-bridge | Pending |
| /auth-callback | Pending |
| /login, /portal | Pending |
| /dealer-login | Pending |
| /punchlist, /portal/punchlist | Pending |
| /vip-membership, /portal/vip-membership | Pending |
| /contact, /portal/contact | Pending |
| /membership, /portal/membership | Pending |
| /signup, /portal/signup | Pending |
| /portal/vip-benefits | Pending |
| /calendar | Pending |
| /feedback | Pending |
| /eula | Pending |
| /privacy-policy | Pending |
| /kiosk | Pending |
| /tv-dashboard | Pending |
| /sales-tv-dashboard | Pending |
| /sales-order-fullscreen | Pending |
| /proposals-fullscreen | Pending |
| /project-punchlist (legacy workspace alias) | Pending |

## Verification evidence

Existing browser suites include tests/catalog/browser.mjs, tests/navigation/responsive-browser.mjs, tests/navigation/integrations-responsive-browser.mjs and tests/modals/responsive-browser.mjs. PR #1265 expands viewport coverage. A test existing is not proof of a passing current build. Record run links and tested states before changing any route to verified. Detail and dialog inventory remains incomplete.
