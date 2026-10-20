import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

const PREFERENCE_KEY = 'notifications_enabled';

class NotificationServiceClass {
  private initialized = false;
  private notificationListener: Notifications.Subscription | null = null;
  private responseListener: Notifications.Subscription | null = null;

  async initialize() {
    if (this.initialized) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('work-orders', {
        name: 'Work Orders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563eb',
      });
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    this.notificationListener = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification.request.content.title);
    });

    this.responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log('Notification tapped:', data);
    });

    this.initialized = true;
  }

  async registerForPushNotifications(): Promise<string | null> {
    if (!Device.isDevice) {
      console.warn('Push notifications require a physical device');
      return null;
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId || projectId === 'field-ops-mobile') {
      console.warn('Push registration is unavailable until the EAS project is linked.');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

    return tokenData.data;
  }

  async registerTokenWithServer(userId: string, organizationId: string | null): Promise<void> {
    const token = await this.registerForPushNotifications();
    if (!token) return;

    await supabase
      .from('push_tokens')
      .upsert({
        user_id: userId,
        token,
        device_platform: Platform.OS,
        device_model: Device.modelName,
        organization_id: organizationId,
        is_active: true,
        notifications_enabled: true,
      }, { onConflict: 'token' });
  }

  async unregisterToken(): Promise<void> {
    const token = await this.registerForPushNotifications().catch(() => null);
    if (!token) return;

    await supabase
      .from('push_tokens')
      .update({ is_active: false })
      .eq('token', token);
  }

  async setNotificationsEnabled(userId: string, enabled: boolean): Promise<void> {
    await supabase
      .from('push_tokens')
      .update({ notifications_enabled: enabled })
      .eq('user_id', userId)
      .eq('is_active', true);
  }

  async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) return 0;
    return count || 0;
  }

  async markAsRead(notificationId: string): Promise<void> {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
  }

  async markAllAsRead(userId: string): Promise<void> {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
  }

  async getNotifications(userId: string, limit: number = 20): Promise<any[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return data || [];
  }

  cleanup() {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
      this.notificationListener = null;
    }
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
      this.responseListener = null;
    }
    this.initialized = false;
  }
}

export const NotificationService = new NotificationServiceClass();
