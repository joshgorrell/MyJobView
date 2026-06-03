# CSV Format Examples - All Supported

The smart CSV import can now handle all these formats (and more!). No need to convert or reformat your exports anymore.

## Example 1: Standard Format (Recommended)

```csv
Employee Name,Date,Work Order Number,Hours,Notes
John Doe,2024-02-10,WO-2024-001,8.5,Worked on installation
Jane Smith,2024-02-10,WO-2024-002,7.0,Service call
```

**Auto-Detection Results:**
- Employee Name → employee (100% confidence)
- Date → date (100% confidence)
- Work Order Number → workOrder (100% confidence)
- Hours → hours (100% confidence)
- Notes → notes (100% confidence)

✅ Perfect match - ready to import immediately

---

## Example 2: Clock In/Out Format

```csv
Tech,Date,Job #,Start Time,End Time,Break (minutes),Comments
John Doe,01/15/2024,WO-2024-001,08:00,16:30,30,Installation work
Jane Smith,01/15/2024,WO-2024-002,09:00,17:00,60,Service visit
```

**Auto-Detection Results:**
- Tech → employee (95% confidence)
- Date → date (100% confidence)
- Job # → workOrder (88% confidence)
- Start Time → clockIn (90% confidence)
- End Time → clockOut (90% confidence)
- Break (minutes) → breakMinutes (100% confidence)
- Comments → notes (85% confidence)

✅ High confidence - system calculates hours automatically
- John: 8.5 hours - 0.5 break = 8.0 hours worked
- Jane: 8.0 hours - 1.0 break = 7.0 hours worked

---

## Example 3: Minimal Format (Required Fields Only)

```csv
Name,Date,WO,Hrs
John Doe,2024-02-10,WO-2024-001,8
Jane Smith,2024-02-10,WO-2024-002,7.5
```

**Auto-Detection Results:**
- Name → employee (95% confidence)
- Date → date (100% confidence)
- WO → workOrder (100% confidence)
- Hrs → hours (95% confidence)

✅ All required fields detected - ready to import

---

## Example 4: Payroll Software Export

```csv
Worker ID,Employee Full Name,Shift Date,Job Number,Total Hours Worked,Break Time,Additional Notes
1234,Doe, John,02/10/2024,WO-2024-001,8.5,0,Installation at customer site
5678,"Smith, Jane",02/10/2024,WO-2024-002,7.0,30,"Service call, resolved issue"
```

**Features Demonstrated:**
- ✅ Quoted fields with commas inside ("Smith, Jane")
- ✅ Extra columns ignored (Worker ID)
- ✅ Unusual column names (Employee Full Name, Total Hours Worked)
- ✅ Various date formats (MM/DD/YYYY)

**Auto-Detection Results:**
- Employee Full Name → employee (90% confidence)
- Shift Date → date (95% confidence)
- Job Number → workOrder (100% confidence)
- Total Hours Worked → hours (88% confidence)
- Additional Notes → notes (85% confidence)

✅ Successfully handles complex real-world format

---

## Example 5: Semicolon Delimiter (European)

```csv
Technician;Work Date;Work Order;Hours;Remarks
John Doe;10.02.2024;WO-2024-001;8,5;Installation
Jane Smith;10.02.2024;WO-2024-002;7,0;Service
```

**Features Demonstrated:**
- ✅ Semicolon delimiter auto-detected
- ✅ Decimal comma (8,5) in hours field
- ✅ Different date format (DD.MM.YYYY)

**Note**: System will auto-detect delimiter but you may need to manually adjust date format validation

---

## Example 6: Tab-Separated Values

```csv
Tech	Date	Job	Punch In	Punch Out
John Doe	2024-02-10	WO-2024-001	08:00 AM	04:30 PM
Jane Smith	2024-02-10	WO-2024-002	09:00 AM	05:00 PM
```

**Features Demonstrated:**
- ✅ Tab delimiter auto-detected
- ✅ 12-hour time format with AM/PM
- ✅ Abbreviated column names

**Auto-Detection Results:**
- Tech → employee (100% confidence)
- Date → date (100% confidence)
- Job → workOrder (95% confidence)
- Punch In → clockIn (95% confidence)
- Punch Out → clockOut (95% confidence)

✅ Calculates hours from time ranges

---

## Example 7: Verbose Column Names

```csv
Technician Employee Name,Date of Work Performed,Work Order or Service Call Number,Total Hours on Job,Break Time in Minutes,Notes and Comments
John Doe,February 10th 2024,WO-2024-001,8.5,30,Completed installation project
Jane Smith,February 10th 2024,WO-2024-002,7.0,60,Service call successfully resolved
```

**Features Demonstrated:**
- ✅ Long descriptive column names
- ✅ Date spelled out (February 10th 2024)
- ✅ All keywords matched despite verbose names

**Note**: Date format "February 10th 2024" may need manual date entry in YYYY-MM-DD or MM/DD/YYYY format

---

## Example 8: QuickBooks Time Export

```csv
Name,Date,Service Item,Duration,Note
Doe John,2/10/2024,WO-2024-001,8:30,Installation
Smith Jane,2/10/2024,WO-2024-002,7:00,Service
```

**Features Demonstrated:**
- ✅ Last name first format (fuzzy matching handles this)
- ✅ Short date format (M/D/YYYY)
- ✅ Time duration format (H:MM)
- ✅ "Service Item" maps to work order

**Auto-Detection Results:**
- Name → employee (100% confidence) - fuzzy match handles "Doe John"
- Date → date (100% confidence)
- Service Item → workOrder (75% confidence) - may need manual verification
- Duration → hours (80% confidence) - parses "8:30" as 8.5 hours
- Note → notes (100% confidence)

⚠️ Medium confidence on some fields - review mapping before import

---

## Example 9: Messy Real-World Data

```csv
"Employee","Date  ","Work Order #","Total Time","Notes"
"Doe, John  ",01/15/2024,WO-2024-001,8.5,"Installation - completed successfully"
Jane Smith,01/15/2024,  WO-2024-002  ,7,"Service call, fixed pump"
```

**Features Demonstrated:**
- ✅ Extra spaces in headers and values (auto-trimmed)
- ✅ Quoted and unquoted fields mixed
- ✅ Spaces around work order numbers
- ✅ Commas in notes field

**System Handles:**
- Trims all whitespace automatically
- Parses quotes correctly
- Normalizes work order numbers

✅ "Messy" data cleaned automatically

---

## Example 10: Multiple Jobs Per Day

```csv
Employee,Date,Job,Hours
John Doe,2024-02-10,WO-2024-001,4.0
John Doe,2024-02-10,WO-2024-002,4.5
Jane Smith,2024-02-10,WO-2024-003,8.0
```

**Features Demonstrated:**
- ✅ Multiple rows for same employee on same day
- ✅ Each job tracked separately
- ✅ Total daily hours calculated by system

✅ Perfect for tracking time across multiple work orders

---

## What Makes These All Work?

### Smart Features

1. **Delimiter Detection**: Comma, semicolon, tab, or pipe
2. **Fuzzy Column Matching**: Recognizes many name variations
3. **Whitespace Handling**: Trims all extra spaces
4. **Quote Parsing**: Handles quoted fields with commas inside
5. **Name Matching**: Fuzzy match for employee names (handles typos)
6. **Multiple Date Formats**: YYYY-MM-DD, MM/DD/YYYY, and more
7. **Time Formats**: 24-hour, 12-hour with AM/PM, duration format
8. **Hours Calculation**: From times or direct hours entry

### Validation Features

1. **Employee Lookup**: Finds closest match if name not exact
2. **Work Order Verification**: Confirms work order exists
3. **Date Validation**: Ensures valid date format
4. **Hours Validation**: Checks for realistic values (< 24 per day)
5. **Time Logic**: Ensures clock out is after clock in

### Error Recovery

1. **Inline Editing**: Fix errors before import
2. **Partial Import**: Import valid rows, skip invalid ones
3. **Detailed Errors**: Shows exactly what's wrong with each row
4. **Rollback**: Undo any import with one click

---

## Creating Your Own Format

Your CSV just needs these required columns (can be named anything):

### Required
1. **Employee identifier** - Any variation of: employee, worker, tech, name, etc.
2. **Date** - Date format: YYYY-MM-DD or MM/DD/YYYY
3. **Work order** - Work order number in your system
4. **Hours** - Either:
   - Total hours (decimal: 8.5)
   - OR Clock in + Clock out times

### Optional
- Break time (in minutes)
- Notes/comments
- Any other columns (will be ignored)

The system will figure out the rest!

---

## Converting Problem Formats

### If You Have Excel (.xlsx)
1. Open in Excel
2. File → Save As
3. Choose "CSV (Comma delimited)"
4. Upload the .csv file

### If You Have Google Sheets
1. Open your sheet
2. File → Download → Comma-separated values (.csv)
3. Upload the downloaded file

### If You Have Fixed-Width Text
1. Open in Excel
2. Use "Text to Columns" feature
3. Save as CSV
4. Upload the .csv file

---

## Tips for Best Results

### DO:
✅ Use clear column headers in first row
✅ Keep employee names consistent with system records
✅ Use work order numbers that exist in the system
✅ Include all data in one file if possible
✅ Save your mapping profile for reuse

### DON'T:
❌ Include blank rows at the top
❌ Use formulas in cells
❌ Include subtotal or summary rows
❌ Mix different date formats in same column
❌ Forget to verify mappings before importing

---

## Need Help?

If your format isn't working:
1. Try the "Download Template" button for a working example
2. Check that your first row has column names (headers)
3. Verify required data is present
4. Review the mapping step carefully
5. Contact an admin for help with employee name matching

Remember: Once you've successfully imported from a format once, save the profile and future imports will be instant!
