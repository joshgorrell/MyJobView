/*
  # Clean up temperature field for customer records

  1. Data Cleanup
    - Set temperature to NULL for all customer records (contacts where is_prospect = false AND contact_type != 'lead')
    - Temperature should only be tracked for prospects and leads

  2. Notes
    - This ensures temperature tracking is only used for active sales prospects and leads
    - Customers don't need temperature tracking as they've already converted
*/

-- Remove temperature from customer records (not prospects, not leads)
UPDATE contacts 
SET temperature = NULL 
WHERE is_prospect = false 
  AND contact_type != 'lead';
