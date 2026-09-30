-- Separate inactive revision for future Electronic Life monitoring agreements.
-- Existing templates and executed agreements are never rewritten by this migration.
INSERT INTO public.security_contract_templates(
 name,description,is_active,requires_approval,approval_role,auto_create_subscription,default_billing_plan_id,contract_terms,organization_id)
SELECT
 'ELECTRONIC LIFE MONITORING AGREEMENT — DRAFT LEGAL REVIEW',
 'Future-agreement draft: 36 months then month-to-month. Resolve all LEGAL REVIEW placeholders and obtain approval before use. Existing liability and insurance provisions require counsel review.',
 false,true,'admin',false,NULL,
 regexp_replace(
 regexp_replace(
 regexp_replace(
 regexp_replace(t.contract_terms,
 '1\. Term & Renewal[\s\S]*?2\. Billing, Early Cancellation & Service Suspension',
 $terms$1. Term & Renewal

The initial monitoring term is 36 months beginning on the date Electronic Life separately confirms monitoring activation. Signing alone does not activate monitoring. After the initial term, monitoring continues automatically from month to month until cancelled. There is no annual-renewal or month-to-month-renewal surcharge. The $7 monthly mailed-invoice fee described in the billing summary is a separate Admin-approved billing exception.

Subscriber may give cancellation notice at any time through the customer portal or the provider contact information in this agreement. After the initial term, cancellation is effective 30 days after receipt of notice, unless applicable law requires an earlier date. Before the initial term ends, cancellation is subject only to the approved early-termination provision and nonwaivable statutory cancellation rights. No new multi-year term is created by renewal.

Monitoring services are supplied by CMS Monitoring. Electronic Life administers the customer account and billing. The parties' operational responsibilities, alarm verification and dispatch procedures, service scope, and limitations must be stated consistently in the approved agreement and any incorporated central-station agreement. [LEGAL REVIEW: confirm legal dealer identity, station relationship, dispatch protocols, and incorporated documents.]

2. Billing, Early Cancellation & Service Suspension$terms$),
 '2\. Billing, Early Cancellation & Service Suspension[\s\S]*?3\. Automatic Payments',
 $terms$2. Billing, Early Cancellation & Service Suspension

Charges and selected services are shown in the completed agreement. Billing begins at monitoring activation. Applicable taxes are detailed on each invoice. Monthly or annual billing follows the accepted billing preference. Annual discounts do not reduce mailed-invoice fees.

During the initial term, any early-termination charge must follow one approved formula; acceleration and a second liquidated-damages charge cannot both be collected for the same loss. [LEGAL REVIEW: select and approve the initial-term early-termination formula; no formula is approved in this draft.]

Statutory cancellation, refund, warranty, and other nonwaivable consumer rights prevail. A cancellation permitted by an applicable cooling-off law does not incur an early-termination charge. Transaction-specific cancellation notices and completed cancellation forms must be supplied where required.

Suspension, reconnection charges, and service-call charges require the notices and conditions stated in the approved service schedule. [LEGAL REVIEW: approve service suspension safeguards, reconnection charges, and separation from warranty coverage.]

3. Automatic Payments$terms$),
 '3\. Automatic Payments[\s\S]*?4\. Rate Adjustments \(NEW\)',
 $terms$3. Automatic Payments

A usable payment method and separately signed recurring-payment authorization are required for monitoring unless Admin has approved mailed invoices. Customers cannot select the mailed-invoice exception. Admin-approved mailed invoices add $7 per month, including $84 for an annual billing period; the accepted billing summary shows the fee and total.

MyJobView initiates automatic charges or ACH debits through QuickBooks Payments using the selected verified method. Each automatic debit follows the amount and date notice sent at least 10 days before that debit. A pending bank payment is not treated as settled. The separate payment authorization and signed agreement are available to print or download.

Subscriber may revoke future automatic-payment authorization through the portal or by contacting Electronic Life. Revocation does not itself cancel monitoring or amounts owed and does not authorize mailed billing. A debit already submitted requires provider follow-up. Subscriber retains applicable rights to stop a transfer through their financial institution.

4. Rate Adjustments (NEW)$terms$),
 '16\. Legal Action & Liquidated Damages[\s\S]*?17\. Insurance Requirements',
 $terms$16. Default and Remedies

The approved early-termination provision in section 2 is the sole contractual formula for initial-term cancellation; no additional acceleration or liquidated-damages percentage applies for the same loss. Remedies, collection costs, and attorney fees are available only as permitted by applicable law and the approved agreement. Nothing waives nonwaivable consumer rights, statutory remedies, or statutory filing periods. [LEGAL REVIEW: approve default notices, available remedies, and any equipment or remote-access action.]

17. Insurance Requirements$terms$),
 t.organization_id
FROM public.security_contract_templates t
WHERE t.id='1546a013-6a30-4aed-b58a-70dd74a6ec25'
 AND t.organization_id='b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
 AND NOT EXISTS(SELECT 1 FROM public.security_contract_templates d WHERE d.organization_id=t.organization_id AND d.name='ELECTRONIC LIFE MONITORING AGREEMENT — DRAFT LEGAL REVIEW');

-- These clauses remain a draft and cannot be activated while review markers exist.
UPDATE public.security_contract_templates SET contract_terms=regexp_replace(
 regexp_replace(contract_terms,
 '20\. Electronic Communication Consent \(NEW\)[\s\S]*?21\. Entire Agreement & Severability',
 $terms$20. Electronic Records and Signatures

Electronic signing is optional. Before signing electronically, Subscriber must be able to open, read, print or save the agreement and payment authorization. Access requires an internet connection, an email address, a current JavaScript-enabled browser, and storage or a printer for retaining copies; saved PDFs require a PDF viewer.

With separate affirmative consent, electronic records may be used for this agreement, payment authorization, invoices, debit notices, renewal notices, and other contract communications. Subscriber may request paper copies, update the delivery email address, or withdraw electronic-delivery consent by contacting Electronic Life through the contact information in this agreement. Withdrawal applies prospectively and does not invalidate existing signed records or cancel monitoring. A paper signature or requested paper agreement copy does not itself enroll the account in mailed-invoice billing. Only Admin can approve that separate $7/month billing exception. [LEGAL REVIEW: approve paper-copy fees, withdrawal procedures and consequences, required notices, and evidence that the customer can retain each delivery format.]

Required transaction-specific cancellation notices and forms must still meet applicable presentation, timing, and delivery requirements. General electronic consent is not a substitute for those forms.

21. Entire Agreement & Severability$terms$),
 '22\. Governing Law[\s\S]*$',
 $terms$22. Governing Law

Kansas law governs to the extent permitted by applicable law. Nothing removes mandatory protections applicable to a transaction in another state. Governing law and venue are separate questions. [LEGAL REVIEW: approve venue, consumer protections, dealer legal identity and service jurisdictions.]
$terms$)
WHERE organization_id='b324e4e3-cd2e-4c68-8df8-3e27c7e08f15' AND name='ELECTRONIC LIFE MONITORING AGREEMENT — DRAFT LEGAL REVIEW' AND NOT is_active;

CREATE FUNCTION private.security_template_draft_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.is_active AND (NEW.name LIKE '%DRAFT LEGAL REVIEW%' OR NEW.contract_terms LIKE '%[LEGAL REVIEW:%') THEN
   RAISE EXCEPTION 'Resolve the legal-review draft and obtain approval before activating this template';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.security_template_draft_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER security_template_draft_guard BEFORE INSERT OR UPDATE ON public.security_contract_templates
 FOR EACH ROW EXECUTE FUNCTION private.security_template_draft_guard();
