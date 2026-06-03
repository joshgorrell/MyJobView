/*
  # Add automatic profile creation trigger

  ## Changes
  1. Creates a trigger function that automatically creates a profile when a new user signs up
  2. The trigger extracts the email from auth.users and creates a corresponding profile
  3. Sets reasonable defaults: full_name from email prefix, role as 'sales_rep', is_active as true

  ## Security
  - Trigger runs with SECURITY DEFINER to bypass RLS
  - Only runs on INSERT to auth.users table
  - No additional RLS changes needed
*/

-- Create function to handle new user signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'sales_rep',
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
