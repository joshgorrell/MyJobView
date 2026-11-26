import { useThemedStyles, useTheme } from '../theme/ThemeContext';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { NotificationService } from '../services/NotificationService';
import { supabase } from '../services/supabase';
import * as Application from 'expo-application';
import { Colors } from '../theme/colors';
import { Typography, Spacing, Radius, Shadows } from '../theme/styles';
import { Card, InfoRow } from '../components/UI';
import { ScreenContainer } from '../components/ScreenContainer';

export default function SettingsScreen({ navigation }: any) {
  const themedStyles = useThemedStyles(styles);
  const { appearance, setAppearance } = useTheme();
  const { profile, signOut } = useAuth();
  const { isConnected, pendingSync, syncNow } = useOffline();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    async function loadPrefs() {
      if (!profile) return;
      const { data } = await supabase
        .from('push_tokens')
        .select('notifications_enabled')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .maybeSingle();
      if (data) setNotificationsEnabled(data.notifications_enabled);
      setUnreadCount(await NotificationService.getUnreadCount(profile.id));
    }
    loadPrefs();
  }, [profile]);

  async function handleSyncNow() {
    if (!isConnected) {
      Alert.alert('Offline', 'Cannot sync while offline. Please connect to internet.');
      return;
    }
    try {
      await syncNow();
      Alert.alert('Success', 'All offline data has been synced!');
    } catch (error) {
      Alert.alert('Error', 'Failed to sync data. Please try again.');
    }
  }

  async function handleSignOut() {
    if (!profile) return;
    try {
      const { data, error } = await supabase.from('daily_clock_entries').select('id').eq('technician_id', profile.id).is('clock_out', null).limit(1);
      if (error) throw error;
      if (data?.length) {
        Alert.alert('Active Workday', 'You are still clocked in. Please clock out before signing out so your workday and GPS history remain accurate.');
        return;
      }
    } catch (error) {
      Alert.alert('Cannot Verify Workday', 'Please connect to the internet and confirm you are clocked out before signing out.');
      return;
    }
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => { void signOut().catch(error => Alert.alert('Sign Out Failed', error instanceof Error ? error.message : 'Please try again.')); } },
      ]
    );
  }

  const initials = (profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || '?').toUpperCase();

  return (
    <ScreenContainer scroll>
      {/* Profile Section */}
      <View style={themedStyles.section}>
        <Text style={themedStyles.sectionTitle}>Profile</Text>
        <TouchableOpacity accessibilityRole="button" onPress={()=>navigation.navigate('WebsiteChat')} style={{padding:16}}><Text style={{color:'#2563eb',fontWeight:'600'}}>Website Chat</Text></TouchableOpacity>
        <View style={themedStyles.profileCard}>
          <View style={themedStyles.avatar}>
            <Text style={themedStyles.avatarText}>{initials}</Text>
          </View>
          <View style={themedStyles.profileInfo}>
            <Text style={themedStyles.profileName}>{profile?.full_name || 'User'}</Text>
            <Text style={themedStyles.profileEmail}>{profile?.email}</Text>
            <Text style={themedStyles.profileRole}>{profile?.role?.replace(/_/g, ' ')}</Text>
          </View>
        </View>
      </View>

      {/* Secondary destinations moved from the old dashboard menu. */}
      <View style={themedStyles.section}>
        <Text style={themedStyles.sectionTitle}>History</Text>
        <TouchableOpacity style={themedStyles.historyLink} accessibilityRole="button"
          onPress={() => navigation.navigate('TimeHistory')}>
          <Text style={themedStyles.historyLabel}>My Time History</Text>
          <Text style={themedStyles.historyArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* App Settings */}
      <View style={themedStyles.section}>
        <Text style={themedStyles.sectionTitle}>App Settings</Text>
        <Card style={themedStyles.settingCard}>
          <View style={{ marginBottom: 18 }}>
            <Text style={themedStyles.settingLabel}>Appearance</Text>
            <Text style={themedStyles.settingDescription}>Choose your preferred app theme</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {(['light', 'dark', 'system'] as const).map(option => (
                <TouchableOpacity key={option} accessibilityRole="radio"
                  accessibilityState={{ checked: appearance === option }}
                  accessibilityLabel={option === 'system' ? 'Use device appearance' : option + ' mode'}
                  onPress={() => setAppearance(option)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                    borderWidth: 1, borderColor: appearance === option ? Colors.primary[600] : (appearance === 'dark' ? '#485161' : Colors.gray[200]),
                    backgroundColor: appearance === option ? Colors.primary[600] : (appearance === 'dark' ? '#303744' : Colors.gray[50]) }}>
                  <Text style={{ fontWeight: '600', color: appearance === option ? '#ffffff' : (appearance === 'dark' ? '#e8ebf0' : Colors.gray[800]) }}>
                    {option === 'light' ? '☀ Light' : option === 'dark' ? '☾ Dark' : '◐ System'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={themedStyles.settingRow}>
            <View style={themedStyles.settingText}>
              <Text style={themedStyles.settingLabel}>Push Notifications</Text>
              <Text style={themedStyles.settingDescription}>Receive work order updates</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={async (value) => {
                setNotificationsEnabled(value);
                if (profile) {
                  await NotificationService.setNotificationsEnabled(profile.id, value);
                }
              }}
              trackColor={{ false: Colors.gray[300], true: Colors.primary[400] }}
              thumbColor={notificationsEnabled ? Colors.primary[600] : Colors.white}
            />
          </View>
        </Card>
      </View>

      {/* Data & Sync */}
      <View style={themedStyles.section}>
        <Text style={themedStyles.sectionTitle}>Data & Sync</Text>
        <Card style={themedStyles.syncCard}>
          <View style={themedStyles.connectionRow}>
            <Text style={themedStyles.connectionLabel}>Connection Status</Text>
            <View style={themedStyles.connectionRight}>
              <View style={[themedStyles.statusDot, isConnected ? themedStyles.online : themedStyles.offline]} />
              <Text style={themedStyles.connectionValue}>{isConnected ? 'Online' : 'Offline'}</Text>
            </View>
          </View>
          <InfoRow label="Pending Sync" value={`${pendingSync} items`} />
        </Card>

        {pendingSync > 0 && (
          <TouchableOpacity style={themedStyles.syncButton} onPress={handleSyncNow} disabled={!isConnected} activeOpacity={0.85}>
            <Text style={themedStyles.syncButtonText}>Sync Now</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Notifications */}
      {unreadCount > 0 && (
        <View style={themedStyles.section}>
          <Text style={themedStyles.sectionTitle}>Notifications</Text>
          <Card style={themedStyles.aboutCard}>
            <InfoRow label="Unread" value={`${unreadCount} new`} />
          </Card>
        </View>
      )}

      {/* About */}
      <View style={themedStyles.section}>
        <Text style={themedStyles.sectionTitle}>About</Text>
        <Card style={themedStyles.aboutCard}>
          <InfoRow label="App Name" value="MyJobView" />
          <InfoRow label="Version" value={Application.nativeApplicationVersion || '1.0.0'} />
          <InfoRow label="Build" value={Application.nativeBuildVersion || '1'} />
        </Card>
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={themedStyles.signOutButton} onPress={handleSignOut} activeOpacity={0.7}>
        <Text style={themedStyles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={themedStyles.footer}>
        <Text style={themedStyles.footerText}>MyJobView</Text>
        <Text style={themedStyles.footerSubtext}>© 2025 MyJobView</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  historyLink: { minHeight: 48, backgroundColor: Colors.white, marginHorizontal: Spacing.lg, marginBottom: 1, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyLabel: { color: Colors.gray[900], fontSize: 15, fontWeight: '600' },
  historyArrow: { color: Colors.gray[500], fontSize: 24 },
  container: { flex: 1, backgroundColor: Colors.gray[100] },
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    ...Typography.label, paddingHorizontal: Spacing.lg + 4, marginBottom: Spacing.md, marginTop: Spacing.xxl,
  },
  profileCard: {
    backgroundColor: Colors.white, marginHorizontal: Spacing.lg, borderRadius: Radius.lg,
    padding: Spacing.xl, flexDirection: 'row', alignItems: 'center', ...Shadows.small,
  },
  avatar: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.primary[600],
    alignItems: 'center', justifyContent: 'center', marginRight: Spacing.lg,
  },
  avatarText: { fontSize: 24, fontWeight: '700', color: Colors.white, textTransform: 'uppercase' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '700', color: Colors.gray[900], marginBottom: 4 },
  profileEmail: { fontSize: 14, color: Colors.gray[500], marginBottom: 4 },
  profileRole: { fontSize: 12, color: Colors.primary[600], fontWeight: '600', textTransform: 'capitalize' },
  settingCard: { marginBottom: 0 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingText: { flex: 1 },
  settingLabel: { fontSize: 16, fontWeight: '600', color: Colors.gray[900], marginBottom: 4 },
  settingDescription: { fontSize: 14, color: Colors.gray[500] },
  syncCard: { marginBottom: 0 },
  connectionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray[200],
  },
  connectionLabel: { fontSize: 14, color: Colors.gray[500], flex: 1 },
  connectionRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  online: { backgroundColor: Colors.green[500] },
  offline: { backgroundColor: Colors.red[500] },
  connectionValue: { fontSize: 14, fontWeight: '600', color: Colors.gray[900] },
  syncButton: {
    backgroundColor: Colors.primary[600], marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    borderRadius: Radius.md, padding: Spacing.lg + 2, alignItems: 'center', ...Shadows.small,
  },
  syncButtonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  aboutCard: { marginBottom: 0 },
  signOutButton: {
    backgroundColor: Colors.white, marginHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.lg,
    borderRadius: Radius.md, padding: Spacing.lg + 2, alignItems: 'center', borderWidth: 1, borderColor: Colors.gray[200],
    ...Shadows.small,
  },
  signOutText: { color: Colors.red[500], fontSize: 16, fontWeight: '600' },
  footer: { padding: Spacing.xxxl, alignItems: 'center' },
  footerText: { fontSize: 14, fontWeight: '700', color: Colors.gray[500], marginBottom: 4 },
  footerSubtext: { fontSize: 12, color: Colors.gray[400] },
});
