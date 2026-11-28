# QuickBooks checkout capability audit (#1286)
Current portal uses stored QBO InvoiceLink. Direct MJV payment endpoints are retired (410). Keep existing hosted flow unchanged; connection alone is not proof of available merchant methods.

Intuit documents Apple Pay on eligible e-invoices and merchant-controlled invoice payment options:
- https://quickbooks.intuit.com/learn-support/en-us/help-article/receive-payments/frequently-asked-questions-apple-pay-quickbooks/L1yOQUp7l_US_en_US
- https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/take-process-payments-quickbooks-online/L2vHwwVmh_US_en_US
- https://developer.intuit.com/app/developer/qbpayments/docs/api/resources/all-entities/cards

Hosted checkout and Payments API are distinct; do not assume wallet support or funding classification from the Cards API. Intuit developer support describes no supported equivalent of hosted invoice surcharge in the direct API flow: https://help.developer.intuit.com/s/question/0D5TR00001ZJAFU0A5/quickbooks-payments-api-processorverified-creditdebitprepaid-classification-before-any-authorization-or-charge
This is a secondary support answer, not a merchant certification. Confirm current provider terms, applicable rules, merchant settings and real sandbox behavior before enabling any MJV fee. Do not add a fee to the underlying invoice before method eligibility is known. Do not double charge processor-controlled fees. Verify reconciliation, partial payments, settlement, returns, refunds, multi-invoice allocation and wallet availability independently.
