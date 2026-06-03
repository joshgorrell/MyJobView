# Push Notification Setup Instructions

## Step 1: Public Key Configuration (COMPLETED ✓)

The public VAPID key has been added to your `.env` file:
```
VITE_VAPID_PUBLIC_KEY=MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEKS59MjOCwmTaGuUnu1vaTRrMSqyVV97ASbBFXQPVSISxYPUeBJvGtb5N5gHGEpXnxwAEk6dHXVfzNs4D4sj6vQ
```

## Step 2: Add Private Key to Supabase

You need to add the private VAPID key to your Supabase project. Here's how:

### Option A: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/bqtsuzvuvqvgidipbsis
2. Navigate to **Settings** (gear icon in sidebar)
3. Click on **Edge Functions** in the settings menu
4. Scroll to the **Secrets** section
5. Click **Add Secret**
6. Add a new secret:
   - **Name**: `VAPID_PRIVATE_KEY`
   - **Value**: `MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgb9XhP9NBkDczqLsOlJa4YNqVoN9aIe8sSEFsqTjxLzOhRANCAAQpLn0yM4LCZNoa5Se7W9pNGsxKrJVX3sBJsEVdA9VIhLFg9R4Em8a1vk3mAcYSlefHAASTp0ddV_M2zgPiyPq9`
7. Click **Save**

### Option B: Using Supabase CLI (If you have it installed)

Run this command in your terminal:
```bash
supabase secrets set VAPID_PRIVATE_KEY=MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgb9XhP9NBkDczqLsOlJa4YNqVoN9aIe8sSEFsqTjxLzOhRANCAAQpLn0yM4LCZNoa5Se7W9pNGsxKrJVX3sBJsEVdA9VIhLFg9R4Em8a1vk3mAcYSlefHAASTp0ddV_M2zgPiyPq9
```

## Step 3: Test Push Notifications

Once you've added the private key:

1. Open your app in a browser
2. Go to **Settings** → **Preferences**
3. Click **Enable Push Notifications**
4. Grant permission when your browser asks
5. You should see "Push Notifications Enabled" confirmation

## How to Send Push Notifications

Push notifications are automatically sent when:
- Someone mentions you in a discussion
- A lead is assigned to you
- New leads appear in the fishbowl (if you have that preference enabled)
- Leads are escalated
- Priority lead status changes

You can also manually trigger push notifications by calling the edge function:

```javascript
const { data } = await supabase.functions.invoke('send-push-notification', {
  body: {
    userId: 'user-id-here',
    title: 'Test Notification',
    body: 'This is a test push notification',
    data: { someKey: 'someValue' },
    tag: 'test'
  }
});
```

## Troubleshooting

### Push notifications not working?

1. **Check browser support**: Push notifications work in Chrome, Firefox, Edge, and Safari (iOS 16.4+)
2. **Check permissions**: Make sure you granted notification permission in your browser
3. **Check HTTPS**: Push notifications only work on HTTPS sites (localhost is OK for testing)
4. **Check the private key**: Make sure you added the VAPID_PRIVATE_KEY secret to Supabase
5. **Check service worker**: Open DevTools → Application → Service Workers and verify it's running

### How to test in development

1. The service worker is already registered
2. Push notifications work on `localhost` without HTTPS
3. Enable notifications in Settings → Preferences
4. Test by creating a mention or assigning a lead to yourself

## Security Note

Keep the private key (`VAPID_PRIVATE_KEY`) secret! Never commit it to version control or share it publicly. It's already excluded from git via the .env file.
