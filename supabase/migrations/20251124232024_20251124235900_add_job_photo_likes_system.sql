/*
  # Add Job Photo Likes System
  
  Creates a system for users to like job photos and track photo popularity.
  
  ## New Tables
  - `job_photo_likes` - Tracks which users liked which photos
    - `id` (uuid, primary key)
    - `photo_id` (uuid, references job_photos)
    - `user_id` (uuid, references profiles)
    - `created_at` (timestamptz)
  
  ## Changes
  - Adds unique constraint to prevent duplicate likes
  - Creates indexes for performance
  - Sets up RLS policies for authenticated users
  
  ## Security
  - Users can like/unlike photos
  - Users can view all likes
  - System tracks like counts efficiently
*/

-- Create job_photo_likes table
CREATE TABLE IF NOT EXISTS public.job_photo_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.job_photos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(photo_id, user_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_job_photo_likes_photo_id ON public.job_photo_likes(photo_id);
CREATE INDEX IF NOT EXISTS idx_job_photo_likes_user_id ON public.job_photo_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_job_photo_likes_created_at ON public.job_photo_likes(created_at DESC);

-- Enable RLS
ALTER TABLE public.job_photo_likes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view all photo likes"
  ON public.job_photo_likes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can like photos"
  ON public.job_photo_likes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can unlike their own likes"
  ON public.job_photo_likes
  FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Create view for photo statistics
CREATE OR REPLACE VIEW public.job_photo_stats AS
SELECT 
  jp.id,
  jp.work_order_id,
  jp.technician_id,
  jp.photo_url,
  jp.caption,
  jp.category,
  jp.taken_at,
  jp.created_at,
  p.full_name as technician_name,
  COUNT(DISTINCT jpl.id) as like_count
FROM public.job_photos jp
LEFT JOIN public.profiles p ON p.id = jp.technician_id
LEFT JOIN public.job_photo_likes jpl ON jpl.photo_id = jp.id
GROUP BY jp.id, jp.work_order_id, jp.technician_id, jp.photo_url, jp.caption, jp.category, jp.taken_at, jp.created_at, p.full_name;

-- Grant access to view
GRANT SELECT ON public.job_photo_stats TO authenticated;