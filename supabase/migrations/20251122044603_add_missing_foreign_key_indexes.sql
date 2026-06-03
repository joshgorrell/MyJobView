/*
  # Add Missing Foreign Key Indexes for Performance

  1. Purpose
    - Add indexes to foreign key columns that are missing them
    - Improves query performance for joins and lookups
    - Prevents table scan on foreign key lookups

  2. Tables Updated
    - invoices (tax_jurisdiction_id)
    - pending_punchlist_invites (reviewed_by)
    - proposals (tax_jurisdiction_id)
    - punchlist_task_photos (uploaded_by)
    - punchlist_tasks (completed_by)
    - serial_lot_tracking (bin_id, reserved_for_proposal_id)
    - stock_reservations (proposal_line_item_id, reserved_by)
    - tax_exemption_certificates (verified_by)
    - user_permission_overrides (created_by)
*/

-- Add index for invoices.tax_jurisdiction_id
CREATE INDEX IF NOT EXISTS idx_invoices_tax_jurisdiction_id 
ON invoices(tax_jurisdiction_id);

-- Add index for pending_punchlist_invites.reviewed_by
CREATE INDEX IF NOT EXISTS idx_pending_invites_reviewed_by 
ON pending_punchlist_invites(reviewed_by);

-- Add index for proposals.tax_jurisdiction_id
CREATE INDEX IF NOT EXISTS idx_proposals_tax_jurisdiction_id 
ON proposals(tax_jurisdiction_id);

-- Add index for punchlist_task_photos.uploaded_by
CREATE INDEX IF NOT EXISTS idx_punchlist_photos_uploaded_by 
ON punchlist_task_photos(uploaded_by);

-- Add index for punchlist_tasks.completed_by
CREATE INDEX IF NOT EXISTS idx_punchlist_tasks_completed_by 
ON punchlist_tasks(completed_by);

-- Add index for serial_lot_tracking.bin_id
CREATE INDEX IF NOT EXISTS idx_serial_tracking_bin_id 
ON serial_lot_tracking(bin_id);

-- Add index for serial_lot_tracking.reserved_for_proposal_id
CREATE INDEX IF NOT EXISTS idx_serial_tracking_reserved_proposal 
ON serial_lot_tracking(reserved_for_proposal_id);

-- Add index for stock_reservations.proposal_line_item_id
CREATE INDEX IF NOT EXISTS idx_stock_reservations_line_item 
ON stock_reservations(proposal_line_item_id);

-- Add index for stock_reservations.reserved_by
CREATE INDEX IF NOT EXISTS idx_stock_reservations_reserved_by 
ON stock_reservations(reserved_by);

-- Add index for tax_exemption_certificates.verified_by
CREATE INDEX IF NOT EXISTS idx_tax_exemption_verified_by 
ON tax_exemption_certificates(verified_by);

-- Add index for user_permission_overrides.created_by
CREATE INDEX IF NOT EXISTS idx_user_permission_created_by 
ON user_permission_overrides(created_by);

COMMENT ON INDEX idx_invoices_tax_jurisdiction_id IS 'Improves lookup performance for invoice tax jurisdiction';
COMMENT ON INDEX idx_pending_invites_reviewed_by IS 'Improves lookup performance for punchlist invite reviewer';
COMMENT ON INDEX idx_proposals_tax_jurisdiction_id IS 'Improves lookup performance for proposal tax jurisdiction';
COMMENT ON INDEX idx_punchlist_photos_uploaded_by IS 'Improves lookup performance for punchlist photo uploader';
COMMENT ON INDEX idx_punchlist_tasks_completed_by IS 'Improves lookup performance for punchlist task completer';
COMMENT ON INDEX idx_serial_tracking_bin_id IS 'Improves lookup performance for serial tracking bin location';
COMMENT ON INDEX idx_serial_tracking_reserved_proposal IS 'Improves lookup performance for reserved serial numbers';
COMMENT ON INDEX idx_stock_reservations_line_item IS 'Improves lookup performance for stock reservation line items';
COMMENT ON INDEX idx_stock_reservations_reserved_by IS 'Improves lookup performance for stock reservation user';
COMMENT ON INDEX idx_tax_exemption_verified_by IS 'Improves lookup performance for tax exemption verifier';
COMMENT ON INDEX idx_user_permission_created_by IS 'Improves lookup performance for permission override creator';
