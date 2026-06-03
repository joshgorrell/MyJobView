# Codebase Guide for AI Assistants

## Overview

This is a full-stack field-service management SaaS built with:
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend/DB:** Supabase (PostgreSQL + RLS + Edge Functions)
- **Icons:** Lucide React
- **Auth:** Supabase email/password auth with `profiles` table

---

## Sales Tax System — Critical Architecture Notes

The sales tax engine is the authoritative source of truth for the **Tax Filing Guide** page that the Billing team reads. Changes here automatically update the guide — no separate documentation maintenance is required.

### Source of Truth: `src/lib/taxCalculations.ts`

All tax rules live here. Key exports:

| Export | Purpose |
|---|---|
| `STATE_TAX_RULES` | Registry of all supported states. Add new states here. |
| `EXEMPTION_CATEGORY_LABELS` | Display labels for exemption types shown in the guide. |
| `STATE_EXEMPTION_FORMS` | State → exemption form number mapping. |
| `getTaxApplicability()` | Determines parts/labor taxability for a given state + environment + project type. |
| `computeTaxTotals()` | Authoritative tax calculator for proposals and change orders. |
| `computeInvoiceTax()` | Tax calculator for invoices with per-item overrides. |

### Adding a New State

1. Add a `StateTaxRule` object to `STATE_TAX_RULES` in `src/lib/taxCalculations.ts`.
2. Add the state's exemption form to `STATE_EXEMPTION_FORMS`.
3. Add the state code to the `SUPPORTED_NEXUS_STATES` checkbox list in `src/components/Admin/TaxRateManagement.tsx`.
4. If the state has a distinct monthly worksheet, add a new report tab in `src/components/Finance/SalesTaxReports.tsx` (follow the KS/MO pattern).
5. Add step-by-step DOR filing instructions to `STATE_DOR_INSTRUCTIONS` in `src/components/Finance/SalesTaxInstructions.tsx`.
6. **The Tax Filing Guide page (`src/components/Finance/SalesTaxInstructions.tsx`) will automatically render the new state's tax matrix, exemption forms, and quick-reference card** — no other changes needed.

### How the Tax Filing Guide Stays Up-to-Date

`src/components/Finance/SalesTaxInstructions.tsx` contains **no hardcoded tax rules or statutory citations**. Every rule it displays is read directly from `STATE_TAX_RULES[stateCode].getApplicability(env, projectType)`. This means:

- Changing a labor exemption rule in `taxCalculations.ts` → the guide updates on next page load.
- Adding a new project type to `TaxProjectType` → add it to `PROJECT_TYPES` in `SalesTaxInstructions.tsx` to include it in the matrix.
- Changing a form number (e.g., `filingFormNumber`, `exemptionFormNumber`) → automatically reflected everywhere.

### Admin Notes

Billing team admins can add per-state notes (exceptions, edge cases, local reminders) via the guide's editable "Admin Notes" section. These are stored in `company_settings.billing_instructions_notes` (jsonb, keyed by state code).

The filing due day default (25th) is stored in `company_settings.tax_filing_due_day` (integer). Admins can change it if a state updates its deadline without a code deploy.

---

## Key File Locations

| Area | Path |
|---|---|
| Tax rules engine | `src/lib/taxCalculations.ts` |
| Tax Filing Guide (Billing team) | `src/components/Finance/SalesTaxInstructions.tsx` |
| Sales Tax Reports (monthly worksheets) | `src/components/Finance/SalesTaxReports.tsx` |
| Tax rate / nexus state admin | `src/components/Admin/TaxRateManagement.tsx` |
| App routing (tab-based) | `src/App.tsx` |
| Auth context | `src/contexts/AuthContext.tsx` |
| Department/module access | `src/contexts/DepartmentContext.tsx` |
| Supabase client | `src/lib/supabase.ts` |

---

## Module Access System

Navigation is **data-driven** via these DB tables:
- `departments` — top-level nav sections (Finance, Sales, Production, etc.)
- `department_modules` — individual pages/tabs within each department
- `role_module_access` — which roles can access which modules
- `user_permission_overrides` — per-user overrides (grant/deny)

Access is checked in `App.tsx` via `checkModuleAccess(moduleKey)` from `DepartmentContext`.

To add a new Finance page:
1. Insert a row into `department_modules` (via migration).
2. Insert rows into `role_module_access` for the appropriate roles.
3. Add a lazy import and `activeTab === 'your_key'` branch in `App.tsx`.

---

## Database Conventions

- Every table has `organization_id` (multi-tenant).
- Every table has RLS enabled. Never skip RLS.
- Use `apply_migration` tool for DDL. Use `execute_sql` for read-only queries.
- Use `maybeSingle()` (not `single()`) when expecting zero or one row.
- Default deny — RLS policies must explicitly grant access.

---

## Code Conventions

- No purple/violet colors. Use blue, gray, green, or amber for accents.
- Icons from `lucide-react` only.
- Tailwind CSS only (no CSS-in-JS).
- Lazy-load all page-level components in App.tsx.
- No emojis in UI or code comments.
