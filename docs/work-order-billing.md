# Service work-order closeout

Every work order in a linked visit shows the visit's combined parts and job clocks. Catalog parts entered ahead of time and parts entered by technicians share this list. Staff can correct quantities and add catalog items. Creating an invoice from one work order expands to the complete linked group, validates one customer, and links every work order to the same invoice.

Actual hours remain unchanged. Billable hours default to the next quarter hour and may be set to actual or edited. Parts import their selling prices, not costs. Technician and part notes remain internal by default. Reopening a draft preserves edited lines and adds newly recorded source parts; **Refresh Parts from Work Orders** intentionally replaces the imported part lines with the current list.

**Save Open Draft** keeps the invoice private indefinitely, including while other linked work is unfinished. **Submit Invoice** requires completed, billable linked work orders and closed job clocks. Submission locks accounting fields and lines, queues portal notification when enabled, and marks the visit billed. An authorized billing user can **Unlock for Changes** on an unpaid submitted invoice, recording a reason. Unlock hides the draft, preserves its work-order links, and requires resubmission. Paid/part-paid and monitoring invoices cannot be unlocked. Previously emailed copies and external QuickBooks payment links cannot be recalled by hiding a local draft.

All invoice creation paths start as private drafts, including deposits and recurring invoices. Creation never publishes an invoice by itself. Existing monitoring automation explicitly calls the submission RPC after creating its draft; ordinary staff-created invoices wait for the user to submit. The work-order review form saves a draft when submitted with Enter; only the explicit **Submit Invoice** button publishes.

**Customer-visible** defaults on and can be turned off before submission, including on saved drafts. Internal invoices submit and lock normally and can receive payment or credit records after submission, but have no portal visibility or automatic customer notification. Manual customer email is disabled until the invoice is made customer-visible.

## Deployment

Apply the five migrations in order, deploy `invoice-portal-delivery`, `quickbooks-sync-invoices`, and `send-invoice-email`, and `security-qbo-billing-setup`, then deploy the frontend. The worker's JWT gateway check is disabled because it validates the dedicated Vault credential using the existing service-only `security_billing_worker_authorized` RPC. It does not accept user tokens.

The minute scheduler reuses `security_billing_project_url` and `security_billing_worker_secret` provisioned by the existing security billing deployment. Verify both Vault secrets exist and that the project URL is this deployment's Supabase URL. Verify `invoice-portal-delivery-every-minute` is active. Configure the verified email sender and `RESEND_API_KEY`, the customer portal URL, and enable portal invoices in dealer settings.

For service invoice online payments, connect QuickBooks with Payments enabled and map the customer to QuickBooks, and select the labor/parts income reference items in QuickBooks settings. The worker synchronizes the invoice and retrieves the actual `InvoiceLink`; guessed payment URLs are no longer used. Invoice access is available in the limited customer portal without a VIP subscription. QuickBooks totals must match the submitted invoice. A tax configuration mismatch or missing customer/payment mapping blocks delivery and appears on the staff invoice screen; the worker retries. Check the first submission against the dealer's QuickBooks tax configuration before production rollout. Monitoring invoices retain their dedicated recurring billing delivery workflow.

## Validation

- `npm run test:work-order-billing`: database transaction, linked scope, actual versus billable time, parts selling prices, duplicate/retry guards, private drafts, locks, unlock and revised notification; worker authentication and delivery retries.
- `npm run test:work-order-billing:browser`: real component at 390px and desktop, labor adjustment, repeated catalog products from several techs, default portal setting and submitted payload.
- Existing service-request and work-order regression suites.

Live provider delivery, dealer-specific QuickBooks tax/item setup, and webhook payment reconciliation require a configured test dealer; local provider mocks cannot certify those external services.
