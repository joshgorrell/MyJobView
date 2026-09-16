/*
# Phase 2: Add TaxJar Result Columns to tax_snapshots

## Purpose
Add three new columns to the `tax_snapshots` table to store TaxJar's
authoritative transaction calculation results from the `/v2/taxes` endpoint.

## New Columns

1. `tax_source` (text, nullable)
   - Stores TaxJar's sourcing decision: "origin" or "destination"
   - Indicates whether TaxJar calculated the tax based on the origin
     address (origin-sourced state) or the destination address
     (destination-sourced state)
   - Informational only; MJV remains authoritative for collection decisions

2. `jurisdiction_breakdown` (jsonb, nullable)
   - Stores the full TaxJar `breakdown` object from the `/v2/taxes` response
   - Contains jurisdiction-level rate details: state, county, city, and
     special district rates and amounts, for both the overall order and
     individual line items (if any were sent)
   - Preserved for audit, reporting, and dispute resolution

3. `freight_taxable` (boolean, nullable)
   - Stores TaxJar's determination of whether freight/shipping is taxable
     in the destination jurisdiction
   - Informational only; MJV's `resolve_tax_rule` for the `freight_delivery`
     classification remains authoritative for freight taxability decisions
   - TaxJar is called with `shipping: 0` so it does not independently
     decide freight taxability for our calculations

## What Does NOT Change
- No existing columns are modified or removed
- No RLS changes
- No new tables
- All existing snapshot functionality continues unchanged
- The existing `taxjar_verified_at` column will be populated when TaxJar
  successfully calculates the transaction
*/

ALTER TABLE tax_snapshots
  ADD COLUMN IF NOT EXISTS tax_source text,
  ADD COLUMN IF NOT EXISTS jurisdiction_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS freight_taxable boolean;