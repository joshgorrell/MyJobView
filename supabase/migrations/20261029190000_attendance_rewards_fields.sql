ALTER TABLE public.points_configuration ADD COLUMN IF NOT EXISTS attendance_early_points integer DEFAULT 10;
ALTER TABLE public.points_configuration ADD COLUMN IF NOT EXISTS attendance_on_time_points integer DEFAULT 5;
ALTER TABLE public.points_configuration ADD COLUMN IF NOT EXISTS attendance_late_points integer DEFAULT -5;
ALTER TABLE public.points_configuration ADD COLUMN IF NOT EXISTS attendance_very_late_points integer DEFAULT -10;
