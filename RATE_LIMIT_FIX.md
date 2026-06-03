# Rate Limit Error (429) - Fix Instructions

## What Happened
Sherri's account hit Supabase's authentication rate limit (429 error). This happens when too many authentication requests are made in a short period.

## Immediate Solution
**Wait 10-15 minutes before trying to log in again.** The rate limit will automatically reset.

## Prevention Steps
1. **Close all duplicate browser tabs** of the application before logging in
2. **Clear browser cache/cookies** if the issue persists
3. **Avoid rapid page refreshes** after login attempts

## Technical Details
The 429 error is a temporary block from Supabase's auth service that prevents excessive authentication requests. This can be triggered by:
- Multiple browser tabs/windows open
- Rapid login attempts
- Browser auto-refresh during development
- Auth loops (which we've now fixed in the code)

## Code Fixes Applied
1. Removed automatic sign-out loops when profile loading fails
2. Added duplicate request prevention for profile loading
3. Improved SIGNED_OUT event handling
4. Added specific error messages for rate limit errors

## If the Issue Continues
Contact support with the user ID: `9c23bdeb-9052-4719-b0c1-e259583b0086`
