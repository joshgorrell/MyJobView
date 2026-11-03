import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const configuredSupabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();

// Supabase JS appends /auth/v1/token; the configured URL must be the project root.
function validateSupabaseProjectUrl(value: string): string {
  if (!value) throw new Error('Mobile authentication is not configured: missing EXPO_PUBLIC_SUPABASE_URL.');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Mobile authentication is misconfigured: invalid Supabase project URL.');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Mobile authentication is misconfigured: Supabase URL must be the HTTPS project root, not an API endpoint path.');
  }
  return parsed.origin;
}
const supabaseUrl = validateSupabaseProjectUrl(configuredSupabaseUrl);
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
if (!supabaseAnonKey) throw new Error('Mobile authentication is not configured: missing EXPO_PUBLIC_SUPABASE_ANON_KEY.');

// Custom storage for secure token persistence
const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error('Error getting item from SecureStore:', error);
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error('Error setting item in SecureStore:', error);
    }
  },
  removeItem: async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('Error removing item from SecureStore:', error);
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
