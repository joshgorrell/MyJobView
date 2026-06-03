/*
  # Grant products table permissions

  1. Changes
    - Grant SELECT, INSERT, UPDATE, DELETE on products table to authenticated users
    - This is required in addition to RLS policies for users to interact with the table

  2. Security
    - RLS policies still control what data users can actually see/modify
    - This just grants the base table permissions needed
*/

GRANT SELECT, INSERT, UPDATE, DELETE ON products TO authenticated;