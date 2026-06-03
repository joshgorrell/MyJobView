# Streamlined Proposal Sending with Pre-Send Validation

## Overview

The proposal sending process has been completely redesigned to eliminate confusion and redundancy. The new system uses a validation checklist approach that ensures all required settings are configured before a proposal can be sent to customers.

## Key Features

### 1. Visual Completion Indicators on Settings Tabs

Each settings tab now displays a real-time status indicator:

- **Green Checkmark** - Section is valid and has been reviewed
- **Yellow Eye Icon** - Section is valid but needs review
- **Red Alert Icon** - Section has validation errors that must be fixed

Tabs that require validation:
- Details (title, customer, email)
- Scope of Work (line items, scope description)
- Contract (contract template selected)
- Billing (deposit configuration)
- Tax (tax environment and project type)
- Fees & Modifiers (reviewed by user)

### 2. Proposal Readiness Progress Bar

A progress bar at the top of Proposal Settings shows overall readiness:
- Displays completion percentage (0-100%)
- Shows "Ready to send" badge when all sections are complete
- Updates in real-time as sections are reviewed

### 3. Pre-Send Validation Modal

When clicking "Send" on a proposal, a new validation modal appears showing:

- **Checklist View**: All six required sections with status indicators
- **Section Summaries**: Quick synopsis of what's configured in each section
- **Quick Edit**: Click any section name to jump directly to that tab in Settings
- **Approval Window**: Select expiration period (7-90 days, default 30)
- **Smart Validation**: Can't send until all sections are validated

### 4. Automatic Review Tracking

- Sections are automatically marked as "reviewed" when saved
- Database tracks last review timestamp for each section
- Changes to settings mark sections as needing re-review
- Existing proposals are marked as reviewed for backwards compatibility

### 5. Intelligent Send Button

The Send button now includes a readiness badge:
- Shows completion percentage next to button
- Green badge when ready, yellow when incomplete
- Helpful tooltip explaining what's needed
- Prompts user to review settings if not ready

## How It Works

### For Users Creating New Proposals

1. Create proposal and add line items as usual
2. Click Settings to configure proposal
3. See progress bar showing what needs attention
4. Complete each section (tabs show green checkmarks when done)
5. Click Send button when 100% complete
6. Review pre-send checklist and confirm
7. Proposal is sent with all required information

### Validation Rules

Each section has specific requirements:

**Details**
- Must have proposal title
- Must have customer selected
- Customer must have email address

**Scope of Work**
- Must have at least one line item
- Scope description recommended but not required

**Contract**
- Must have contract template selected

**Billing**
- Must specify if deposit is required
- Must specify deposit type
- If deposit required, must have valid amount/percentage

**Tax**
- Must specify tax environment (residential/commercial)
- Must specify project type

**Fees & Modifiers**
- Automatically valid (can have zero values)
- Must be explicitly reviewed by user

### Database Schema

New columns added to `proposal_settings`:
- `details_reviewed_at` - Timestamp when Details was last reviewed
- `scope_reviewed_at` - Timestamp when Scope was last reviewed
- `contract_reviewed_at` - Timestamp when Contract was last reviewed
- `billing_reviewed_at` - Timestamp when Billing was last reviewed
- `tax_reviewed_at` - Timestamp when Tax was last reviewed
- `fees_reviewed_at` - Timestamp when Fees was last reviewed
- `is_ready_to_send` - Boolean flag indicating overall readiness

New functions:
- `calculate_proposal_readiness()` - Determines if proposal meets all criteria
- `mark_settings_section_reviewed()` - Marks a section as reviewed

### Technical Implementation

**Files Created:**
- `src/lib/proposalValidation.ts` - Core validation logic and types
- `src/components/Proposals/PreSendValidationModal.tsx` - Pre-send checklist modal

**Files Modified:**
- `src/components/Proposals/ProposalSettings.tsx` - Added validation indicators to tabs
- `src/components/Proposals/ProposalBuilderCompact.tsx` - Integrated validation system

**Database Migration:**
- `supabase/migrations/20260217200000_add_proposal_readiness_validation_tracking.sql`

## Benefits

1. **No More Confusion**: Clear visual feedback shows what's complete
2. **No More Redundancy**: Settings configured once in Settings, verified at send
3. **Quality Assurance**: Ensures complete proposals every time
4. **Better UX**: Users know exactly what's needed before sending
5. **Backwards Compatible**: Existing proposals work without changes

## User Workflow Example

```
1. User creates proposal → Sees 0% complete
2. Adds customer and title → Details shows green checkmark
3. Adds line items → Scope shows green checkmark
4. Selects contract → Contract shows green checkmark
5. Configures deposit → Billing shows green checkmark
6. Sets tax settings → Tax shows green checkmark
7. Reviews fees → Fees shows green checkmark
8. Progress bar shows 100% → "Ready to send" badge appears
9. Clicks Send → Pre-send modal shows all green checkmarks
10. Reviews settings summary and confirms → Proposal sent!
```

## Default Behavior

- New proposals have default contract, deposit, and tax settings applied
- Users must explicitly review each section before sending
- System prevents sending incomplete proposals
- Clear guidance provided for incomplete sections
- Users can override and send anyway through Settings
