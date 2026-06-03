/*
  # Add Proposal Modifiers System

  1. New Columns
    - `discount_percent` (numeric) - Discount percentage to apply to subtotal
    - `discount_amount` (numeric) - Calculated discount amount
    - `project_management_percent` (numeric) - Project management fee percentage
    - `project_management_amount` (numeric) - Calculated PM amount
    - `project_design_percent` (numeric) - Design fee percentage
    - `project_design_amount` (numeric) - Calculated design amount
    - `custom_modifier_1_label` (text) - Custom modifier label
    - `custom_modifier_1_percent` (numeric) - Custom modifier 1 percentage
    - `custom_modifier_1_amount` (numeric) - Custom modifier 1 amount
    - `custom_modifier_2_label` (text) - Custom modifier 2 label
    - `custom_modifier_2_percent` (numeric) - Custom modifier 2 percentage
    - `custom_modifier_2_amount` (numeric) - Custom modifier 2 amount

  2. Notes
    - All modifier percentages can be positive (add to total) or negative (subtract from total)
    - Discount is typically negative
    - PM and design fees are typically positive
    - Custom modifiers can be either direction
*/

-- Add modifier columns to proposals table
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_management_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_management_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_design_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_design_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_modifier_1_label text,
  ADD COLUMN IF NOT EXISTS custom_modifier_1_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_modifier_1_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_modifier_2_label text,
  ADD COLUMN IF NOT EXISTS custom_modifier_2_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_modifier_2_amount numeric DEFAULT 0;