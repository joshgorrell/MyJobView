-- Update every department copy of the shared Feedback page, preserving module
-- keys, IDs, permission links and users' saved bookmarks.
UPDATE public.department_modules
SET display_name = 'Feedback'
WHERE module_key = 'reviews' AND display_name IS DISTINCT FROM 'Feedback';
