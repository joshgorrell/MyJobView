/*
  # Add Payment Receipt Email Template

  1. New Email Template
    - Adds payment receipt email template to email_templates table
    - Includes variable substitution for payment details
    - Professional receipt design with payment summary

  2. Template Variables
    - {customer_name} - Customer's full name
    - {invoice_number} - Invoice number
    - {payment_amount} - Amount paid
    - {payment_date} - Date of payment
    - {payment_method} - Payment method used
    - {reference_number} - Check number, transaction ID, etc.
    - {previous_balance} - Balance before payment
    - {new_balance} - Balance after payment
    - {portal_url} - Link to customer portal
*/

-- Insert payment receipt email template
INSERT INTO email_templates (template_type, subject, body, is_active)
VALUES (
  'payment_receipt',
  'Payment Receipt - Invoice #{invoice_number}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt</title>
  <style>
    @media (prefers-color-scheme: dark) {
      .dark-mode { background-color: #1a1a1a !important; color: #e5e5e5 !important; }
      .dark-card { background-color: #2d2d2d !important; border-color: #404040 !important; }
      .dark-text { color: #e5e5e5 !important; }
      .dark-muted { color: #a0a0a0 !important; }
    }
  </style>
</head>
<body class="dark-mode" style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; background-color: #f3f4f6; color: #1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;" class="dark-mode">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" class="dark-card">
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Payment Received</h1>
              <p style="margin: 10px 0 0 0; color: #d1fae5; font-size: 16px;">Thank you for your payment</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #4b5563;" class="dark-text">
                Dear {customer_name},
              </p>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #4b5563;" class="dark-text">
                We have successfully received your payment. Below are the details of your transaction:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 24px;" class="dark-card">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="8" cellspacing="0">
                      <tr>
                        <td style="font-size: 14px; color: #6b7280; padding-bottom: 8px;" class="dark-muted">Invoice Number:</td>
                        <td style="font-size: 14px; font-weight: 600; color: #1f2937; text-align: right;" class="dark-text">{invoice_number}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 14px; color: #6b7280; padding-bottom: 8px;" class="dark-muted">Payment Date:</td>
                        <td style="font-size: 14px; font-weight: 600; color: #1f2937; text-align: right;" class="dark-text">{payment_date}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 14px; color: #6b7280; padding-bottom: 8px;" class="dark-muted">Payment Method:</td>
                        <td style="font-size: 14px; font-weight: 600; color: #1f2937; text-align: right;" class="dark-text">{payment_method}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 14px; color: #6b7280; padding-bottom: 8px;" class="dark-muted">Reference Number:</td>
                        <td style="font-size: 14px; font-weight: 600; color: #1f2937; text-align: right;" class="dark-text">{reference_number}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef3c7; border: 2px solid #fbbf24; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="6" cellspacing="0">
                      <tr>
                        <td style="font-size: 14px; color: #92400e;">Previous Balance:</td>
                        <td style="font-size: 14px; font-weight: 600; color: #92400e; text-align: right;">${previous_balance}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 16px; font-weight: 700; color: #10b981;">Payment Received:</td>
                        <td style="font-size: 16px; font-weight: 700; color: #10b981; text-align: right;">-${payment_amount}</td>
                      </tr>
                      <tr style="border-top: 2px solid #fbbf24;">
                        <td style="font-size: 18px; font-weight: 700; color: #92400e; padding-top: 12px;">New Balance:</td>
                        <td style="font-size: 18px; font-weight: 700; color: #dc2626; text-align: right; padding-top: 12px;">${new_balance}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #4b5563;" class="dark-text">
                You can view your invoice and payment history anytime by logging into your customer portal.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="{portal_url}" style="display: inline-block; padding: 14px 32px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">View Invoice</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #4b5563;" class="dark-text">
                If you have any questions about this payment, please don''t hesitate to contact us.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;" class="dark-card">
              <p style="margin: 0; font-size: 14px; color: #6b7280;" class="dark-muted">
                This is an automated receipt. Please keep this for your records.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  true
)
ON CONFLICT (template_type) 
DO UPDATE SET
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = now();
