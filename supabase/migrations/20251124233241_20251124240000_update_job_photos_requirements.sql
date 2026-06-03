/*
  # Update Job Photos Requirements
  
  Changes photo upload requirements to support both standalone and work-order-linked uploads.
  
  ## Changes
  - Make work_order_id optional (allow NULL)
  - Make category optional with default value
  - Make caption required (NOT NULL)
  - Add photo_upload_points to company_settings (default 1 point)
  
  ## Reasoning
  - Photos can be uploaded standalone or from work orders
  - Caption is always required for context
  - Category can be inferred or set to default
  - Admin can configure point rewards
*/

-- Make work_order_id nullable
ALTER TABLE public.job_photos 
  ALTER COLUMN work_order_id DROP NOT NULL;

-- Make category nullable with default
ALTER TABLE public.job_photos 
  ALTER COLUMN category DROP NOT NULL,
  ALTER COLUMN category SET DEFAULT 'general';

-- Ensure caption is required (already NOT NULL, but let's be explicit)
ALTER TABLE public.job_photos 
  ALTER COLUMN caption SET NOT NULL;

-- Add photo upload points setting to company_settings
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'company_settings' 
      AND column_name = 'photo_upload_points'
  ) THEN
    ALTER TABLE public.company_settings 
      ADD COLUMN photo_upload_points integer DEFAULT 1 NOT NULL;
  END IF;
END $$;