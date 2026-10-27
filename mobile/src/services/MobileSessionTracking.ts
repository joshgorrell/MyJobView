import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const DEVICE_KEY = 'mjv-native-installation-id';
let activeSessionId: string | null = null;
let activeUserId: string | null = null;
let lastPage = 'mobile_dashboard';

async function installationId(): Promise<string> {
  const saved = await SecureStore.getItemAsync(DEVICE_KEY);
  if (saved) return saved;
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_KEY, id);
  return id;
}

export async function startMobileSession(userId: string): Promise<void> {
  if (activeSessionId && activeUserId === userId) return;
  const id = await installationId();
  const { data, error } = await supabase.rpc('start_browser_session', {
    p_browser_id: id,
    p_device_type: 'mobile',
    p_browser_name: 'MyJobView App',
    p_browser_version: '1.0.0',
    p_os_name: Platform.OS === 'ios' ? 'iOS' : 'Android',
    p_os_version: String(Platform.Version),
    p_device_model: Platform.OS === 'ios' ? 'iPhone / iPad' : 'Android device',
    p_device_vendor: Platform.OS === 'ios' ? 'Apple' : 'Android',
    p_user_agent: 'MyJobView Native App',
  });
  if (error) throw error;
  activeSessionId = data as string;
  activeUserId = userId;
  await recordMobileActivity(lastPage);
}

export async function recordMobileActivity(page: string): Promise<void> {
  lastPage = page;
  if (!activeSessionId || !activeUserId) return;
  const { error } = await supabase.rpc('update_session_activity', {
    p_user_id: activeUserId,
    p_page: page,
    p_session_id: activeSessionId,
  });
  if (error) console.warn('Mobile session activity update failed:', error.message);
}

export async function endMobileSession(): Promise<void> {
  const sessionId = activeSessionId;
  const userId = activeUserId;
  activeSessionId = null;
  activeUserId = null;
  if (!sessionId || !userId) return;
  const { error } = await supabase.rpc('end_user_session', {
    p_user_id: userId,
    p_session_id: sessionId,
  });
  if (error) console.warn('Mobile session close failed:', error.message);
}
