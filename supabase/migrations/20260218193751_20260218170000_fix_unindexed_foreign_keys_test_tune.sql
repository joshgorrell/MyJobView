/*
  # Fix Unindexed Foreign Keys on test_tune Tables

  ## Summary
  Adds covering indexes for foreign key columns on test_tune tables that were
  missing indexes. Without these, JOIN operations and FK constraint checks
  perform full table scans.

  ## Missing Indexes Added
  - test_tune_bonus_calculations.overridden_by (FK to profiles)
  - test_tune_bonus_overrides.created_by (FK to profiles)
  - test_tune_bonus_overrides.approved_by (FK to profiles)
  - test_tune_bonus_overrides.bonus_calculation_id (FK to calculations)
  - test_tune_elr_override_log.changed_by (FK to profiles)
  - test_tune_elr_override_log.organization_id (FK to organizations)
  - test_tune_field_target_history.recalculated_by (FK to profiles)
  - test_tune_settings_history.changed_by (FK to profiles)
*/

CREATE INDEX IF NOT EXISTS idx_test_tune_bonus_calculations_overridden_by
  ON test_tune_bonus_calculations(overridden_by);

CREATE INDEX IF NOT EXISTS idx_test_tune_bonus_overrides_created_by
  ON test_tune_bonus_overrides(created_by);

CREATE INDEX IF NOT EXISTS idx_test_tune_bonus_overrides_approved_by
  ON test_tune_bonus_overrides(approved_by);

CREATE INDEX IF NOT EXISTS idx_test_tune_bonus_overrides_bonus_calculation_id
  ON test_tune_bonus_overrides(bonus_calculation_id);

CREATE INDEX IF NOT EXISTS idx_test_tune_elr_override_log_changed_by
  ON test_tune_elr_override_log(changed_by);

CREATE INDEX IF NOT EXISTS idx_test_tune_elr_override_log_organization_id
  ON test_tune_elr_override_log(organization_id);

CREATE INDEX IF NOT EXISTS idx_test_tune_field_target_history_recalculated_by
  ON test_tune_field_target_history(recalculated_by);

CREATE INDEX IF NOT EXISTS idx_test_tune_settings_history_changed_by
  ON test_tune_settings_history(changed_by);
