# How to Fix Validation Errors - Step by Step

When you upload a CSV file, the system validates every row to make sure it can be imported correctly. If there are issues, you now have multiple easy ways to fix them!

## Quick Start: The Fastest Way

### Option 1: Auto-Fix Everything (Recommended)

If you see the **"Auto-Fix All"** button:

1. **Click it** - The system automatically fixes all high-confidence issues
2. **Review** - Check the changes it made (rows turn from red to green)
3. **Import** - Click "Import X Valid Entries"

**Done!** Most issues are fixed in seconds.

---

## Understanding Validation Results

### Green Rows ✅
- Everything is correct
- Ready to import
- No action needed

### Red Rows ❌
- Something needs to be fixed
- Click the row to see details
- Multiple fix options available

---

## Three Ways to Fix Errors

### Method 1: Click Quick Fix Suggestions (Easiest)

When you expand a red row, you'll see blue buttons with suggestions:

**Example - Employee Name Issue:**
```
❌ Employee "Jon Smith" not found

Quick Fix - Employee Name:
[John Smith (92%)] [Joan Smith (68%)]
```

**What to do:**
1. Click the correct name (probably "John Smith (92%)")
2. Row turns green automatically
3. Move to next error or import

**The percentage** shows how close the match is. Higher = more likely correct.

---

### Method 2: Manual Edit (For Complex Fixes)

If you need to change multiple fields or the suggestions aren't right:

1. **Expand the red row** (click on it)
2. **Click "Manual Edit"** at the bottom
3. **Edit any fields** in the form that appears:
   - Employee Name (type or paste)
   - Date (use date picker)
   - Work Order Number
   - Hours
   - Notes
4. **Click "Save Changes"**
5. Row validates automatically

**Use this when:**
- Need to change date or hours
- Suggestions don't show the right option
- Want to add/edit notes
- Multiple fields need fixing

---

### Method 3: Import Valid Rows Only (For Later)

Don't have time to fix everything right now?

1. **Look at the yellow banner** - Shows "Import X valid rows now..."
2. **Click "Import X Valid Entries"**
3. Valid data imports immediately
4. Fix and re-import invalid rows later

**Benefits:**
- Don't lose good data
- Can import most of your file now
- Fix problems when you have more information

---

## Common Validation Errors & Solutions

### Employee Name Not Found

**Error Message:**
```
❌ Employee "Jon Smith" not found
Did you mean: John Smith?
```

**Why This Happens:**
- Typo in the CSV
- Name format different (last name first, nickname, etc.)
- Employee not in system yet

**How to Fix:**
1. **Click the suggested name** if it looks right
2. **Or Manual Edit** to type the exact name from the system
3. **Or add the employee** to the system first, then re-import

**Pro Tip:** The system is smart about name matching. "J Smith", "Smith, John", and "John Smith" will all match if the employee is "John Smith" in the system.

---

### Work Order Not Found

**Error Message:**
```
❌ Work Order "WO-001" not found
Similar: WO-2024-001, WO-2024-010
```

**Why This Happens:**
- Missing year/prefix in CSV
- Typo in work order number
- Work order doesn't exist yet

**How to Fix:**
1. **Click a similar work order** if it's the right one
2. **Or Manual Edit** to enter the correct number
3. **Or create the work order** first, then re-import

**Pro Tip:** Work order numbers must match exactly what's in the system. Check the format!

---

### Date Format Issues

**Error Message:**
```
❌ Invalid date format
```

**Why This Happens:**
- Date in wrong format (needs YYYY-MM-DD or MM/DD/YYYY)
- Invalid date (like February 30th)
- Text instead of date

**How to Fix:**
1. **Click "Manual Edit"**
2. **Use the date picker** to select the correct date
3. **Save changes**

**Pro Tip:** The system accepts both YYYY-MM-DD (2024-02-10) and MM/DD/YYYY (02/10/2024) formats.

---

### Hours Issues

**Error Message:**
```
❌ Hours must be a positive number
OR
⚠️ Hours exceed 24 in a single day
```

**Why This Happens:**
- Text in hours field
- Negative number
- Unrealistic value (>24 hours)

**How to Fix:**
1. **Click "Manual Edit"**
2. **Enter correct hours** (like 8.5 for 8 hours 30 minutes)
3. **Save changes**

**Pro Tip:** Use decimals for partial hours: 7.5 = 7 hours 30 minutes, 8.25 = 8 hours 15 minutes.

---

### Clock In/Out Issues

**Error Message:**
```
❌ Clock out must be after clock in
```

**Why This Happens:**
- Clock out time is before clock in time
- Wrong AM/PM
- Midnight crossing not handled

**How to Fix:**
1. **Click "Manual Edit"**
2. **Check clock in and out times**
3. **Fix the incorrect one**
4. **Save changes**

**Pro Tip:** If someone works past midnight, split into two entries (one for each day).

---

## Step-by-Step Examples

### Example 1: Small File with Few Errors

**Your CSV has:**
- 10 rows total
- 8 valid (green)
- 2 invalid (red)

**Best Approach:**
1. Click each red row to expand
2. Click the quick fix suggestions
3. Import all 10 rows

**Time:** 30 seconds

---

### Example 2: Large File with Many Typos

**Your CSV has:**
- 100 rows total
- 85 valid (green)
- 15 invalid (red) - mostly name typos

**Best Approach:**
1. Click **"Auto-Fix All"** button
2. System fixes 12 automatically
3. Manually fix remaining 3
4. Import all 100 rows

**Time:** 2 minutes

---

### Example 3: Mixed Issues

**Your CSV has:**
- 50 rows total
- 40 valid (green)
- 10 invalid (red) - various issues

**Best Approach:**
1. Import the 40 valid rows now
2. Export the 10 invalid rows (or take screenshot)
3. Fix source data or system records
4. Re-import the 10 rows later

**Time:** 1 minute now, fix later when convenient

---

## Tips & Tricks

### Tip 1: Check Sample Data First
Before uploading, look at your CSV to make sure:
- Employee names match system exactly
- Work orders exist in system
- Dates are in correct format
- Hours are realistic numbers

### Tip 2: Use Auto-Fix First
Always try the "Auto-Fix All" button first. It's usually 90% effective and saves tons of time.

### Tip 3: Fix Source Data
If you're getting the same errors repeatedly, fix your source (payroll system, time tracking, etc.) rather than fixing every import.

### Tip 4: Save Import Profiles
Once you get the column mapping right, save it as a profile. Makes future imports instant!

### Tip 5: Import Partial Data
Don't let a few bad rows stop you. Import the good data immediately and fix problems later.

### Tip 6: Higher Percentage = More Likely
When you see suggestions like "John Smith (92%)", the percentage is how confident the system is. 90%+ is almost always correct.

### Tip 7: Expand All Errors
Want to see all errors at once? Click each red row to expand. Review all issues before starting fixes.

### Tip 8: Fix Similar Issues Together
If you have 5 rows with the same employee name typo, use "Auto-Fix All" - it fixes them all at once!

---

## What If Nothing Works?

If you can't fix the errors:

1. **Check if records exist**
   - Are employees in the system?
   - Do work orders exist?
   - Are they spelled exactly right?

2. **Export and review**
   - Take screenshot of errors
   - Check your original source data
   - Ask admin for help

3. **Import partial data**
   - Import what's valid
   - Come back to invalid rows later

4. **Contact support**
   - Show them the error messages
   - They can help identify issues
   - Might be a system configuration problem

---

## Success Checklist

Before clicking "Import":

- ✅ All rows are green OR
- ✅ You've decided to import valid rows only
- ✅ You've reviewed any auto-fixes made
- ✅ You understand what was changed

After importing:

- ✅ Check import confirmation
- ✅ Verify count matches expectations
- ✅ Spot check a few entries
- ✅ Can rollback if needed (see Import History)

---

## Remember

- **Red rows don't block you** - You can import green rows anytime
- **Auto-Fix is smart** - Trust high-percentage suggestions
- **Multiple fix options** - Choose what's easiest for you
- **It's okay to import partially** - Fix problems later if needed
- **Rollback is available** - Can undo if something goes wrong

The validation system is designed to help you, not block you. With these tools, you should be able to handle any CSV import quickly and confidently!
