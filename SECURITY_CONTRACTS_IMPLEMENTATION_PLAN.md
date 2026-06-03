# Security Contracts & Onboarding System - Implementation Plan

## Overview
A comprehensive security contracts management system integrated with the Finance Department, enabling digital contract creation, customer onboarding, signature collection, and recurring billing setup.

## System Architecture

### Phase 1: Core Contract Management
**Module Location**: Finance Department > Security Contracts
**Access**: Admin, Finance roles

#### Database Schema
1. **security_contract_templates** - Master contract templates
   - id, name, version, content (JSONB for sections), is_active
   - Fields configuration (which fields are required, optional, pre-fillable)

2. **security_contracts** - Active contracts
   - id, template_id, contact_id, contract_number
   - status (draft, pending_signature, active, cancelled, expired)
   - pre_filled_data (JSONB), customer_filled_data (JSONB)
   - signature_data (JSONB), signed_at, signed_by_ip
   - created_by, assigned_to, office_id

3. **contract_sections** - Organized contract content
   - id, template_id, section_name, order, content_type
   - pre_fillable_fields (JSONB array), customer_fields (JSONB array)

4. **contract_signatures** - Digital signature tracking
   - id, contract_id, signer_name, signer_email
   - signature_image_url, signed_at, ip_address, device_info

### Phase 2: Customer Onboarding Portal
**Public Access**: Unique invite links only
**Module**: Security Onboarding (Portal User accessible)

#### Features
- Secure magic link email invitations
- Multi-step onboarding wizard:
  1. Review pre-filled information
  2. Complete required fields
  3. Review terms and conditions
  4. Digital signature capture
  5. Recurring billing setup (optional)
  6. Confirmation & welcome

#### Database Additions
1. **contract_invites** - Invitation tracking
   - id, contract_id, token (unique), email
   - status (pending, opened, completed, expired)
   - sent_at, opened_at, completed_at, expires_at

2. **onboarding_progress** - Track customer progress
   - id, contract_id, current_step, completed_steps (JSONB)
   - last_activity_at

### Phase 3: Recurring Billing Integration
**Integration Points**:
- Links with existing Recur module
- Auto-creates subscription upon contract activation

#### Workflow
1. Contract signed → Trigger billing setup
2. Create recurring plan from contract terms
3. Link subscription to contract_id
4. Enable customer portal access for billing management

### Phase 4: Contract Management Features
**Admin Tools**:
- Version control for templates
- Bulk contract generation
- Contract renewal automation
- Cancellation workflow with reason tracking
- Reporting & analytics

## Form Field Categories

### Pre-Fill Fields (Admin completes before sending)
**Company Information**:
- Company name, address, phone, email, license numbers
- Authorized signatory details

**Customer Information** (from existing contact):
- Customer name, property address, phone, email
- Existing account details if applicable

**System Details**:
- Equipment list, monitoring services
- Installation date, system specifications

**Pricing & Terms**:
- Monthly monitoring fee
- Installation charges
- Contract term length
- Auto-renewal terms

### Customer-Fill Fields
**Verification**:
- Confirm property address
- Emergency contact information
- Phone numbers for alarm response

**Authorization**:
- Permit/account numbers
- Special instructions
- Key holder information

**Payment**:
- Billing method selection
- Payment information (if recurring billing)
- Authorized user for billing

**Legal**:
- Acknowledgment of terms
- Equipment ownership agreement
- Limitation of liability acceptance

## Email Templates Needed
1. **contract_invitation** - Initial invite with magic link
2. **contract_reminder** - Follow-up if not completed
3. **contract_signed** - Confirmation to customer
4. **contract_activated** - Welcome email with portal access
5. **contract_renewal** - Renewal notice
6. **contract_cancelled** - Cancellation confirmation

## Permissions & Access Control

### Role Permissions
- **Admin**: Full access to all contracts, templates, settings
- **Finance**: Create, edit, send contracts; view all contracts
- **Sales**: View assigned contracts only; send invitations
- **Portal User**: Access their own contracts only (read-only after signing)

### Security Features
- Unique token-based access (no login required for signing)
- IP address logging for signatures
- Audit trail for all contract actions
- Encrypted storage of signature images
- Contract PDF generation with tamper-proof sealing

## Integration Points

### Existing System Connections
1. **Contacts Module**: Source customer data for pre-filling
2. **Recur Module**: Auto-create subscriptions from signed contracts
3. **Projects Module**: Link contracts to installation projects
4. **Portal**: Customer access for viewing signed contracts
5. **Email System**: Automated workflow communications
6. **Notifications**: Real-time alerts for contract actions

## UI/UX Considerations

### Admin Interface
- Grid view of all contracts with filtering
- Quick actions: Send, Resend, Cancel, View PDF
- Contract builder with drag-and-drop sections
- Preview mode showing customer view
- Signature verification display

### Customer Portal
- Clean, professional onboarding experience
- Progress indicator for multi-step process
- Mobile-responsive signature pad
- Auto-save progress
- Clear error messaging and validation

## Technical Requirements

### Storage
- Storage bucket: `contract-signatures` for signature images
- Storage bucket: `contract-pdfs` for generated PDFs

### Edge Functions
- `send-contract-invitation` - Send magic link emails
- `generate-contract-pdf` - Create PDF from signed contract
- `verify-contract-token` - Validate invitation tokens
- `process-contract-signature` - Handle signature submission

### Frontend Components
- `SecurityContractsView.tsx` - Main admin interface
- `ContractBuilder.tsx` - Template and contract creation
- `ContractInviteManager.tsx` - Send and track invitations
- `CustomerOnboardingPortal.tsx` - Public onboarding flow
- `SignaturePad.tsx` - Digital signature capture (exists)
- `ContractPDFViewer.tsx` - Display generated PDFs

## Migration Strategy

### Database Migration Order
1. Create contract templates and base tables
2. Add contract invites and progress tracking
3. Create storage buckets
4. Add RLS policies
5. Create edge functions
6. Add module to Finance department navigation
7. Seed default contract template

### Data Migration
- Import existing contract templates as JSON
- Convert field definitions to JSONB schema
- Set up default email templates

## Success Metrics
- Time to send contract: < 2 minutes
- Customer completion rate: Target 80%+
- Average time to signature: < 24 hours
- Contract search/retrieval: < 3 seconds
- Zero data loss or security incidents

## Future Enhancements (Post-MVP)
- E-signature via DocuSign/HelloSign integration
- Multiple signer support (co-signers)
- Contract addendum system
- Automated renewal workflow
- Contract analytics dashboard
- Mobile app for field contract signing
- Bulk renewal processing
- Contract expiration alerts with auto-renewal
