# TV Dashboard Guide

## Overview

The TV Dashboard is a full-screen, auto-refreshing display designed to be left running 24/7 on a wall-mounted TV or monitor. It provides real-time production metrics, technician status, and service information.

## Accessing the Dashboard

### Method 1: From the Application Menu
1. Navigate to the Production department in the main application
2. Click on "TV Dashboard" in the sidebar menu
3. The dashboard will automatically open in a new window optimized for full-screen display

### Method 2: Direct URL
Navigate directly to:
```
http://your-domain.com/tv-dashboard
```

Or for local development:
```
http://localhost:5173/tv-dashboard
```

Both methods access the same dashboard. The navigation menu method is convenient for quick access, while the direct URL is useful for bookmarks and kiosk mode setup.

## Full-Screen Setup

### Method 1: Browser Full-Screen
1. Open the TV Dashboard URL in your browser (Chrome, Firefox, Edge, etc.)
2. Press `F11` to enter full-screen mode
3. The dashboard will now occupy the entire screen

### Method 2: Kiosk Mode (Chrome)
For a dedicated display, launch Chrome in kiosk mode:
```bash
chrome --kiosk --app=http://your-domain.com/tv-dashboard
```

## Dashboard Features

### Three View Modes

**1. Production View** (Default)
- Active jobs count
- Jobs completed today
- Overdue jobs (with alert)
- Parts requests pending
- Technicians on duty with current assignments
- Recent activity feed

**2. Dispatch View**
- Available technicians count
- Active jobs
- Service requests pending
- Jobs completed today
- Full field team status with job assignments

**3. Billing View**
- Jobs ready for billing
- Completed today
- Punchlist tasks
- Service requests
- Recent completions list

### Real-Time Updates

The dashboard automatically updates using:
- **Live subscriptions** to work orders, clock entries, service requests, and parts requests
- **Automatic refresh** every 30 seconds for metrics
- **Tech status** updates every 15 seconds
- **Activity feed** updates every 10 seconds

### Visual Indicators

- **Green pulse indicator** - Live updates active
- **Connection status** - WiFi icon shows connection state
- **Alert cards** - Red pulsing borders for critical items (overdue jobs, high parts requests)
- **Last update timestamp** - Shows when data was last refreshed

## Auto-Refresh Behavior

The dashboard is designed to run continuously without manual intervention:

1. **No login required** - Dashboard loads without authentication
2. **No session timeout** - Page stays active indefinitely
3. **Automatic reconnection** - If network drops, it automatically reconnects
4. **Low resource usage** - Optimized to prevent browser slowdown

## Switching Views

Use the three buttons in the top-right corner to switch between:
- Production
- Dispatch
- Billing

The selected view is highlighted in blue.

## Browser Recommendations

**Best browsers for 24/7 display:**
1. **Google Chrome** - Most stable for long-running displays
2. **Microsoft Edge** - Good performance and memory management
3. **Firefox** - Solid alternative

**Recommended settings:**
- Disable browser auto-sleep/hibernation
- Set display to never sleep
- Enable "Keep screen awake" in system settings
- Disable browser notifications

## Display Settings

**Optimal display configuration:**
- **Resolution:** 1920x1080 or higher
- **Orientation:** Landscape
- **Brightness:** Adjust for viewing distance (30-50% for close viewing, 70-100% for distant viewing)
- **Text size:** Large fonts optimized for 10+ feet viewing distance

## Keyboard Shortcuts

- `F11` - Toggle full-screen mode
- `F5` - Manual refresh (rarely needed)
- `Esc` - Exit full-screen mode

## Troubleshooting

### Connection Lost
If you see a red WiFi icon:
1. Check network connection
2. The dashboard will automatically reconnect
3. If connection doesn't restore, refresh the page (F5)

### Data Not Updating
1. Check the "Last Update" timestamp
2. Look for the green pulse indicator (bottom left)
3. If stuck, refresh the page (F5)

### Display Sleep
If the TV/monitor goes to sleep:
1. Check display power settings
2. Ensure "Never sleep" is set
3. Some browsers have "keep awake" extensions available

### Browser Slowdown (after days/weeks)
While optimized for 24/7 use, browsers may slow down after extended periods:
1. Refresh the page once weekly (F5)
2. Or set up automatic browser restart (e.g., once per night at 3am)

## Optional: Automatic Daily Refresh

To set up automatic page refresh at 3am daily, you can:

**Option 1: Browser Extension**
Install a page auto-refresh extension and configure it for once daily at 3am

**Option 2: System Task Scheduler**
Create a scheduled task to:
1. Close the browser
2. Wait 10 seconds
3. Reopen the browser with the dashboard URL

## Customization

Currently displays:
- Work order metrics
- Technician status (up to 8 technicians)
- Recent activity (last 15 minutes)
- Service requests and parts tracking

The dashboard automatically adapts to your company's data in real-time.

## Support

For questions or issues, contact your system administrator.

---

**Last Updated:** January 2026
