# Proposals Pop-Out Feature

## Overview
The Proposals module can now be opened in a dedicated browser window that remains live and synchronized with the main application.

## Features

### 1. Pop-Out Button
- Located in the proposals toolbar (both list view and proposal editor)
- Opens a new browser window at `/proposals-fullscreen`
- Window size: 1400x900, centered on screen
- Can be resized and moved freely

### 2. Real-Time Sync
The pop-out window stays synchronized with the main app through:

**LocalStorage Sync:**
- Selected proposal ID
- View mode (Classic vs Pro Grid)
- Changes in one window are reflected in the other

**Custom Events:**
- When you edit a proposal in one window, the other window auto-refreshes
- Works for line items, rooms, and all proposal data

### 3. Standalone Experience
When popped out:
- Clean, minimal header with just the title and user name
- No main navigation
- Full screen dedicated to proposals
- "Pop Out" button is hidden (already popped out)

## How to Use

### From Main App:
1. Navigate to **Sales → Proposals** (or via MyJobView)
2. Click the **"Pop Out"** button in the toolbar
3. A new window opens with the full proposals module

### From Pop-Out Window:
- All functionality works exactly the same as in the main app
- Create proposals
- Edit proposals
- Toggle between Classic and Pro Grid views
- Add rooms and line items
- All changes sync back to the main app in real-time

### Multi-Window Workflow:
- Keep the pop-out window on a second monitor
- Use the main app for other tasks (leads, contacts, etc.)
- Proposal changes are always live and synced
- Both windows can edit simultaneously

## Technical Implementation

### Route
- URL: `/proposals-fullscreen`
- Renders `ProposalsView` with `isStandalone={true}`
- Requires authentication (redirects to login if not authenticated)

### Sync Mechanism
1. **LocalStorage Events:** Cross-window state changes
2. **Custom Events:** In-window component updates
3. **Supabase Real-time:** Database changes reflected everywhere

### Components Modified
- `ProposalsView.tsx` - Added pop-out button and sync listeners
- `ProposalBuilderPro.tsx` - Added update event dispatching
- `ProposalBuilderEnhanced.tsx` - Added update event dispatching
- `App.tsx` - Added standalone route handler

## Testing

### Test Scenarios:
1. ✅ Open pop-out window from proposals list
2. ✅ Select a proposal in main app → pop-out updates
3. ✅ Edit in pop-out → main app updates
4. ✅ Toggle Classic/Pro Grid in one window → other follows
5. ✅ Create new proposal in main app → appears in pop-out
6. ✅ Add line items in pop-out → shows in main app
7. ✅ Close and reopen pop-out → state preserved

## Sample Products Added
20 sample products are now in the database for testing:
- Samsung 75" QLED TV ($2,499)
- Sonos Arc Soundbar ($899)
- Control4 EA-5 Controller ($2,800)
- In-Wall Speakers, cameras, cables, labor items, etc.

## Database Setup
- ✅ 20 products available
- ✅ 8 product classes configured
- ✅ 6 labor phases configured
- ✅ 19 contacts ready for proposals
- ✅ All tables and permissions verified

## Next Steps
Test the pop-out feature and let me know if you'd like any adjustments to:
- Window size or positioning
- Sync behavior
- UI/layout in standalone mode
- Additional features
