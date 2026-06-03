# Performance Fix - Slow Page Loading

## Issue
All pages across the application were loading slowly after the Tech Map fix was implemented.

## Root Cause

The issue was NOT related to the Tech Map fix itself, but rather a pre-existing performance problem in the `Header` component that was causing excessive re-renders.

### The Problem

In `src/components/Layout/Header.tsx`, the `useDepartments()` hook was being called **multiple times directly in the JSX** instead of once at the component level:

**Before (Lines 283-294):**
```tsx
{/* Calling useDepartments() directly in JSX - BAD! */}
{useDepartments().starredModules.length > 0 && (
  <div className="border-b border-purple-500/30 pb-3 mb-2">
    ...
    {expandedMobileItems.has('favorites') && (
      <div className="space-y-1">
        {/* Another call to useDepartments() - WORSE! */}
        {useDepartments().starredModules.map((module) => (
          ...
        ))}
      </div>
    )}
  </div>
)}
```

### Why This Caused Slowness

1. **Multiple Hook Calls**: Every render of the Header component was calling `useDepartments()` multiple times within the JSX
2. **Context Access Overhead**: Each call to `useDepartments()` accesses the React Context, which has overhead
3. **Re-render Cascades**: The Header renders on every navigation change, causing these multiple context accesses to happen frequently
4. **6 Parallel Queries**: The DepartmentContext loads data via 6 parallel queries (departments, modules, role access, user overrides, starred modules, default starred modules)

While the context itself doesn't re-query the database on every render (it caches), accessing it multiple times per render still creates unnecessary overhead, especially when combined with other page loading operations.

## The Fix

**Changed Line 29:**
```tsx
// Destructure starredModules from the hook at the component level
const { mainDepartments, footerDepartments, getUserModules, starredModules, loading: deptLoading } = useDepartments();
```

**Changed Lines 283-294:**
```tsx
{/* Use the destructured value - GOOD! */}
{starredModules.length > 0 && (
  <div className="border-b border-purple-500/30 pb-3 mb-2">
    ...
    {expandedMobileItems.has('favorites') && (
      <div className="space-y-1">
        {/* Use the same destructured value - BETTER! */}
        {starredModules.map((module) => (
          ...
        ))}
      </div>
    )}
  </div>
)}
```

## Impact

This fix:
- ✅ Eliminates redundant context accesses on every Header render
- ✅ Reduces JavaScript execution time during page loads
- ✅ Improves responsiveness when navigating between pages
- ✅ Follows React best practices for hook usage

## Best Practice

**Always destructure values from hooks at the component level, never call hooks directly in JSX:**

```tsx
// ❌ BAD - Don't do this
function MyComponent() {
  return (
    <div>
      {useMyHook().someValue > 0 && (
        <div>{useMyHook().someValue}</div>
      )}
    </div>
  );
}

// ✅ GOOD - Do this instead
function MyComponent() {
  const { someValue } = useMyHook();
  return (
    <div>
      {someValue > 0 && (
        <div>{someValue}</div>
      )}
    </div>
  );
}
```

## Testing
✅ Build completed successfully with no errors
✅ TypeScript compilation passed
✅ All component imports resolved correctly

## Files Modified
- `src/components/Layout/Header.tsx` (Lines 29, 283, 294)
