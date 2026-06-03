/*
  # Move Admin to Footer Navigation

  ## Overview
  Marks Admin department as a footer-only navigation section. Admin modules will appear
  in the footer, with user-facing modules (My Card, Tasks, Preferences, Help) visible to
  all users, and admin-only modules only visible to admins.

  ## Changes
  
  ### Add Navigation Section Field to Departments
  - Add `navigation_section` field to departments table
  - Values: 'main' (default) or 'footer'
  - Admin department set to 'footer'
  
  ### Department Navigation Sections:
  - **Main Navigation (top)**: Pipeline, Sales, Production, Dispatch, Finance
  - **Footer Navigation (bottom)**: Admin (with user items + admin items)

  ## Result
  - Admin appears in footer, not main department navigation
  - User-facing items in Admin visible to all (My Card, Tasks, Preferences, Help)
  - Admin-only items only visible to admin users (Settings, Management tools)
*/

-- Add navigation_section column to departments
ALTER TABLE departments 
ADD COLUMN IF NOT EXISTS navigation_section text DEFAULT 'main' CHECK (navigation_section IN ('main', 'footer'));

-- Mark Admin as footer navigation
UPDATE departments 
SET navigation_section = 'footer' 
WHERE name = 'admin';

-- All other departments remain in main navigation
UPDATE departments 
SET navigation_section = 'main' 
WHERE name != 'admin';
