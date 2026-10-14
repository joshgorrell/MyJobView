# Dealer-branded Smart Intake channels

Electronic Life launch configuration (pending domain ownership and provider verification):
- Support: support@electroniclife.com — service requests, employee tasks and support inquiries.
- Leads: leads@electroniclife.com — sales inquiries and new project opportunities.

Each dealer controls its own verified addresses and may independently enable support, leads and (later) SMS/MMS. Email-only launch requires no SMS subscription.

The recipient address selects the initial workflow. AI classifies each message within that workflow; cross-channel cases go to review with an explanation rather than silently creating a wrong record. Service and task classifications remain distinct. Neither workflow creates incomplete or duplicate contacts.

Both channels share the immutable investigation timeline and organization-isolated storage. Record the exact destination and resolved purpose with each intake event. Staff can manually reclassify and route with an audit event.

Implementation follow-up: extend intake_destinations with a purpose field and adapt the live webhook to select purpose from verified destination. This document and pure routing helper do not provision the mailboxes or deploy inbound processing.
