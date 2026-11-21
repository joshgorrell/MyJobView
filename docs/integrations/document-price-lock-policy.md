# Document selling-price immutability — mandatory integration contract

**Rule:** As soon as a product is inserted into a draft proposal, sales order, or invoice, its document-line selling price is a snapshot. Neither catalog refreshes nor vendor API updates nor document conversion nor background synchronization may change that price. The rule applies before a document is sent. Only an explicit, authorized, user-initiated edit of that specific line may change it.

## Separate values

- Catalog products: dealer cost and catalog selling price may be updated under the catalog's selected pricing mode.
- Document lines: selling price (unit and extended price) must be copied at line creation and must never be re-read from catalog products during refresh, autosave, reopen, recalculation, or conversion.
- Document line cost: may be refreshed to the verified, current dealer cost for accurate profitability, subject to authorization and tenant isolation. Updating cost must not trigger a recalculation of document selling price.
- Quantity, discounts, and tax: follow the document's existing user-driven editing rules; do not treat cost refresh as a user price edit.
- Derived proposal, order, or invoice: copy source document's unit selling price, discounts, and line-level price overrides. Do not substitute the current product catalog price.

## Enforcement requirements

1. Keep catalog product writes separate from document line writes. Vendor sync may update `products.cost` and catalog `products.our_price`, but **never** bulk update existing document-line selling prices.
2. On product insertion, persist unit selling price immediately in the document draft model and server persistence, including unsent drafts. Do not derive it from `products.our_price` on later renders.
3. During any vendor cost refresh, update document-line cost only; recalculate gross margin/profitability, not customer totals. Recheck tenant-scoped authorization and product identity.
4. Proposal → sales order → invoice conversion must preserve price snapshots; add regression tests for each route, including unsent drafts and in-progress autosave.
5. User-driven repricing must be an explicit action with a separate audit trail (actor, timestamp, previous price, new price). Never disguise vendor sync as user-driven repricing.
6. Existing documents and drafts must be audited for joins or effects that rehydrate selling price from the current catalog; repair those paths before enabling any vendor API scheduler.
7. Never treat a stale quote as verified cost; show freshness/verification separately.

## Acceptance scenarios

- Rep inserts item at $200 into a draft proposal; vendor MSRP updates to $230 during editing. Draft remains $200.
- Rep inserts item at $200 into a draft invoice; dealer cost changes $80 → $100. Customer price remains $200; profit changes $120 → $100.
- Proposal with $200 line converts to order after catalog changes to $250. Order remains $200; invoice created from order remains $200.
- Dealer selects margin pricing in product catalog. Vendor cost update changes **future catalog selling price only**, never a line already on a draft or completed document.
- Reopen, autosave, background sync, tax recalculation, and customer preview cannot reprice any existing line.
- A deliberate authorized manual price edit may change one line; it is recorded and cannot be overwritten by the next sync.

**Release gate:** Vendor API sync must remain disabled for document repricing until automated regression tests prove all these paths are safe. This document defines the required invariant; it is not a claim that all existing document code already complies.
