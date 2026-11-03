# Purchasing requests, vendor quotes and purchase orders

Users with **Manage Purchasing** (the existing `can_create_purchase_orders` permission), or administrators, can manage requests, quote vendors, create purchase orders and receive shipments. Module access is still required to reach Production / Inventory. No request approval step is required. Technicians retain access to their own product requests.

Select unallocated product request items, including items across several jobs, then choose **Create PO / Request Quotes**. For a direct PO, all selected items must match the selected vendor. For an RFQ, choose several vendors and save one quote request. RFQs do not allocate demand to an order. Email all unsent vendors, record each vendor's prices, shipping, tax, availability and lead time, then save that vendor quote. Selecting the winning vendor creates a draft PO and preserves the RFQ and other vendor quotes.

Each source request item stays on a separate job line. Jones 3, Weller 5 and Wilson 1 remain three lines even when the model is identical. Source IDs and job links are retained through conversion and receipt. Manual catalog orders and quote requests use the existing purchase-order form. Bill / Ship snapshots, vendor instructions and internal notes are retained; only vendor instructions are emailed.

Emailing a PO successfully issues it and marks its linked demand ordered. A failed email leaves its state unchanged. RFQ emails do not issue orders. Draft POs cannot be received. Partial receiving uses job lines, records receipt history and updates inventory atomically. Retries cannot duplicate a conversion or receipt. Over-receiving is rejected. Removing or cancelling a draft releases its request items.

## Deployment

Apply `20261006185842_purchasing_quote_requests.sql` after the existing migrations, deploy `send-purchase-order-email`, then publish the frontend. Configure the organization's verified company sender and the existing email provider secret. This change does not deploy itself or send vendor emails during tests.

## Verification

`npm run test:purchasing` checks database authorization, source allocation, quotes, job-separated conversion, partial receipts, duplicate retries and vendor document privacy. `npm run test:purchasing:browser` checks the actual RFQ form and comparison UI at mobile and desktop widths. Browser tests mock the external service; no vendor emails are sent.
