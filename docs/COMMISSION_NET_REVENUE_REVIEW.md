# Commissionable invoice basis review

For project invoice commission records, the invoice's **subtotal** is the starting point, rather than its tax-inclusive total. A linked, same-organization tax snapshot provides the structured credit-card fee deduction; without one, classified invoice credit-card fee lines provide the deduction. The result is used for both sales and project-manager commission records; existing role-specific rates and payment-based accrual remain unchanged.

The migration intentionally does **not** rewrite existing commission records. Review any records created before deployment separately.

## Acceptance examples

| Invoice subtotal | Sales tax | Structured card fee | Commission basis | 7% commission |
| ---: | ---: | ---: | ---: | ---: |
| $10,000 | $900 | $300 | $9,700 | $679 |
| $10,000 | $900 | $0 | $10,000 | $700 |

## Required follow-up before deployment

- Confirm the tax snapshot fee is included in invoice subtotal, and is not already excluded by invoice accounting.
- Confirm the invoicing flow consistently links the correct snapshot and fee, and that invoice fee lines and snapshot amounts agree when both exist.
- Validate invoices without snapshots, including cases where card fees are added later at payment time.
- Verify partial payment accrual and actual commission payability with realistic fixtures.
- Review legacy invoice commission records before any backfill.

**Safety:** Do not deploy this migration until the snapshot/subtotal assumptions are verified. It is deliberately strict about invalid data, but a missing snapshot with an unmarked fee could still overstate the basis.
