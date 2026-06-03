# User Access Control Fix

## Issue
Pages marked as "hidden" in Admin > Settings > User Management > Individual Pages were still visible to admin users.

## Root Cause
The access control logic in `DepartmentContext.tsx` was checking if the user was an admin BEFORE checking for user-specific permission overrides. This meant:

```typescript
// OLD LOGIC (incorrect)
if (profile?.role === 'admin') return true;  // Admin check FIRST
if (moduleUserOverrides.has(mod.id)) {       // This never ran for admins
  return moduleUserOverrides.get(mod.id);
}
```

When you're an admin, the function returned `true` immediately, never checking your personal "hidden" page settings.

## Solution
Reordered the access control checks to respect user-specific overrides even for admins:

```typescript
// NEW LOGIC (correct)
if (moduleUserOverrides.has(mod.id)) {       // Check user overrides FIRST
  return moduleUserOverrides.get(mod.id);
}
if (profile?.role === 'admin') return true;  // Then check admin status
```

## Changes Made
Updated 5 locations in `DepartmentContext.tsx`:
1. `getUserModules()` - Controls which modules show in department menus
2. `hasModuleAccess()` - General module access checks
3. `checkAccess()` helper - Used for starred modules
4. Department filtering - Which departments to show
5. Quick access suggestions - Which suggestions to display

## Additional Fix
Changed default access behavior from "deny by default" to "allow by default" for modules without explicit permissions. This means new features are accessible to everyone unless you specifically restrict them through Role Permissions.

## Testing
Now when you mark a page as "hidden" in User Access Control, it will be hidden even if you're an admin. This is useful for:
- Testing how the UI looks for restricted users
- Self-imposed focus (hiding distractions)
- Simulating different user experiences

## Date
February 17, 2026
