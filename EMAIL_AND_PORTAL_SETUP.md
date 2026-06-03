# Email & Customer Portal Setup Guide

## Complete Setup Checklist

### Step 1: Domain Verification in Resend

1. **Create Resend Account**
   - Go to [https://resend.com/signup](https://resend.com/signup)
   - Create a free account (100 emails/day free)

2. **Verify Your Domain**
   - In Resend dashboard, click **"Domains"**
   - Click **"Add Domain"**
   - Enter your domain (e.g., `yourdomain.com`)
   - Add the DNS records Resend provides to your domain registrar:
     - **SPF Record** (TXT record)
     - **DKIM Record** (TXT record)
     - **DMARC Record** (TXT record)
   - Wait 5-10 minutes for DNS propagation
   - Click **"Verify"** in Resend

3. **Create API Key**
   - In Resend, click **"API Keys"**
   - Click **"Create API Key"**
   - Name it (e.g., "Production Key")
   - Copy the key (starts with `re_...`) - **you can only see this once!**

---

### Step 2: Add Resend API Key to Supabase

1. Go to your **Supabase Project Dashboard**
2. Navigate to **Project Settings** → **Edge Functions**
3. Under **Secrets**, add a new secret:
   - **Name:** `RESEND_API_KEY`
   - **Value:** (paste your Resend API key)
4. Click **Save**

---

### Step 3: Configure Email Settings in Your App

1. Open your app and log in as an admin
2. Go to **Admin** → **Settings** → **Company Settings**
3. Scroll to the **"Email Settings (Resend)"** section
4. Fill in the fields:
   - **From Email Address:** Use your verified domain (e.g., `proposals@yourdomain.com`, `noreply@yourdomain.com`)
   - **From Name:** Your company name (e.g., "Acme Security")
   - **Reply-To Email:** Where customers should reply (optional, e.g., `support@yourdomain.com`)
5. Click **"Save Company Info"**

---

### Step 4: Set Up Customer Portal URL

The **Portal URL** is where your customers will access their portal to:
- View and approve proposals
- See their projects
- Manage appointments
- View invoices
- Submit punchlist items

**To set this up:**

1. In **Company Settings**, find the **"Portal URL"** field
2. Enter the URL where your app is hosted:
   - If using a custom domain: `https://portal.yourdomain.com`
   - If using the app's default URL: `https://your-app.netlify.app` (or whatever your hosting provider gives you)
3. Click **"Save Company Info"**

**Important:** This URL is used in all customer-facing emails, so make sure it's correct!

---

## Testing Your Setup

### Test Email Sending

1. Create a test proposal
2. Send it to a test email address
3. Check if the email arrives with:
   - Correct "From" name and address
   - Working portal link
   - Professional formatting

### Test Portal Access

1. Click on a portal link from an email
2. Verify the customer can:
   - View the proposal
   - Accept/reject it
   - Access other portal features

---

## Common Issues

### Emails Not Sending

**Problem:** Emails aren't being sent

**Solutions:**
- Check that your domain is verified in Resend (status should be "Verified")
- Verify the API key is correctly added to Supabase Edge Functions
- Make sure the "From Email" uses your verified domain
- Check Resend dashboard for error logs

### Portal Links Not Working

**Problem:** Portal links in emails don't work

**Solutions:**
- Verify the Portal URL is set correctly in Company Settings
- Make sure the URL includes `https://`
- Test the URL by pasting it directly in a browser

### Domain Verification Failing

**Problem:** Resend shows domain as "Not Verified"

**Solutions:**
- Wait longer (DNS can take up to 24 hours)
- Use a DNS checker tool to verify records are propagated
- Double-check that you added ALL three records (SPF, DKIM, DMARC)
- Make sure there are no typos in the DNS records

---

## Email Settings Reference

### From Email
- Must use your verified domain
- Examples: `proposals@yourdomain.com`, `noreply@yourdomain.com`, `sales@yourdomain.com`
- This is what customers see in the "From" field

### From Name
- Your company name or department name
- Examples: "Acme Security", "Acme Sales Team"
- Makes emails more recognizable to customers

### Reply-To Email
- Where customer replies go
- Optional (defaults to From Email if not set)
- Examples: `support@yourdomain.com`, `info@yourdomain.com`

---

## Next Steps

Once setup is complete:

1. Test sending a proposal to yourself
2. Train your team on the new email system
3. Update any customer-facing documentation with your new portal URL
4. Consider adding your portal URL to business cards and marketing materials

---

## Need Help?

If you run into issues:
1. Check the Resend dashboard logs
2. Check Supabase Edge Functions logs
3. Verify all settings are saved correctly
4. Make sure DNS records are properly configured
