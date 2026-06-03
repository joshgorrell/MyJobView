/*
  # Fix set_default_descriptions trigger function

  1. Changes
    - Remove reference to non-existent item_name column
    - Keep sales_description and purchase_description logic only

  2. Details
    - The trigger was checking for item_name column which was removed
    - This was causing all product updates to fail
*/

CREATE OR REPLACE FUNCTION set_default_descriptions()
RETURNS TRIGGER AS $$
BEGIN
  -- Copy description to sales_description if sales_description is empty
  IF NEW.sales_description IS NULL AND NEW.description IS NOT NULL THEN
    NEW.sales_description := NEW.description;
  END IF;
  
  -- Copy sales_description to purchase_description if purchase_description is empty
  IF NEW.purchase_description IS NULL AND NEW.sales_description IS NOT NULL THEN
    NEW.purchase_description := NEW.sales_description;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
