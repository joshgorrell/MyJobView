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

export default function SettingsScreen() {
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

  function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ]
    );
  }

  const initials = (profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || '?').toUpperCase();

  return (
    <ScrollView style={styles.container}>
      {/* Profile Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile?.full_name || 'User'}</Text>
            <Text style={styles.profileEmail}>{profile?.email}</Text>
            <Text style={styles.profileRole}>{profile?.role?.replace(/_/g, ' ')}</Text>
          </View>
        </View>
      </View>

      {/* App Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Settings</Text>
        <Card style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Push Notifications</Text>
              <Text style={styles.settingDescription}>Receive work order updates</Text>
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
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data & Sync</Text>
        <Card style={styles.syncCard}>
          <View style={styles.connectionRow}>
            <Text style={styles.connectionLabel}>Connection Status</Text>
            <View style={styles.connectionRight}>
              <View style={[styles.statusDot, isConnected ? styles.online : styles.offline]} />
              <Text style={styles.connectionValue}>{isConnected ? 'Online' : 'Offline'}</Text>
            </View>
          </View>
          <InfoRow label="Pending Sync" value={`${pendingSync} items`} />
        </Card>

        {pendingSync > 0 && (
          <TouchableOpacity style={styles.syncButton} onPress={handleSyncNow} disabled={!isConnected} activeOpacity={0.85}>
            <Text style={styles.syncButtonText}>Sync Now</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Notifications */}
      {unreadCount > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <Card style={styles.aboutCard}>
            <InfoRow label="Unread" value={`${unreadCount} new`} />
          </Card>
        </View>
      )}

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Card style={styles.aboutCard}>
          <InfoRow label="App Name" value="Field Ops Pro" />
          <InfoRow label="Version" value={Application.nativeApplicationVersion || '1.0.0'} />
          <InfoRow label="Build" value={Application.nativeBuildVersion || '1'} />
        </Card>
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.7}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Field Ops Pro</Text>
        <Text style={styles.footerSubtext}>© 2025 Field Ops Pro</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
