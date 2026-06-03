# Time Clock System Implementation

## Overview
The Time Clock system allows employees to track their daily work hours based on their employment type.

## Employment Types

### 1. Hourly Employees
- **Must clock in/out for the day**: Yes
- **Must clock in/out for jobs**: Yes (for documentation)
- **Paid from**: Daily clock entries
- **Time Button Shows**: Always visible when `requires_daily_clock = true`

### 2. Job Time Employees  
- **Must clock in/out for the day**: No
- **Must clock in/out for jobs**: Yes (for payment)
- **Paid from**: Job-specific time entries only
- **Time Button Shows**: Hidden (they don't use daily clock)

### 3. Salary Employees
- **Must clock in/out for the day**: Only if admin enables it
- **Must clock in/out for jobs**: No
- **Paid from**: Fixed salary
- **Time Button Shows**: Only if admin sets `requires_daily_clock = true`

## Time Button in Header

### Location
- Desktop: Next to Create button in top-right header
- Mobile: Always visible next to notification bell

### Button States
- **Blue**: Not clocked in (shows "Time")
- **Green**: Clocked in (shows "Time" + elapsed time)

### Behavior
- Click navigates to the Time Clock page (`activeTab = 'time'`)
- Shows elapsed time when clocked in
- Only visible for users with `requires_daily_clock = true`

## Time Clock Page Features

### Clock In/Out
- Large clock display showing current time
- Clock in button creates `daily_clock_entries` record
- Clock out button closes the day's entry
- Calculates total hours automatically

### Break Management
- Start/End break functionality
- Tracks break type (lunch, personal, other)
- Automatically calculates break duration
- Subtracts break time from total hours

### Points & Rewards
- Awards points based on punctuality:
  - **Early** (15+ min): +10 points
  - **On Time**: +5 points
  - **Late** (1-15 min): -5 points
  - **Very Late** (15+ min): -10 points
- Requires `standard_start_time` set in profile

### GPS Tracking
- Automatically starts when clocked in
- Records GPS breadcrumbs throughout the day
- Stops when clocked out
- Used for travel bonus calculations

## Admin Configuration

Admins can configure per user in Admin > Users:
- **Employment Type**: hourly | job_time | salary
- **Requires Daily Clock**: boolean (auto-set based on type, but can override)
- **Standard Start Time**: Expected clock-in time (for points)
- **Standard End Time**: Expected clock-out time
- **Travel Bonus Enabled**: Whether tech gets travel bonuses
- **Travel Bonus Rate**: Per-mile rate
- **Travel Bonus Method**: round_trip | one_way

## Database Tables

- `daily_clock_entries`: Main clock in/out records
- `daily_clock_breaks`: Break tracking
- `clock_in_rewards_log`: Points awarded/deducted
- `gps_breadcrumbs`: GPS location tracking
