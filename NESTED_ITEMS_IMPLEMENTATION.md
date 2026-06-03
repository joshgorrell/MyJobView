# Nested Items Implementation - Button-Based Nesting

## Overview
Replaced the drag-and-drop nesting functionality with a simpler, more predictable button-based system for nesting line items in proposals.

## Changes Made

### 1. Added New Icons
- **Indent**: Used for the "Nest" button
- **Outdent**: Used for the "Unnest" button

### 2. New Functions

#### `handleBulkNestItems()`
**Purpose**: Nests selected items under the item immediately above the first selected item.

**Logic**:
1. Gets all selected items and sorts them by room and sort_order (display order)
2. Identifies the first selected item in display order
3. Finds the item immediately above the first selected item in the same room
4. **Validation checks**:
   - If no item exists above the first selected item (it's first in list), skips silently
   - Target parent must not be nested (only top-level items can be parents)
   - None of the selected items should have children (can't nest items that have children)
5. Updates all selected items to have `parent_item_id` pointing to the target parent
6. Reloads the proposal and clears selection

**Key Behavior**: All selected items nest together under the same parent item (the item above the first selected item).

#### `handleBulkUnnestItems()`
**Purpose**: Removes nesting from selected nested items.

**Logic**:
1. Filters selected items to find only those that are nested (have `parent_item_id`)
2. If no nested items found, clears selection and returns
3. Sets `parent_item_id` to `null` for all selected nested items
4. Reloads the proposal and clears selection

### 3. UI Changes

#### Selection Toolbar
When items are selected, the toolbar now shows:
1. **Selection count** (e.g., "3 items selected")
2. **Nest/Unnest button** (conditionally displayed):
   - Shows **"Nest"** button (blue, Indent icon) when no selected items are nested
   - Shows **"Unnest"** button (green, Outdent icon) when any selected items are nested
3. **Copy to...** button (blue)
4. **Delete** button (red)

The Nest/Unnest button intelligently switches based on whether any of the selected items are currently nested.

### 4. Visual Indicators
- Nested items continue to display with existing visual styling:
  - Green border on nested items
  - Indentation (24px per nesting level)
  - Connector lines showing parent-child relationships
  - Collapse/expand chevrons for parent items

### 5. Existing Features Preserved
- Checkbox selection system remains unchanged
- Drag-and-drop for rooms (unchanged)
- Copy items functionality (unchanged)
- Delete items functionality (unchanged)
- Collapse/expand for items with accessories (unchanged)

## User Experience

### To Nest Items:
1. Select one or more items using checkboxes
2. Click the blue **"Nest"** button
3. All selected items will nest under the item directly above the first selected item
4. If there's no item above, the operation is silently skipped

### To Unnest Items:
1. Select one or more nested items using checkboxes
2. Click the green **"Unnest"** button
3. All selected nested items will become top-level items in their current position

### Validation Messages:
- **"Cannot nest under a nested item. Only top-level items can be parents."**
  - Shown when trying to nest items where the target parent is itself nested
- **"Cannot nest items that have children. Please unnest their children first."**
  - Shown when trying to nest items that already have accessories/children

## Technical Details

### Database Updates
- Uses `parent_item_id` field in `proposal_line_items` table
- Maintains existing `sort_order` and `room_id` values
- No changes to database schema required

### Data Flow
1. User selects items and clicks Nest/Unnest
2. Function validates the operation
3. Updates `parent_item_id` in database via Supabase
4. Calls `loadProposal()` to refresh all data
5. Clears selection

### Key Design Decisions
1. **Batch operation**: All selected items nest under the same parent
2. **Silent skip**: No error shown if first item has no item above it
3. **Unlimited nesting**: No limit on how many items can nest under one parent
4. **Single-level nesting**: Nested items cannot have their own nested items (prevents deep nesting complexity)
5. **Smart button**: Button automatically switches between Nest/Unnest based on selection

## Benefits

1. **Predictable**: Users always know where items will nest (under the item above)
2. **Simple**: One-click operation, no drag-and-drop complexity
3. **Safe**: Clear validation prevents invalid nesting scenarios
4. **Flexible**: Works with single or multiple items
5. **Reversible**: Easy to unnest items if needed

## Files Modified
- `/src/components/Proposals/ProposalBuilder.tsx`
  - Added `Indent` and `Outdent` icons to imports
  - Added `handleBulkNestItems()` function
  - Added `handleBulkUnnestItems()` function
  - Updated toolbar UI to show Nest/Unnest buttons conditionally
