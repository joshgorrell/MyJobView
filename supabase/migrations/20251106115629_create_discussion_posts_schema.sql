/*
  # Create Discussion Posts Schema

  1. New Tables
    - `discussion_posts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles) - Who created the post
      - `lead_id` (uuid, references leads, nullable) - Optional linked lead
      - `content` (text) - The discussion post content
      - `mentions` (text[], array) - Array of mentioned user IDs
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `discussion_post_likes`
      - `id` (uuid, primary key)
      - `post_id` (uuid, references discussion_posts)
      - `user_id` (uuid, references profiles)
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to read all posts
    - Add policies for users to create their own posts
    - Add policies for users to like posts
    - Add policies for users to delete their own posts
  
  3. Indexes
    - Add index on user_id for faster queries
    - Add index on created_at for sorting
    - Add composite index on post_id and user_id for likes
*/

CREATE TABLE IF NOT EXISTS discussion_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  content text NOT NULL,
  mentions text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discussion_post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES discussion_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_discussion_posts_user_id ON discussion_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_created_at ON discussion_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discussion_post_likes_post_user ON discussion_post_likes(post_id, user_id);

ALTER TABLE discussion_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_post_likes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'discussion_posts' AND policyname = 'Anyone can view discussion posts'
  ) THEN
    CREATE POLICY "Anyone can view discussion posts"
      ON discussion_posts FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'discussion_posts' AND policyname = 'Users can create discussion posts'
  ) THEN
    CREATE POLICY "Users can create discussion posts"
      ON discussion_posts FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'discussion_posts' AND policyname = 'Users can update own posts'
  ) THEN
    CREATE POLICY "Users can update own posts"
      ON discussion_posts FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'discussion_posts' AND policyname = 'Users can delete own posts'
  ) THEN
    CREATE POLICY "Users can delete own posts"
      ON discussion_posts FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'discussion_post_likes' AND policyname = 'Anyone can view likes'
  ) THEN
    CREATE POLICY "Anyone can view likes"
      ON discussion_post_likes FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'discussion_post_likes' AND policyname = 'Users can like posts'
  ) THEN
    CREATE POLICY "Users can like posts"
      ON discussion_post_likes FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'discussion_post_likes' AND policyname = 'Users can unlike posts'
  ) THEN
    CREATE POLICY "Users can unlike posts"
      ON discussion_post_likes FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
