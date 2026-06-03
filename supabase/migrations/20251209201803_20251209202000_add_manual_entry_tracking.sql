/*
  # Add Manual Entry Tracking to Security Contracts

  1. Changes
    - Add `completed_by_staff` boolean field to track contracts manually entered by staff
    - Allows staff to complete contracts on behalf of customers who need assistance
    
  2. Notes
    - When true, indicates contract was filled out by staff, not through customer portal
    - Still maintains all same data requirements and validation
*/

ALTER TABLE security_contracts
ADD COLUMN IF NOT EXISTS completed_by_staff boolean DEFAULT false;