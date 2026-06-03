# Smart CSV Import - User Guide

## Quick Start

The new smart CSV import can handle any CSV format. You no longer need to match a specific template!

### Step-by-Step Guide

#### 1. Access the Import Tool
- Navigate to **Admin** → **Job Time CSV Import**
- Or go to **Dispatch** → **Time Clock Management** → **Import CSV**

#### 2. Upload Your File
- Click **"Choose File"** or drag and drop your CSV
- The system automatically:
  - Detects the delimiter (comma, semicolon, tab)
  - Removes any encoding markers
  - Parses quoted fields correctly

#### 3. Review Auto-Mapping
The system will show you its best guess for each column:

**Green (90%+)**: High confidence - probably correct
**Yellow (70-90%)**: Medium confidence - worth checking
**Orange (<70%)**: Low confidence - verify manually

**Sample Data**: Under each mapping, you'll see 1-3 sample values to verify it's the right column.

#### 4. Adjust Mappings (if needed)
- Use the dropdown menus to change any incorrect mappings
- Required fields (marked with *):
  - Employee Name
  - Date
  - Work Order Number
  - Hours OR Clock In/Out times

#### 5. Save Your Mapping (optional but recommended)
- Click **"Save Mapping"**
- Give it a name like "QuickBooks Export" or "Payroll System"
- Next time, just select this profile and skip mapping!

#### 6. Validate
- Click **"Next: Validate Data"**
- Review any errors or warnings
- Click on red rows to see details
- Use **"Edit Row"** to fix simple mistakes

#### 7. Import
- Click **"Import X Entries"**
- Confirm the action
- Wait for completion (usually < 5 seconds)

#### 8. Success!
- See your import statistics
- Option to **"Undo This Import"** if needed
- Or **"Import Another File"** to continue

## Common Scenarios

### Scenario 1: First Time Import

**Your CSV looks like this:**
```csv
Tech Name,Date Worked,Job Number,Total Hours,Notes
John Smith,01/15/2024,WO-2024-001,8.5,Installation
Jane Doe,01/15/2024,WO-2024-002,7.0,Service call
```

**What happens:**
1. Upload file
2. System auto-detects:
   - "Tech Name" → Employee (95% match)
   - "Date Worked" → Date (90% match)
   - "Job Number" → Work Order (88% match)
   - "Total Hours" → Hours (100% match)
   - "Notes" → Notes (100% match)
3. All mappings look good - proceed to validation
4. Both rows valid - import!
5. Save mapping as "Field Reports" for future use

**Time to complete**: 2 minutes

### Scenario 2: Using Saved Profile

**Your CSV from last week's import:**
```csv
Tech Name,Date Worked,Job Number,Total Hours,Notes
Mike Johnson,01/22/2024,WO-2024-003,8.0,Repair
```

**What happens:**
1. Upload file
2. Select "Field Reports" profile (saved last week)
3. Mappings automatically applied
4. Validation shows all good
5. Import immediately

**Time to complete**: 30 seconds

### Scenario 3: Fixing Validation Errors

**Your CSV has a typo:**
```csv
Employee,Date,WO,Hours
Jon Smith,2024-01-15,WO-2024-001,8.5
Jane Doe,2024-01-15,WO-9999,7.0
```

**What happens:**
1. Upload and map columns
2. Validation shows:
   - Row 1: Error - "Jon Smith" not found (closest match: John Smith)
   - Row 2: Error - "WO-9999" not found
3. Click on Row 1 → "Edit Row" → Change to "John Smith"
4. Click on Row 2 → "Edit Row" → Change to "WO-2024-002"
5. System re-validates automatically
6. Both rows now valid - import!

**Time to complete**: 3 minutes

### Scenario 4: Importing Clock Times

**Your CSV has clock in/out instead of hours:**
```csv
Name,Date,Job,In,Out,Break
John Smith,2024-01-15,WO-2024-001,08:00,16:30,30
Jane Doe,2024-01-15,WO-2024-002,09:00,17:00,60
```

**What happens:**
1. System detects In/Out columns
2. Automatically calculates hours:
   - John: 8.5 hours - 0.5 hour break = 8.0 hours
   - Jane: 8.0 hours - 1.0 hour break = 7.0 hours
3. Shows calculated hours in validation
4. Import with accurate time tracking

### Scenario 5: Oops, Wrong File!

**You accidentally imported last month's data:**

**What happens:**
1. Notice the mistake immediately
2. Click **"Undo This Import"** button
3. Confirm rollback
4. System deletes all entries from that import
5. Upload correct file and import again

**No data is lost!**

## Pro Tips

### Tip 1: Save Profiles for Recurring Imports
If you import from the same source regularly:
- Do the mapping once carefully
- Save the profile with a descriptive name
- Future imports are just upload → select profile → import

### Tip 2: Check Sample Data
Before proceeding to validation:
- Look at the sample data under each mapping
- Make sure it's actually showing the right type of data
- Example: If "Date" shows names, something's wrong!

### Tip 3: Use Import History
Before doing a new import:
- Click **"Import History"** to see recent imports
- Verify previous imports went through correctly
- Rollback old mistakes if needed

### Tip 4: Export Template for New Users
If you want others to use a specific format:
- Click **"Download Template"**
- Share that template
- OR save a profile and share the profile name

### Tip 5: Partial Imports Are OK
The system will:
- Show you exactly which rows are valid/invalid
- Let you import just the valid rows
- Save error details for you to review
- You can fix and re-import invalid rows later

## Column Name Recognition

The system recognizes many variations of column names:

### Employee Names
employee, worker, tech, technician, staff, person, name, full name, user, emp, tech name

### Dates
date, day, work date, entry date, shift date, timesheet date

### Work Orders
work order, workorder, wo, job, job number, ticket, service call, wo #, job #

### Hours
hours, hrs, total hours, time, duration, worked hours

### Clock In
clock in, start, start time, begin, in, punch in, time in, check in

### Clock Out
clock out, end, end time, finish, out, punch out, time out, check out

### Break Time
break, breaks, break time, break minutes, lunch, lunch break

### Notes
notes, note, comments, comment, description, memo, remarks, details

## Troubleshooting

### Problem: Column not auto-detected
**Solution**: Manually select the correct column from the dropdown

### Problem: Employee names not matching
**Solution**:
- Check for typos in CSV
- Use the inline editor to fix names
- Or update employee names in the system

### Problem: Work orders not found
**Solution**:
- Verify work order numbers are correct
- Work orders must exist in the system first
- Create missing work orders before importing

### Problem: Date format error
**Solution**: Use YYYY-MM-DD or MM/DD/YYYY format

### Problem: Import took wrong data
**Solution**: Use the "Rollback" button to undo, then re-import correctly

### Problem: CSV won't parse
**Solution**:
- Make sure it's actually a .csv file
- Try opening in Excel and re-saving as CSV
- Check for special characters or corrupted data

## File Format Requirements

### Supported Formats
- CSV (comma-separated)
- CSV with semicolons
- Tab-separated values (TSV)
- Files with quoted fields
- UTF-8 with or without BOM

### Not Supported
- Excel files (.xlsx, .xls) - export to CSV first
- Google Sheets - download as CSV first
- Fixed-width text files - convert to CSV first

### Best Practices
- First row must be headers (column names)
- Don't include blank rows at top or bottom
- Keep it simple - remove formulas, colors, etc.
- One entry per row

## Getting Help

If you're stuck:
1. Check this guide first
2. Try the "Download Template" button to see an example
3. Contact your admin for help with employee or work order matching issues
4. Save your CSV and ask an admin to help with the first import

Once you've done it once, it becomes very easy!
