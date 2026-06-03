/*
  # Digital Business Cards System

  1. New Tables
    - `business_cards`
      - `id` (uuid, primary key)
      - `user_id` (uuid) - Foreign key to profiles
      - `slug` (text, unique) - URL-friendly identifier (e.g., 'josh-smith')
      - `full_name` (text)
      - `title` (text) - Job title
      - `email` (text)
      - `phone` (text)
      - `photo_url` (text)
      - `bio` (text)
      - `linkedin_url` (text)
      - `is_active` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `contact_captures`
      - `id` (uuid, primary key)
      - `business_card_id` (uuid) - Foreign key to business_cards
      - `contact_phone` (text)
      - `contact_name` (text)
      - `captured_by` (uuid) - Foreign key to profiles
      - `sms_sent` (boolean)
      - `sms_sent_at` (timestamptz)
      - `sms_delivered` (boolean)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can view their own business card
    - Business cards are publicly viewable when active
    - Contact captures are private to the card owner
    - Admins can manage all business cards

  3. Indexes
    - Add indexes for slug lookups and contact queries
*/

-- Create business_cards table
CREATE TABLE IF NOT EXISTS business_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  slug text UNIQUE NOT NULL,
  full_name text NOT NULL,
  title text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  photo_url text,
  bio text,
  linkedin_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create contact_captures table
CREATE TABLE IF NOT EXISTS contact_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_card_id uuid REFERENCES business_cards(id) ON DELETE CASCADE,
  contact_phone text NOT NULL,
  contact_name text,
  captured_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  sms_sent boolean DEFAULT false,
  sms_sent_at timestamptz,
  sms_delivered boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_business_cards_slug ON business_cards(slug);
CREATE INDEX IF NOT EXISTS idx_business_cards_user_id ON business_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_captures_business_card_id ON contact_captures(business_card_id);
CREATE INDEX IF NOT EXISTS idx_contact_captures_captured_by ON contact_captures(captured_by);

-- Enable RLS
ALTER TABLE business_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_captures ENABLE ROW LEVEL SECURITY;

-- Business cards policies
CREATE POLICY "Anyone can view active business cards"
  ON business_cards FOR SELECT
  USING (is_active = true);

CREATE POLICY "Users can view own business card"
  ON business_cards FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all business cards"
  ON business_cards FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Contact captures policies
CREATE POLICY "Users can view own contact captures"
  ON contact_captures FOR SELECT
  TO authenticated
  USING (
    captured_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM business_cards
      WHERE business_cards.id = contact_captures.business_card_id
      AND business_cards.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can create contact captures"
  ON contact_captures FOR INSERT
  TO authenticated
  WITH CHECK (true);