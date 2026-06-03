# Login Troubleshooting Guide

## Issue: User Can Login on Some Computers But Not Others

When a user (sherri@electroniclife.com) can log in successfully from one computer but gets kicked back to the login screen on another computer, this is typically a browser-specific issue.

## Common Causes

### 1. **LocalStorage Blocked or Disabled** (Most Common)
- **Symptom**: Authentication succeeds but session doesn't persist
- **Causes**:
  - Private/Incognito browsing mode
  - Browser privacy settings blocking storage
  - Corporate policies restricting storage
  - Safari with "Prevent cross-site tracking" enabled
- **Solution**: Enable cookies and site data in browser settings

### 2. **Browser Extensions Interfering**
- **Symptom**: Login attempts fail or redirect back to login
- **Common culprits**:
  - Ad blockers (uBlock Origin, AdBlock Plus)
  - Privacy extensions (Privacy Badger, Ghostery)
  - Security extensions
- **Solution**: Disable extensions temporarily and test

### 3. **Corporate Network Restrictions**
- **Symptom**: Cannot reach authentication server
- **Causes**:
  - Firewall blocking Supabase domains
  - Proxy interfering with requests
  - SSL inspection breaking connections
- **Solution**: Contact IT to whitelist Supabase domains

### 4. **Outdated Browser**
- **Symptom**: JavaScript errors or compatibility issues
- **Solution**: Update browser to latest version

### 5. **Strict Cookie/Privacy Settings**
- **Symptom**: Third-party requests blocked
- **Browsers affected**: Firefox, Safari, Brave
- **Solution**: Adjust privacy settings to allow necessary cookies

## Diagnostic Tool

A built-in diagnostic tool is now available on the login page:

1. Click **"Having trouble logging in?"** on the login page
2. Click **"Run Diagnostics"**
3. Review the results and follow recommendations
4. Take a screenshot and send to support if issues persist

### What the Diagnostics Check:
- ✅ LocalStorage availability
- ✅ SessionStorage availability
- ✅ Cookies enabled
- ✅ JavaScript enabled
- ✅ Browser version
- ✅ Network connectivity
- ✅ API server reachability
- ✅ IndexedDB availability
- ⚠️ Privacy settings warnings

## Enhanced Error Handling

The system now includes:

1. **Better Error Messages**: Clear alerts when profile loading fails
2. **Timeout Protection**: 10-second timeout with user notification
3. **Enhanced Logging**: Console shows detailed diagnostic info (press F12)
4. **Graceful Degradation**: Session tracking failures won't prevent login
5. **Auto Sign-Out**: Automatically signs out on critical errors to prevent stuck states

## Steps for Sherri to Try

### Quick Fixes (Try These First)

1. **Clear Browser Cache & Cookies**
   - Chrome: Settings → Privacy → Clear browsing data
   - Firefox: Options → Privacy → Clear Data
   - Edge: Settings → Privacy → Choose what to clear

2. **Disable Browser Extensions**
   - Open browser in Incognito/Private mode (extensions disabled by default)
   - If login works, identify and disable the problematic extension

3. **Try a Different Browser**
   - Download and try Chrome, Firefox, or Edge
   - If it works, the original browser has a configuration issue

4. **Check Browser Settings**
   - Ensure cookies are enabled for this site
   - Disable "strict tracking protection" or similar features
   - Allow JavaScript

### Using the Diagnostic Tool

1. Go to the login page
2. Click **"Having trouble logging in?"** (yellow link at bottom)
3. Click **"Run Diagnostics"**
4. Look for any red ❌ marks
5. Follow the recommendations for each failed check
6. Take a screenshot of results if problem persists

### Advanced Troubleshooting

1. **Open Browser Console** (F12 or Cmd+Option+I)
   - Look for errors in red
   - Look for these specific emojis in console:
     - 🔄 = Loading started
     - ✅ = Success
     - ❌ = Critical error
     - ⚠️ = Warning (non-critical)
   - Take screenshot of console and send to support

2. **Check Network Tab**
   - Open DevTools (F12) → Network tab
   - Try to log in
   - Look for failed requests (red)
   - Check if requests to Supabase are blocked

3. **Test on Corporate Network**
   - If on corporate network, try from home
   - If works at home but not at work = network restriction
   - Contact IT department

## For IT/Support Staff

### Environment Variables Check
Ensure these are set correctly in `.env`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Database Check
Verify the user's profile exists:
```sql
SELECT * FROM profiles WHERE id = (
  SELECT id FROM auth.users WHERE email = 'sherri@electroniclife.com'
);
```

### Session Tracking Issues
Session tracking failures are now non-critical and won't prevent login. Check console for:
- ⚠️ Failed to start session tracking (non-critical)
- ⚠️ Could not fetch IP address (non-critical)

### Profile Loading Timeout
If profile loading times out (>10 seconds):
1. Check database performance
2. Check network latency
3. Check RLS policies on profiles table
4. Check if `start_user_session` RPC exists and works

## Recent Improvements

### Enhanced AuthContext
- ✅ Better error messages with alerts
- ✅ Automatic sign-out on profile loading failure
- ✅ Non-blocking session tracking (failures won't prevent login)
- ✅ Enhanced console logging with emojis for easy diagnosis
- ✅ 10-second timeout with user notification
- ✅ More reliable beforeunload handling with sendBeacon

### Browser Diagnostics Tool
- ✅ Comprehensive browser compatibility checks
- ✅ Clear pass/fail/warning indicators
- ✅ Actionable recommendations
- ✅ API connectivity testing
- ✅ Easy access from login page

## Contact Support

If none of these solutions work:

1. Run the diagnostic tool and take screenshot
2. Open browser console (F12) and take screenshot of any errors
3. Note which browser and version you're using
4. Send all screenshots to support with:
   - Your email address
   - Browser name and version
   - Operating system
   - Whether you're on corporate network
   - Results from diagnostic tool
