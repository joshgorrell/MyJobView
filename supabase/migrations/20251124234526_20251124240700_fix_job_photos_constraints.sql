/*
  # Fix Job Photos Constraints
  
  Adjusts check constraints on job_photos table to be more practical.
  
  ## Changes
  - Remove minimum caption length requirement (was 20 chars, too strict)
  - Add 'general' to allowed category values
  - Add 'progress' and 'completed' to allowed category values
  
  ## Reasoning
  - Users should be able to write short, descriptive captions
  - 'general' is now the default category
  - More category options for flexibility
*/

-- Drop the overly strict caption length constraint
ALTER TABLE public.job_photos 
  DROP CONSTRAINT IF EXISTS job_photos_caption_length_check;

-- Drop the old category constraint
ALTER TABLE public.job_photos 
  DROP CONSTRAINT IF EXISTS job_photos_category_check;

-- Add new category constraint with all valid options
ALTER TABLE public.job_photos
  ADD CONSTRAINT job_photos_category_check 
  CHECK (
    category IS NULL OR 
    category = ANY (ARRAY[
      'before'::text, 
      'during'::text, 
      'after'::text, 
      'progress'::text,
      'completed'::text,
      'issue'::text, 
      'solution'::text, 
      'parts'::text,
      'general'::text,
      'other'::text
    ])
  );