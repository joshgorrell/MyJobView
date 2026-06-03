# Time Clock CSV Import Guide

## Overview

The Time Clock CSV Import feature allows administrators to bulk import time clock entries from CSV files. The system intelligently handles two different CSV formats automatically.

## Accessing the Import Feature

1. Navigate to **Admin → Time Clock Settings**
2. Click the green **"Import CSV"** button in the top-right corner

## Supported CSV Formats

### Format 1: Hours Only

Use this format when you only have total hours worked, not specific clock in/out times.

**CSV Structure:**
```csv
Employee,Date,Hours
Justin Wright,2026-01-05,8.00
Sarah Johnson,2026-01-05,7.50
Mike Davis,2026-01-06,8.50
```

**How it works:**
- System generates clock in time using the default start time (e.g., 8:00 AM)
- Clock out time is calculated by adding hours to clock in time
- Example: 8.00 hours with 8:00 AM start = 8:00 AM to 4:00 PM

### Format 2: Full Times

Use this format when you have actual clock in and clock out timestamps.

**CSV Structure:**
```csv
Employee,Date,Clock In,Clock Out
Justin Wright,1/5/2026,1/5/2026 9:42:42 AM,1/5/2026 12:07:37 PM
Sarah Johnson,1/5/2026,1/5/2026 8:00:00 AM,1/5/2026 4:30:00 PM
Mike Davis,1/6/2026,1/6/2026 7:45:00 AM,1/6/2026 5:15:00 PM
```

**How it works:**
- System uses the exact times provided
- Automatically calculates total hours from the time difference

## Import Process

### Step 1: Upload CSV File
1. Click "Select CSV File" or drag and drop your file
2. System automatically detects the format (hours vs. times)
3. Preview shows detected format and all rows

### Step 2: Set Default Start Time (Hours Format Only)
If using hours-only format:
- Set the default start time (e.g., 8:00 AM)
- This will be used to generate clock in times
- You can change this before importing

### Step 3: Preview & Validate
- System shows all rows to be imported
- Validates employee names (must match existing employees)
- Validates dates and hours/times
- Error rows are highlighted in red with explanations

### Step 4: Import
- Click "Import X Entries" button
- System imports all valid entries
- Duplicates are updated (based on employee + date)
- All imports are marked as admin-adjusted

## Column Name Flexibility

The system recognizes various column names:

**For Employee:**
- "Employee", "Name", "Technician", "Tech"

**For Date:**
- "Date", "Day"

**For Hours:**
- "Hours", "Total Hours", "Hours Worked"

**For Times:**
- "Clock In", "Time In", "Start Time"
- "Clock Out", "Time Out", "End Time"

## Date Format Support

Accepted date formats:
- `2026-01-05` (ISO format)
- `1/5/2026` (US format)
- `01/05/2026` (US format with leading zeros)

## Time Format Support

Accepted time formats:
- `1/5/2026 9:42:42 AM` (Full timestamp with AM/PM)
- `1/5/2026 14:30:00` (24-hour format)
- `9:42:42 AM` (Time only - uses date from Date column)

## Important Notes

### Data Safety
- All imports are marked as `admin_adjusted: true`
- Import reason is recorded: "CSV Import - hours only" or "CSV Import - with times"
- Import note includes admin email who performed the import
- Original entries are preserved if duplicate (by employee + date)

### Validation Rules
- Employee must exist in the system (matched by name or email)
- Date must be valid
- Hours must be between 0 and 24
- Clock in time is required for time-based imports
- Clock out is optional (creates open clock entry)

### Batch Processing
- Imports are processed in batches of 50 records
- Large files are handled efficiently
- Progress is shown during import

## Example Templates

Click "Download CSV Templates" in the import modal to get example files for both formats.

### Hours Format Example
```csv
Employee,Date,Hours
John Doe,2026-01-15,8.00
Jane Smith,2026-01-15,7.50
Bob Johnson,2026-01-16,8.50
```

### Times Format Example
```csv
Employee,Date,Clock In,Clock Out
John Doe,1/15/2026,1/15/2026 8:00:00 AM,1/15/2026 4:30:00 PM
Jane Smith,1/15/2026,1/15/2026 9:00:00 AM,1/15/2026 5:00:00 PM
Bob Johnson,1/16/2026,1/16/2026 7:45:00 AM,1/16/2026 4:15:00 PM
```

## Troubleshooting

### Employee Not Found
**Error:** "Employee 'John Doe' not found"
**Solution:**
- Check spelling matches exactly with system records
- Use employee's email address instead of name
- Ensure employee exists in the system before importing

### Invalid Date Format
**Error:** "Invalid date format"
**Solution:**
- Use format: YYYY-MM-DD or M/D/YYYY
- Ensure dates are valid (no Feb 30, etc.)
- Check for typos in date cells

### Invalid Hours Value
**Error:** "Invalid hours value"
**Solution:**
- Hours must be between 0 and 24
- Use decimal format (8.50, not 8:30)
- Check for blank or non-numeric values

### Duplicate Entries
The system handles duplicates intelligently:
- Duplicate = same employee + same date
- Import will UPDATE the existing entry
- No duplicate entries are created

## Best Practices

1. **Prepare Your CSV:**
   - Remove any header rows beyond the first
   - Ensure all required columns are present
   - Use consistent date/time formats throughout

2. **Test Small Batches First:**
   - Try importing 5-10 records first
   - Verify the results before bulk import
   - Check that times/hours calculate correctly

3. **Backup First:**
   - Export existing time clock data before bulk import
   - Review the preview carefully before confirming

4. **Employee Matching:**
   - Use full names exactly as they appear in the system
   - Or use email addresses for guaranteed matching

5. **Default Start Time:**
   - Set this to your company's standard start time
   - Can be adjusted per import if needed

## Technical Details

**Database Table:** `daily_clock_entries`

**Fields Populated:**
- `technician_id` - Matched from employee name/email
- `entry_date` - From Date column
- `clock_in` - From Clock In column or generated
- `clock_out` - From Clock Out column or generated
- `total_hours` - From Hours column or calculated
- `status` - 'clocked_out' if has clock_out, else 'clocked_in'
- `admin_adjusted` - Always true
- `adjusted_by` - Current admin user ID
- `adjustment_reason` - "CSV Import - [format]"
- `notes` - "Imported from CSV by [admin email]"

**RLS Policies:**
- Import requires admin role
- Standard time clock visibility rules apply after import
