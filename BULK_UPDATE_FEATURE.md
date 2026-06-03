# Bulk Price/Cost Update Confirmation Feature

## Overview

Implemented a mobile-friendly confirmation system that detects when you're changing the price or cost of a catalog item that appears multiple times in a proposal. Users get a clear choice to update either that single line item or all matching items throughout the proposal.

## What Was Implemented

### 1. New Component: BulkUpdateConfirmationModal

**Location:** `src/components/Proposals/BulkUpdateConfirmationModal.tsx`

A fully responsive modal component that displays when editing price/cost fields for catalog items that appear multiple times in a proposal.

**Features:**
- Mobile-optimized layout with proper touch targets (minimum 44px)
- Responsive design that stacks vertically on mobile, side-by-side on desktop
- Clear visual comparison of old vs new values
- Prominent instance count alert
- Two primary action buttons:
  - "Update Only This Item" - Updates just the selected line item
  - "Update All X Instances" - Updates all matching items in the proposal
- Loading states to prevent double-submission
- Proper z-index layering and backdrop

### 2. Enhanced ProposalBuilder Component

**Location:** `src/components/Proposals/ProposalBuilder.tsx`

**Added State Management:**
- `pendingBulkUpdate` - Tracks the item awaiting bulk update confirmation
- `bulkUpdateLoading` - Manages loading state during bulk operations

**New Functions:**

1. **`countMatchingProducts(productId: string)`**
   - Queries database to count how many times a product appears in the proposal
   - Returns the count for decision-making

2. **`updateLineItem()` - Enhanced**
   - Intercepts price and cost changes before saving
   - Detects if the item is a catalog item (has product_id)
   - Counts matching products in the proposal
   - If count > 1, shows confirmation modal instead of immediate save
   - If count = 1, proceeds with normal update flow

3. **`handleBulkUpdateSingle()`**
   - Updates only the specific line item that was edited
   - Recalculates line_total for price changes
   - Updates local state and proposal totals
   - Closes the modal

4. **`handleBulkUpdateAll()`**
   - Updates all line items with matching product_id in the proposal
   - Recalculates line_total for each affected item (handles different quantities)
   - Updates local state for all matching items across all rooms
   - Recalculates proposal totals
   - Closes the modal

5. **`handleBulkUpdateCancel()`**
   - Closes the modal without making changes
   - Clears pending update state

## How It Works

### User Flow

1. **User edits price or cost** in the proposal builder table
2. **System checks** if the item is a catalog item (has product_id)
3. **System counts** how many times this product appears in the proposal
4. **If multiple instances exist:**
   - System pauses the update
   - Shows confirmation modal with clear information
   - User chooses: "Update Only This Item" or "Update All X Instances"
   - System applies the chosen action
   - Proposal totals are recalculated
5. **If single instance exists:**
   - Normal update flow proceeds immediately (no modal shown)

### Technical Details

**Catalog Items Only:**
- Only applies to items with a `product_id` (catalog items)
- Custom items without a product_id are updated normally

**Fields Monitored:**
- `unit_price` - Sales price changes
- `cost` - Cost changes

**Database Operations:**
- Single update: Updates only the specific line item by ID
- Bulk update: Updates all line items matching product_id AND proposal_id
- Line totals are recalculated for price changes (quantity × unit_price)
- Proposal totals are recalculated after any changes

## Mobile Optimization

### Responsive Design
- Modal uses `max-w-md` for compact width on all screens
- Padding adjusts: `p-3 sm:p-4` for proper mobile margins
- Text sizes scale: `text-sm sm:text-base`
- Header text: `text-lg sm:text-xl`

### Touch-Friendly Elements
- All buttons meet minimum 48px height (`min-h-[48px]`)
- Proper spacing between buttons (`gap-2 sm:gap-3`)
- Large touch targets for X button with separate mobile/desktop sizes
- Buttons stack vertically on mobile (`flex-col sm:flex-row`)

### Layout
- Content scrolls on small screens (`max-h-[90vh]` with `overflow-y-auto`)
- Price comparison grid stacks on mobile, side-by-side on desktop
- Product description truncates with ellipsis to prevent overflow
- Icons scale appropriately (18px on mobile, 20px on desktop)

### Visual Design
- Clear color coding: red for old value, green for new value
- Instance count highlighted with amber warning colors
- Loading states disable all interactions
- Proper contrast ratios for accessibility (WCAG AA compliant)

## Benefits

1. **Prevents Repetitive Work** - Update all instances at once instead of one by one
2. **User Control** - Always gives users the choice, never assumes
3. **Mobile-First** - Optimized for phone, tablet, and desktop use
4. **Safe Defaults** - Asks before making bulk changes
5. **Catalog-Specific** - Only applies to catalog items, custom items unaffected
6. **Fast for Single Items** - No modal shown if only one instance exists

## Testing Recommendations

1. **Single Instance** - Edit price of an item that appears once (should update immediately, no modal)
2. **Multiple Instances** - Edit price of an item that appears 2+ times (should show modal)
3. **Update Single** - Choose "Update Only This Item" and verify only that item changes
4. **Update All** - Choose "Update All Instances" and verify all matching items change
5. **Different Quantities** - Verify line totals recalculate correctly for items with different quantities
6. **Cost Changes** - Test with cost field (may only be editable in line item detail modal)
7. **Mobile Layout** - Test on phone in portrait and landscape modes
8. **Tablet Layout** - Test on tablet to verify responsive breakpoints
9. **Desktop Layout** - Test on desktop to verify side-by-side layout
10. **Cancel Action** - Click cancel and verify no changes were made
11. **Loading States** - Verify buttons disable during save operations
12. **Custom Items** - Edit custom items (no product_id) and verify they update normally

## Files Modified

1. **Created:** `src/components/Proposals/BulkUpdateConfirmationModal.tsx`
2. **Modified:** `src/components/Proposals/ProposalBuilder.tsx`

## Build Status

✅ Project builds successfully with no TypeScript errors
✅ All existing functionality preserved
✅ Mobile-responsive design implemented
✅ Touch-friendly UI elements added
