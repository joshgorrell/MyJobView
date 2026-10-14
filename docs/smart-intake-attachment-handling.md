# Smart Intake attachment handling

Every inbound attachment starts as **pending** in private temporary storage. It must be validated and scanned before employees can preview, download, save, or link it.

The existing Service Request Queue should let employees decide to discard, save to customer media, link to selected work orders, or both. Multiple work orders must reference one durable media object, not copy its bytes. Removing a work-order link must not delete customer media still referenced elsewhere.

Default temporary retention is 30 days; warn seven days before expiry. Dealer administrators should be able to configure the retention window. The cleanup worker must remove discarded or expired temporary objects, preserve audit metadata, and never delete saved media or an object referenced by an active work order.

## Release gates

- [ ] Secure private bucket, bounded download, file type and size validation
- [ ] Malware scan before access, fail closed on scan errors
- [ ] Tenant-scoped employee review and disposition actions
- [ ] Customer media promotion and work order reference integration
- [ ] Scheduled cleanup and retryable failures, with expiry warning
- [ ] Mobile and desktop review controls on existing pages
- [ ] Cross-tenant, duplicate, scan, storage failure and expiration tests

Do not enable production forwarding until these gates pass.
