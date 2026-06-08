import { useEffect, useState, useRef } from 'react';
import { Activity, Clock, Users, Monitor, MapPin, Calendar, Smartphone, Tablet, ChevronDown, ChevronRight, X, Settings, CalendarClock, LogOut, Shield, AlertTriangle, CheckCircle, Info, RotateCcw, Home, Building2, Wifi, Coffee, Tag, Laptop, Tv } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDistanceToNow } from '../../lib/utils';
import { IPNicknameManager } from './IPNicknameManager';
import { DeviceNicknameManager } from './DeviceNicknameManager';

interface UserSession {
  id: string;
  user_id: string;
  session_start: string;
  session_end: string | null;
  last_activity: string;
  ip_address: string | null;
  user_agent: string | null;
  is_active: boolean;
  duration_seconds: number;
  device_type: string | null;
  browser_name: string | null;
  browser_version: string | null;
  os_name: string | null;
  os_version: string | null;
  device_model: string | null;
  device_vendor: string | null;
  profiles: {
    full_name: string;
    email: string;
    role: string;
  };
  ip_nickname?: {
    nickname: string;
    color: string;
    icon: string;
  } | null;
  device_nickname?: {
    nickname: string;
    color: string;
    icon: string;
  } | null;
}

interface UserStats {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  total_sessions: number;
  total_time_seconds: number;
  last_seen: string | null;
  is_online: boolean;
  is_clocked_in: boolean;
  primary_device: string | null;
  primary_location: string | null;
  device_nickname?: {
    nickname: string;
    color: string;
    icon: string;
  } | null;
  location_nickname?: {
    nickname: string;
    color: string;
    icon: string;
  } | null;
}

interface LocationStats {
  location_name: string;
  ip_address: string;
  color: string | null;
  session_count: number;
  total_hours: number;
  unique_users: number;
  users?: Array<{ full_name: string; email: string; session_count: number }>;
}

interface DeviceStats {
  device_type: string;
  browser_name: string;
  os_name: string;
  session_count: number;
  total_hours: number;
  unique_users: number;
  users?: Array<{ full_name: string; email: string; session_count: number }>;
}

interface LogoutSchedule {
  id: string;
  enabled: boolean;
  logout_time: string;
  timezone: string;
  label: string;
  last_run_at: string | null;
  last_run_count: number;
}

interface CleanupLogEntry {
  id: string;
  execution_time: string;
  sessions_closed: number;
  success: boolean;
  error_message: string | null;
}

const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (MST)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

function getNextRunLabel(logoutTime: string, timezone: string): string {
  try {
    const [hours, minutes] = logoutTime.split(':').map(Number);
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric', minute: 'numeric', hour12: false,
      year: 'numeric', month: 'numeric', day: 'numeric',
    });
    const parts = formatter.formatToParts(now);
    const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const totalNowMins = tzHour * 60 + tzMinute;
    const totalTargetMins = hours * 60 + minutes;
    const minsUntil = totalTargetMins > totalNowMins
      ? totalTargetMins - totalNowMins
      : 1440 - totalNowMins + totalTargetMins;
    if (minsUntil < 60) return `in ${minsUntil} minute${minsUntil !== 1 ? 's' : ''}`;
    const h = Math.floor(minsUntil / 60);
    const m = minsUntil % 60;
    return `in ${h}h${m > 0 ? ` ${m}m` : ''}`;
  } catch {
    return 'scheduled daily';
  }
}

const ICON_MAP: { [key: string]: any } = {
  'home': Home,
  'building-2': Building2,
  'shield': Shield,
  'smartphone': Smartphone,
  'coffee': Coffee,
  'wifi': Wifi,
  'map-pin': MapPin,
  'monitor': Monitor,
  'tablet': Tablet,
  'laptop': Laptop,
  'tv': Tv,
  'watch': Smartphone,
};

const IP_PRESET_NICKNAMES = [
  { label: 'Home', icon: 'home', color: '#10B981' },
  { label: 'Office', icon: 'building-2', color: '#3B82F6' },
  { label: 'VPN', icon: 'shield', color: '#8B5CF6' },
  { label: 'Mobile Data', icon: 'smartphone', color: '#F59E0B' },
  { label: 'Coffee Shop', icon: 'coffee', color: '#EC4899' },
  { label: 'Remote', icon: 'wifi', color: '#6366F1' },
];

const DEVICE_PRESET_NICKNAMES = [
  { label: 'Work Laptop', icon: 'laptop', color: '#3B82F6' },
  { label: 'Personal Phone', icon: 'smartphone', color: '#10B981' },
  { label: 'Home Desktop', icon: 'monitor', color: '#8B5CF6' },
  { label: 'Office Desktop', icon: 'monitor', color: '#F59E0B' },
  { label: 'iPad', icon: 'tablet', color: '#EC4899' },
  { label: 'Conf. Room TV', icon: 'tv', color: '#6366F1' },
];

export function UserSessionsViewerEnhanced() {
  const [activeSessions, setActiveSessions] = useState<UserSession[]>([]);
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [locationStats, setLocationStats] = useState<LocationStats[]>([]);
  const [deviceStats, setDeviceStats] = useState<DeviceStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [activeTab, setActiveTab] = useState<'active' | 'users' | 'locations' | 'devices' | 'schedule'>('active');
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());
  const [expandedDevices, setExpandedDevices] = useState<Set<number>>(new Set());
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [allUsers, setAllUsers] = useState<UserStats[]>([]);
  const [userSessionHistory, setUserSessionHistory] = useState<Map<string, UserSession[]>>(new Map());
  const [showManageLocations, setShowManageLocations] = useState(false);
  const [showManageDevices, setShowManageDevices] = useState(false);

  const [schedule, setSchedule] = useState<LogoutSchedule | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [editEnabled, setEditEnabled] = useState(false);
  const [editTime, setEditTime] = useState('00:00');
  const [editTimezone, setEditTimezone] = useState('UTC');
  const [editLabel, setEditLabel] = useState('Daily Session Logout');
  const [forceLogoutConfirm, setForceLogoutConfirm] = useState(false);
  const [forceLogoutRunning, setForceLogoutRunning] = useState(false);
  const [forceLogoutResult, setForceLogoutResult] = useState<{ users: number; sessions: number } | null>(null);
  const [cleanupHistory, setCleanupHistory] = useState<CleanupLogEntry[]>([]);

  const [ipNicknamePopover, setIpNicknamePopover] = useState<{ ip: string; sessionId: string } | null>(null);
  const [ipNicknameCustom, setIpNicknameCustom] = useState('');
  const [ipNicknameSaving, setIpNicknameSaving] = useState(false);
  const ipNicknamePopoverRef = useRef<HTMLDivElement>(null);

  const [deviceNicknamePopover, setDeviceNicknamePopover] = useState<{
    signature: string;
    sessionId: string;
    deviceType: string | null;
    browserName: string | null;
    osName: string | null;
  } | null>(null);
  const [deviceNicknameCustom, setDeviceNicknameCustom] = useState('');
  const [deviceNicknameSaving, setDeviceNicknameSaving] = useState(false);
  const deviceNicknamePopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      loadData();
    }, 30000);

    const channel = supabase
      .channel('sessions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_sessions' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [timeRange]);

  useEffect(() => {
    if (activeTab === 'schedule') loadSchedule();
  }, [activeTab]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ipNicknamePopoverRef.current && !ipNicknamePopoverRef.current.contains(e.target as Node)) {
        setIpNicknamePopover(null);
        setIpNicknameCustom('');
      }
    }
    if (ipNicknamePopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ipNicknamePopover]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (deviceNicknamePopoverRef.current && !deviceNicknamePopoverRef.current.contains(e.target as Node)) {
        setDeviceNicknamePopover(null);
        setDeviceNicknameCustom('');
      }
    }
    if (deviceNicknamePopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [deviceNicknamePopover]);

  async function saveDeviceNickname(signature: string, label: string, icon: string, color: string, deviceType: string | null, browserName: string | null, osName: string | null) {
    setDeviceNicknameSaving(true);
    try {
      const { error } = await supabase
        .from('device_nicknames')
        .upsert({
          device_signature: signature,
          nickname: label,
          icon,
          color,
          device_type: deviceType,
          browser_name: browserName,
          os_name: osName,
        }, { onConflict: 'device_signature' });
      if (error) throw error;
      setDeviceNicknamePopover(null);
      setDeviceNicknameCustom('');
      await loadData();
    } catch (err) {
      console.error('Error saving device nickname:', err);
    } finally {
      setDeviceNicknameSaving(false);
    }
  }

  async function saveIPNickname(ip: string, label: string, icon: string, color: string) {
    setIpNicknameSaving(true);
    try {
      const { error } = await supabase
        .from('ip_nicknames')
        .upsert({
          ip_address: ip,
          nickname: label,
          icon,
          color,
          is_trusted: true,
        }, { onConflict: 'ip_address' });
      if (error) throw error;
      setIpNicknamePopover(null);
      setIpNicknameCustom('');
      await loadData();
    } catch (err) {
      console.error('Error saving IP nickname:', err);
    } finally {
      setIpNicknameSaving(false);
    }
  }

  async function loadData() {
    try {
      await Promise.all([
        loadActiveSessions(),
        loadUserStats(),
        loadLocationStats(),
        loadDeviceStats(),
        loadAllUsers()
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function loadAllUsers() {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .order('full_name');

    if (error) {
      console.error('Error loading all users:', error);
      return;
    }

    if (!profiles || profiles.length === 0) {
      setAllUsers([]);
      return;
    }

    const profileIds = profiles.map(p => p.id);

    // Fetch last session per user and clocked-in status in bulk (2 queries instead of 2*N)
    const [sessionsResult, clockedInResult] = await Promise.all([
      supabase
        .from('user_sessions')
        .select('user_id, last_activity, is_active, ip_address, device_type, browser_name, os_name')
        .in('user_id', profileIds)
        .order('last_activity', { ascending: false }),
      supabase
        .from('time_clock_history')
        .select('user_id')
        .in('user_id', profileIds)
        .is('clock_out', null)
    ]);

    // Build lookup maps - keep only the most recent session per user
    const lastSessionMap: Record<string, any> = {};
    (sessionsResult.data || []).forEach(s => {
      if (!lastSessionMap[s.user_id]) {
        lastSessionMap[s.user_id] = s;
      }
    });

    const clockedInSet = new Set((clockedInResult.data || []).map(r => r.user_id));

    const usersWithStats = profiles.map(profile => {
      const lastSession = lastSessionMap[profile.id] || null;
      return {
        user_id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        role: profile.role,
        total_sessions: 0,
        total_time_seconds: 0,
        last_seen: lastSession?.last_activity || null,
        is_online: lastSession?.is_active || false,
        is_clocked_in: clockedInSet.has(profile.id),
        primary_device: lastSession ? `${lastSession.device_type || 'unknown'}|${lastSession.browser_name || 'unknown'}|${lastSession.os_name || 'unknown'}` : null,
        primary_location: lastSession?.ip_address || null,
      };
    });

    const deviceSignatures = [...new Set(usersWithStats.map(u => u.primary_device).filter(Boolean))];
    if (deviceSignatures.length > 0) {
      const { data: deviceNicks } = await supabase
        .from('device_nicknames')
        .select('device_signature, nickname, color, icon')
        .in('device_signature', deviceSignatures);

      const deviceNicknameMap = new Map(deviceNicks?.map(n => [n.device_signature, n]) || []);
      usersWithStats.forEach((user) => {
        if (user.primary_device) {
          const deviceNick = deviceNicknameMap.get(user.primary_device);
          if (deviceNick) {
            user.device_nickname = {
              nickname: deviceNick.nickname,
              color: deviceNick.color,
              icon: deviceNick.icon,
            };
          }
        }
      });
    }

    const ipAddresses = [...new Set(usersWithStats.map(u => u.primary_location).filter(Boolean))];
    if (ipAddresses.length > 0) {
      const { data: ipNicks } = await supabase
        .from('ip_nicknames')
        .select('ip_address, nickname, color, icon')
        .in('ip_address', ipAddresses);

      const ipNicknameMap = new Map(ipNicks?.map(n => [n.ip_address, n]) || []);
      usersWithStats.forEach((user) => {
        if (user.primary_location) {
          const ipNick = ipNicknameMap.get(user.primary_location);
          if (ipNick) {
            user.location_nickname = {
              nickname: ipNick.nickname,
              color: ipNick.color,
              icon: ipNick.icon,
            };
          }
        }
      });
    }

    setAllUsers(usersWithStats);
  }

  async function loadUserSessionHistory(userId: string) {
    if (userSessionHistory.has(userId)) {
      return;
    }

    const { data, error } = await supabase
      .from('user_sessions')
      .select(`
        *,
        profiles:user_id (
          full_name,
          email,
          role
        )
      `)
      .eq('user_id', userId)
      .order('session_start', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error loading user session history:', error);
      return;
    }

    const sessions = data || [];

    const ipAddresses = [...new Set(sessions.map(s => s.ip_address).filter(Boolean))];
    if (ipAddresses.length > 0) {
      const { data: nicknames } = await supabase
        .from('ip_nicknames')
        .select('ip_address, nickname, color, icon')
        .in('ip_address', ipAddresses);

      const nicknameMap = new Map(nicknames?.map(n => [n.ip_address, n]) || []);
      sessions.forEach(session => {
        if (session.ip_address) {
          session.ip_nickname = nicknameMap.get(session.ip_address) || null;
        }
      });
    }

    const deviceSignatures = [...new Set(
      sessions
        .filter(s => s.device_type || s.browser_name)
        .map(s => `${s.device_type || 'unknown'}|${s.browser_name || 'unknown'}|${s.os_name || 'unknown'}`)
    )];
    if (deviceSignatures.length > 0) {
      const { data: deviceNicks } = await supabase
        .from('device_nicknames')
        .select('device_signature, nickname, color, icon')
        .in('device_signature', deviceSignatures);

      const deviceNicknameMap = new Map(deviceNicks?.map(n => [n.device_signature, n]) || []);
      sessions.forEach(session => {
        const signature = `${session.device_type || 'unknown'}|${session.browser_name || 'unknown'}|${session.os_name || 'unknown'}`;
        const deviceNick = deviceNicknameMap.get(signature);
        if (deviceNick) {
          session.device_nickname = {
            nickname: deviceNick.nickname,
            color: deviceNick.color,
            icon: deviceNick.icon,
          };
        }
      });
    }

    const newHistory = new Map(userSessionHistory);
    newHistory.set(userId, sessions);
    setUserSessionHistory(newHistory);
  }

  async function loadActiveSessions() {
    await supabase.rpc('cleanup_stale_sessions');

    const { data, error } = await supabase
      .from('user_sessions')
      .select(`
        *,
        profiles:user_id (
          full_name,
          email,
          role
        )
      `)
      .eq('is_active', true)
      .order('last_activity', { ascending: false });

    if (error) {
      console.error('Error loading active sessions:', error);
      return;
    }

    const sessions = data || [];

    const ipAddresses = [...new Set(sessions.map(s => s.ip_address).filter(Boolean))];
    if (ipAddresses.length > 0) {
      const { data: nicknames } = await supabase
        .from('ip_nicknames')
        .select('ip_address, nickname, color, icon')
        .in('ip_address', ipAddresses);

      const nicknameMap = new Map(nicknames?.map(n => [n.ip_address, n]) || []);
      sessions.forEach(session => {
        if (session.ip_address) {
          session.ip_nickname = nicknameMap.get(session.ip_address) || null;
        }
      });
    }

    const deviceSignatures = [...new Set(
      sessions
        .filter(s => s.device_type || s.browser_name)
        .map(s => `${s.device_type || 'unknown'}|${s.browser_name || 'unknown'}|${s.os_name || 'unknown'}`)
    )];
    if (deviceSignatures.length > 0) {
      const { data: deviceNicks } = await supabase
        .from('device_nicknames')
        .select('device_signature, nickname, color, icon')
        .in('device_signature', deviceSignatures);

      const deviceNicknameMap = new Map(deviceNicks?.map(n => [n.device_signature, n]) || []);
      sessions.forEach(session => {
        const signature = `${session.device_type || 'unknown'}|${session.browser_name || 'unknown'}|${session.os_name || 'unknown'}`;
        const deviceNick = deviceNicknameMap.get(signature);
        if (deviceNick) {
          session.device_nickname = {
            nickname: deviceNick.nickname,
            color: deviceNick.color,
            icon: deviceNick.icon,
          };
        }
      });
    }

    setActiveSessions(sessions);
  }

  async function loadUserStats() {
    let query = supabase
      .from('user_sessions')
      .select(`
        user_id,
        duration_seconds,
        session_end,
        device_type,
        browser_name,
        os_name,
        ip_address,
        profiles:user_id (
          full_name,
          email,
          role
        )
      `);

    const now = new Date();
    if (timeRange === 'today') {
      const startOfDay = new Date(now.setHours(0, 0, 0, 0)).toISOString();
      query = query.gte('session_start', startOfDay);
    } else if (timeRange === 'week') {
      const weekAgo = new Date(now.setDate(now.getDate() - 7)).toISOString();
      query = query.gte('session_start', weekAgo);
    } else if (timeRange === 'month') {
      const monthAgo = new Date(now.setMonth(now.getMonth() - 1)).toISOString();
      query = query.gte('session_start', monthAgo);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error loading user stats:', error);
      return;
    }

    const statsMap = new Map<string, UserStats>();

    data?.forEach((session: any) => {
      const userId = session.user_id;
      if (!statsMap.has(userId)) {
        statsMap.set(userId, {
          user_id: userId,
          full_name: session.profiles.full_name,
          email: session.profiles.email,
          role: session.profiles.role,
          total_sessions: 0,
          total_time_seconds: 0,
          last_seen: null,
          is_online: false,
          is_clocked_in: false,
          primary_device: null,
          primary_location: null,
        });
      }

      const stats = statsMap.get(userId)!;
      stats.total_sessions += 1;
      stats.total_time_seconds += session.duration_seconds || 0;
      if (!stats.primary_device && session.device_type) {
        stats.primary_device = `${session.device_type || 'unknown'}|${session.browser_name || 'unknown'}|${session.os_name || 'unknown'}`;
      }
      if (!stats.primary_location && session.ip_address) {
        stats.primary_location = session.ip_address;
      }
    });

    const { data: lastSeenData } = await supabase
      .from('user_sessions')
      .select('user_id, last_activity, is_active')
      .order('last_activity', { ascending: false });

    lastSeenData?.forEach((session: any) => {
      if (statsMap.has(session.user_id)) {
        const stats = statsMap.get(session.user_id)!;
        if (!stats.last_seen || new Date(session.last_activity) > new Date(stats.last_seen)) {
          stats.last_seen = session.last_activity;
          stats.is_online = session.is_active;
        }
      }
    });

    const { data: clockedInUsers } = await supabase
      .from('time_clock_history')
      .select('user_id')
      .is('clock_out', null);

    const clockedInSet = new Set(clockedInUsers?.map(u => u.user_id) || []);
    statsMap.forEach((stats) => {
      if (clockedInSet.has(stats.user_id)) {
        stats.is_clocked_in = true;
        stats.is_online = true;
      }
    });

    const deviceSignatures = [...new Set(
      Array.from(statsMap.values())
        .map(s => s.primary_device)
        .filter(Boolean)
    )];
    if (deviceSignatures.length > 0) {
      const { data: deviceNicks } = await supabase
        .from('device_nicknames')
        .select('device_signature, nickname, color, icon')
        .in('device_signature', deviceSignatures);

      const deviceNicknameMap = new Map(deviceNicks?.map(n => [n.device_signature, n]) || []);
      statsMap.forEach((stats) => {
        if (stats.primary_device) {
          const deviceNick = deviceNicknameMap.get(stats.primary_device);
          if (deviceNick) {
            stats.device_nickname = {
              nickname: deviceNick.nickname,
              color: deviceNick.color,
              icon: deviceNick.icon,
            };
          }
        }
      });
    }

    const ipAddresses = [...new Set(
      Array.from(statsMap.values())
        .map(s => s.primary_location)
        .filter(Boolean)
    )];
    if (ipAddresses.length > 0) {
      const { data: ipNicks } = await supabase
        .from('ip_nicknames')
        .select('ip_address, nickname, color, icon')
        .in('ip_address', ipAddresses);

      const ipNicknameMap = new Map(ipNicks?.map(n => [n.ip_address, n]) || []);
      statsMap.forEach((stats) => {
        if (stats.primary_location) {
          const ipNick = ipNicknameMap.get(stats.primary_location);
          if (ipNick) {
            stats.location_nickname = {
              nickname: ipNick.nickname,
              color: ipNick.color,
              icon: ipNick.icon,
            };
          }
        }
      });
    }

    const statsArray = Array.from(statsMap.values())
      .sort((a, b) => b.total_time_seconds - a.total_time_seconds);

    setUserStats(statsArray);
  }

  async function loadLocationStats() {
    const { data, error } = await supabase
      .from('session_analytics_by_location')
      .select('*')
      .order('total_time_seconds', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error loading location stats:', error);
      return;
    }

    const statsWithUsers = await Promise.all((data || []).map(async (d) => {
      const { data: sessions } = await supabase
        .from('user_sessions')
        .select(`
          user_id,
          profiles:user_id (
            full_name,
            email
          )
        `)
        .eq('ip_address', d.ip_address);

      const userMap = new Map<string, { full_name: string; email: string; session_count: number }>();
      sessions?.forEach((session: any) => {
        const userId = session.user_id;
        if (!userMap.has(userId)) {
          userMap.set(userId, {
            full_name: session.profiles.full_name,
            email: session.profiles.email,
            session_count: 0,
          });
        }
        userMap.get(userId)!.session_count += 1;
      });

      const users = Array.from(userMap.values()).sort((a, b) => b.session_count - a.session_count);

      return {
        location_name: d.location_name,
        ip_address: d.ip_address,
        color: d.color,
        session_count: d.session_count,
        total_hours: Math.round((d.total_time_seconds / 3600) * 10) / 10,
        percentage: 0,
        unique_users: d.unique_users,
        users,
      };
    }));

    setLocationStats(statsWithUsers);
  }

  async function loadDeviceStats() {
    const { data, error } = await supabase
      .from('session_analytics_by_device')
      .select('*')
      .order('total_time_seconds', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error loading device stats:', error);
      return;
    }

    const statsWithUsers = await Promise.all((data || []).map(async (d) => {
      const { data: sessions } = await supabase
        .from('user_sessions')
        .select(`
          user_id,
          profiles:user_id (
            full_name,
            email
          )
        `)
        .eq('device_type', d.device_type)
        .eq('browser_name', d.browser_name)
        .eq('os_name', d.os_name);

      const userMap = new Map<string, { full_name: string; email: string; session_count: number }>();
      sessions?.forEach((session: any) => {
        const userId = session.user_id;
        if (!userMap.has(userId)) {
          userMap.set(userId, {
            full_name: session.profiles.full_name,
            email: session.profiles.email,
            session_count: 0,
          });
        }
        userMap.get(userId)!.session_count += 1;
      });

      const users = Array.from(userMap.values()).sort((a, b) => b.session_count - a.session_count);

      return {
        device_type: d.device_type,
        browser_name: d.browser_name,
        os_name: d.os_name,
        session_count: d.session_count,
        total_hours: Math.round((d.total_time_seconds / 3600) * 10) / 10,
        percentage: 0,
        unique_users: d.unique_users,
        users,
      };
    }));

    setDeviceStats(statsWithUsers);
  }

  async function loadSchedule() {
    setScheduleLoading(true);
    setScheduleError(null);
    try {
      const [scheduleRes, historyRes] = await Promise.all([
        supabase
          .from('session_logout_schedule')
          .select('*')
          .limit(1)
          .maybeSingle(),
        supabase
          .from('session_cleanup_log')
          .select('id, execution_time, sessions_closed, success, error_message')
          .order('execution_time', { ascending: false })
          .limit(10),
      ]);
      if (scheduleRes.error) throw scheduleRes.error;
      if (scheduleRes.data) {
        setSchedule(scheduleRes.data);
        setEditEnabled(scheduleRes.data.enabled);
        setEditTime(scheduleRes.data.logout_time?.slice(0, 5) || '00:00');
        setEditTimezone(scheduleRes.data.timezone || 'UTC');
        setEditLabel(scheduleRes.data.label || 'Daily Session Logout');
      }
      if (!historyRes.error && historyRes.data) {
        setCleanupHistory(historyRes.data);
      }
    } catch (e: any) {
      setScheduleError(e.message || 'Failed to load schedule settings');
    } finally {
      setScheduleLoading(false);
    }
  }

  async function saveSchedule() {
    if (!schedule) return;
    setScheduleSaving(true);
    setScheduleError(null);
    setScheduleSaved(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('session_logout_schedule')
        .update({
          enabled: editEnabled,
          logout_time: editTime + ':00',
          timezone: editTimezone,
          label: editLabel,
          updated_by: user?.id,
        })
        .eq('id', schedule.id);
      if (error) throw error;
      await loadSchedule();
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 3000);
    } catch (e: any) {
      setScheduleError(e.message || 'Failed to save schedule');
    } finally {
      setScheduleSaving(false);
    }
  }

  async function runForceLogout() {
    setForceLogoutRunning(true);
    setForceLogoutConfirm(false);
    setForceLogoutResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/force-logout-all-users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scheduled: false }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || 'Force logout failed');
      setForceLogoutResult({ users: result.users_signed_out, sessions: result.sessions_closed });
      await loadActiveSessions();
      await loadSchedule();
    } catch (e: any) {
      setScheduleError(e.message || 'Force logout failed');
    } finally {
      setForceLogoutRunning(false);
    }
  }

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  function formatTotalTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  }

  function getDeviceIconComponent(deviceType: string | null) {
    if (!deviceType) return Monitor;
    switch (deviceType.toLowerCase()) {
      case 'mobile':
        return Smartphone;
      case 'tablet':
        return Tablet;
      case 'desktop':
        return Monitor;
      default:
        return Monitor;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading session data...</div>
      </div>
    );
  }

  const totalActiveUsers = activeSessions.length;
  const totalTimeToday = userStats.reduce((sum, user) => sum + user.total_time_seconds, 0);
  const uniqueLocations = new Set(activeSessions.map(s => s.ip_address).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-900">
          <Activity className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold">User Sessions</h2>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Now</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totalActiveUsers}</p>
            </div>
            <div className="p-2 bg-green-100 rounded-lg">
              <Users className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">All Users</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{allUsers.length}</p>
            </div>
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Locations</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{uniqueLocations}</p>
            </div>
            <div className="p-2 bg-orange-100 rounded-lg">
              <MapPin className="w-5 h-5 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Time ({timeRange})</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatTotalTime(totalTimeToday)}</p>
            </div>
            <div className="p-2 bg-gray-100 rounded-lg">
              <Clock className="w-5 h-5 text-gray-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="px-3 sm:px-6 py-3 sm:py-4">
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              <button
                onClick={() => setActiveTab('active')}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                  activeTab === 'active'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className="hidden sm:inline">Active Sessions</span>
                <span className="sm:hidden">Active</span>
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                  activeTab === 'users'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className="hidden sm:inline">All Users</span>
                <span className="sm:hidden">Users</span>
              </button>
              <button
                onClick={() => setActiveTab('locations')}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                  activeTab === 'locations'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Locations
              </button>
              <button
                onClick={() => setActiveTab('devices')}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                  activeTab === 'devices'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Devices
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm sm:text-base font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'schedule'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <CalendarClock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Logout Schedule</span>
                <span className="sm:hidden">Schedule</span>
                {schedule?.enabled && (
                  <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-green-400" />
                )}
              </button>
            </div>

            {activeTab === 'users' && (
              <div className="flex flex-wrap gap-1.5 mt-2 sm:mt-3">
                {(['today', 'week', 'month', 'all'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      timeRange === range
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {range.charAt(0).toUpperCase() + range.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-3 sm:p-6">
          {activeTab === 'active' && (
            <div className="space-y-3 sm:space-y-4">
              {activeSessions.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>No active sessions</p>
                </div>
              ) : (
                activeSessions.map((session) => {
                  const DeviceIcon = getDeviceIconComponent(session.device_type);
                  const locationNickname = session.ip_nickname;
                  const LocationIcon = locationNickname ? (ICON_MAP[locationNickname.icon] || MapPin) : MapPin;
                  const deviceNickname = session.device_nickname;
                  const DeviceNicknameIcon = deviceNickname ? (ICON_MAP[deviceNickname.icon] || Monitor) : null;

                  return (
                    <div key={session.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200 gap-3">
                      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                        <div className="relative flex-shrink-0">
                          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                          </div>
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 text-sm sm:text-base">{session.profiles.full_name}</div>
                          <div className="flex items-center gap-1.5 sm:gap-2 mt-1 flex-wrap">
                            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                              {session.profiles.role}
                            </span>
                            {deviceNickname ? (
                              <span
                                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                                style={{
                                  backgroundColor: deviceNickname.color + '20',
                                  color: deviceNickname.color
                                }}
                              >
                                {DeviceNicknameIcon && <DeviceNicknameIcon className="w-3 h-3" />}
                                {deviceNickname.nickname}
                              </span>
                            ) : session.device_type && (
                              <div className="relative inline-block">
                                <button
                                  onClick={() => {
                                    const sig = `${session.device_type || 'unknown'}|${session.browser_name || 'unknown'}|${session.os_name || 'unknown'}`;
                                    setDeviceNicknamePopover({ signature: sig, sessionId: session.id, deviceType: session.device_type, browserName: session.browser_name, osName: session.os_name });
                                    setDeviceNicknameCustom('');
                                  }}
                                  title="Click to assign a nickname to this device"
                                  className="flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-gray-700 rounded transition-colors group"
                                >
                                  <DeviceIcon className="w-3 h-3" />
                                  {session.device_type}
                                  <Tag className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                                </button>
                                {deviceNicknamePopover?.sessionId === session.id && (
                                  <div
                                    ref={deviceNicknamePopoverRef}
                                    className="absolute left-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-3 w-64"
                                  >
                                    <div className="flex items-center justify-between mb-2.5">
                                      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Name this device</span>
                                      <button
                                        onClick={() => { setDeviceNicknamePopover(null); setDeviceNicknameCustom(''); }}
                                        className="text-gray-400 hover:text-gray-600"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <p className="text-xs text-gray-500 mb-2.5 bg-gray-50 px-2 py-1 rounded space-y-0.5">
                                      <span className="block font-medium text-gray-700 capitalize">{session.device_type}</span>
                                      {session.browser_name && <span className="block">{session.browser_name}{session.os_name ? ` · ${session.os_name}` : ''}</span>}
                                    </p>
                                    <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                                      {DEVICE_PRESET_NICKNAMES.map((preset) => {
                                        const PresetIcon = ICON_MAP[preset.icon] || Monitor;
                                        return (
                                          <button
                                            key={preset.label}
                                            onClick={() => saveDeviceNickname(deviceNicknamePopover!.signature, preset.label, preset.icon, preset.color, session.device_type, session.browser_name, session.os_name)}
                                            disabled={deviceNicknameSaving}
                                            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 text-left"
                                            style={{ backgroundColor: preset.color + '15', color: preset.color }}
                                          >
                                            <PresetIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                            {preset.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <div className="flex gap-1.5">
                                      <input
                                        type="text"
                                        value={deviceNicknameCustom}
                                        onChange={(e) => setDeviceNicknameCustom(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && deviceNicknameCustom.trim()) {
                                            saveDeviceNickname(deviceNicknamePopover!.signature, deviceNicknameCustom.trim(), 'monitor', '#6B7280', session.device_type, session.browser_name, session.os_name);
                                          }
                                        }}
                                        placeholder="Custom name..."
                                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />
                                      <button
                                        onClick={() => {
                                          if (deviceNicknameCustom.trim()) {
                                            saveDeviceNickname(deviceNicknamePopover!.signature, deviceNicknameCustom.trim(), 'monitor', '#6B7280', session.device_type, session.browser_name, session.os_name);
                                          }
                                        }}
                                        disabled={!deviceNicknameCustom.trim() || deviceNicknameSaving}
                                        className="px-2.5 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                      >
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            {locationNickname ? (
                              <span
                                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                                style={{
                                  backgroundColor: locationNickname.color + '20',
                                  color: locationNickname.color
                                }}
                              >
                                <LocationIcon className="w-3 h-3" />
                                {locationNickname.nickname}
                              </span>
                            ) : session.ip_address && (
                              <div className="relative inline-block">
                                <button
                                  onClick={() => {
                                    setIpNicknamePopover({ ip: session.ip_address!, sessionId: session.id });
                                    setIpNicknameCustom('');
                                  }}
                                  title="Click to assign a nickname to this IP"
                                  className="flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-gray-700 rounded font-mono transition-colors group"
                                >
                                  {session.ip_address}
                                  <Tag className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                                </button>
                                {ipNicknamePopover?.ip === session.ip_address && (
                                  <div
                                    ref={ipNicknamePopoverRef}
                                    className="absolute left-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-3 w-64"
                                  >
                                    <div className="flex items-center justify-between mb-2.5">
                                      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Name this IP</span>
                                      <button
                                        onClick={() => { setIpNicknamePopover(null); setIpNicknameCustom(''); }}
                                        className="text-gray-400 hover:text-gray-600"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <p className="text-xs text-gray-500 font-mono mb-2.5 bg-gray-50 px-2 py-1 rounded">{session.ip_address}</p>
                                    <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                                      {IP_PRESET_NICKNAMES.map((preset) => {
                                        const PresetIcon = ICON_MAP[preset.icon] || MapPin;
                                        return (
                                          <button
                                            key={preset.label}
                                            onClick={() => saveIPNickname(session.ip_address!, preset.label, preset.icon, preset.color)}
                                            disabled={ipNicknameSaving}
                                            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 text-left"
                                            style={{ backgroundColor: preset.color + '15', color: preset.color }}
                                          >
                                            <PresetIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                            {preset.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <div className="flex gap-1.5">
                                      <input
                                        type="text"
                                        value={ipNicknameCustom}
                                        onChange={(e) => setIpNicknameCustom(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && ipNicknameCustom.trim()) {
                                            saveIPNickname(session.ip_address!, ipNicknameCustom.trim(), 'map-pin', '#6B7280');
                                          }
                                        }}
                                        placeholder="Custom name..."
                                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />
                                      <button
                                        onClick={() => {
                                          if (ipNicknameCustom.trim()) {
                                            saveIPNickname(session.ip_address!, ipNicknameCustom.trim(), 'map-pin', '#6B7280');
                                          }
                                        }}
                                        disabled={!ipNicknameCustom.trim() || ipNicknameSaving}
                                        className="px-2.5 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                      >
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start sm:text-right sm:ml-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-200">
                        <div className="flex items-center gap-1.5 sm:gap-2 text-sm text-gray-600 sm:mb-1">
                          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span className="font-medium">{formatDuration(session.duration_seconds)}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDistanceToNow(session.last_activity)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'users' && (
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <table className="w-full min-w-[400px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8"></th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Last Device</th>
                    <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Last Location</th>
                    <th className="px-2 sm:px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {allUsers.map((user) => {
                    const isExpanded = expandedUsers.has(user.user_id);
                    const sessions = userSessionHistory.get(user.user_id) || [];
                    const deviceNickname = user.device_nickname;
                    const locationNickname = user.location_nickname;
                    const LocationIcon = locationNickname ? (ICON_MAP[locationNickname.icon] || MapPin) : MapPin;
                    const DeviceNicknameIcon = deviceNickname ? (ICON_MAP[deviceNickname.icon] || Monitor) : null;

                    const toggleExpand = async () => {
                      const newExpanded = new Set(expandedUsers);
                      if (isExpanded) {
                        newExpanded.delete(user.user_id);
                      } else {
                        newExpanded.add(user.user_id);
                        await loadUserSessionHistory(user.user_id);
                      }
                      setExpandedUsers(newExpanded);
                    };

                    return (
                      <>
                        <tr key={user.user_id} className="hover:bg-gray-50">
                          <td className="px-2 sm:px-4 py-3">
                            <button
                              onClick={toggleExpand}
                              className="p-1.5 hover:bg-gray-200 rounded"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-gray-600" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-600" />
                              )}
                            </button>
                          </td>
                          <td className="px-2 sm:px-4 py-3">
                            <div className="font-medium text-gray-900 text-sm">{user.full_name}</div>
                            <div className="text-xs text-gray-500 truncate max-w-[120px] sm:max-w-none">{user.email}</div>
                          </td>
                          <td className="px-2 sm:px-4 py-3">
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${user.is_online ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                              <span className="text-xs sm:text-sm text-gray-600">
                                {user.is_online ? 'Online' : 'Offline'}
                              </span>
                              {user.is_clocked_in && (
                                <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                                  Clocked In
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 sm:px-4 py-3 hidden md:table-cell">
                            {deviceNickname ? (
                              <span
                                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded w-fit"
                                style={{
                                  backgroundColor: deviceNickname.color + '20',
                                  color: deviceNickname.color
                                }}
                              >
                                {DeviceNicknameIcon && <DeviceNicknameIcon className="w-3.5 h-3.5" />}
                                {deviceNickname.nickname}
                              </span>
                            ) : user.primary_device ? (
                              <span className="text-xs text-gray-500">
                                {user.primary_device.split('|')[0]}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-2 sm:px-4 py-3 hidden lg:table-cell">
                            {locationNickname ? (
                              <span
                                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded w-fit"
                                style={{
                                  backgroundColor: locationNickname.color + '20',
                                  color: locationNickname.color
                                }}
                              >
                                <LocationIcon className="w-3.5 h-3.5" />
                                {locationNickname.nickname}
                              </span>
                            ) : user.primary_location ? (
                              <span className="text-xs font-mono text-gray-500">{user.primary_location}</span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-2 sm:px-4 py-3 text-right">
                            <span className="text-xs text-gray-500 whitespace-nowrap">
                              {user.last_seen ? formatDistanceToNow(user.last_seen) : 'Never'}
                            </span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className="px-4 py-3 bg-gray-50">
                              <div className="pl-12">
                                <div className="text-xs font-medium text-gray-500 uppercase mb-3">Last 50 Sessions</div>
                                {sessions.length === 0 ? (
                                  <div className="text-center py-8 text-gray-500">
                                    <Activity className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                                    <p className="text-sm">No session history</p>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {sessions.map((session) => {
                                      const DeviceIcon = getDeviceIconComponent(session.device_type);
                                      const sessionLocationNickname = session.ip_nickname;
                                      const SessionLocationIcon = sessionLocationNickname ? (ICON_MAP[sessionLocationNickname.icon] || MapPin) : MapPin;
                                      const sessionDeviceNickname = session.device_nickname;
                                      const SessionDeviceNicknameIcon = sessionDeviceNickname ? (ICON_MAP[sessionDeviceNickname.icon] || Monitor) : null;

                                      return (
                                        <div key={session.id} className="p-3 bg-white rounded border border-gray-200">
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                              <div className="flex items-center gap-2 mb-2">
                                                <Calendar className="w-4 h-4 text-gray-400" />
                                                <span className="text-sm font-medium text-gray-900">
                                                  {new Date(session.session_start).toLocaleString()}
                                                </span>
                                                {session.is_active && (
                                                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                                    Active
                                                  </span>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-2 flex-wrap text-xs">
                                                {sessionDeviceNickname ? (
                                                  <span
                                                    className="flex items-center gap-1 px-2 py-1 rounded"
                                                    style={{
                                                      backgroundColor: sessionDeviceNickname.color + '20',
                                                      color: sessionDeviceNickname.color
                                                    }}
                                                  >
                                                    {SessionDeviceNicknameIcon && <SessionDeviceNicknameIcon className="w-3 h-3" />}
                                                    {sessionDeviceNickname.nickname}
                                                  </span>
                                                ) : session.device_type && (
                                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                                                    <DeviceIcon className="w-3 h-3" />
                                                    {session.device_type}
                                                  </span>
                                                )}
                                                {sessionLocationNickname ? (
                                                  <span
                                                    className="flex items-center gap-1 px-2 py-1 rounded"
                                                    style={{
                                                      backgroundColor: sessionLocationNickname.color + '20',
                                                      color: sessionLocationNickname.color
                                                    }}
                                                  >
                                                    <SessionLocationIcon className="w-3 h-3" />
                                                    {sessionLocationNickname.nickname}
                                                  </span>
                                                ) : session.ip_address && (
                                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded font-mono">
                                                    {session.ip_address}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            <div className="text-right">
                                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                                <Clock className="w-4 h-4" />
                                                <span className="font-medium">{formatDuration(session.duration_seconds)}</span>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>

              {allUsers.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>No users found</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'locations' && (
            <div>
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setShowManageLocations(true)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  Manage Nicknames
                </button>
              </div>

              <div className="overflow-x-auto -mx-3 sm:mx-0">
                <table className="w-full min-w-[360px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8"></th>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">IP Address</th>
                      <th className="px-2 sm:px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Users</th>
                      <th className="px-2 sm:px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sessions</th>
                      <th className="px-2 sm:px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {locationStats.map((location, index) => {
                      const LocationIcon = MapPin;
                      const isExpanded = expandedLocations.has(location.ip_address);
                      const toggleExpand = () => {
                        const newExpanded = new Set(expandedLocations);
                        if (isExpanded) {
                          newExpanded.delete(location.ip_address);
                        } else {
                          newExpanded.add(location.ip_address);
                        }
                        setExpandedLocations(newExpanded);
                      };

                      return (
                        <>
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-2 sm:px-4 py-3">
                              <button
                                onClick={toggleExpand}
                                className="p-1.5 hover:bg-gray-200 rounded"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-gray-600" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-600" />
                                )}
                              </button>
                            </td>
                            <td className="px-2 sm:px-4 py-3">
                              <div className="flex items-center gap-2">
                                {location.color ? (
                                  <div
                                    className="p-1.5 rounded flex-shrink-0"
                                    style={{ backgroundColor: location.color + '20' }}
                                  >
                                    <LocationIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: location.color }} />
                                  </div>
                                ) : (
                                  <LocationIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 flex-shrink-0" />
                                )}
                                <span className="font-medium text-gray-900 text-sm">{location.location_name}</span>
                              </div>
                            </td>
                            <td className="px-2 sm:px-4 py-3 hidden sm:table-cell">
                              <span className="text-xs sm:text-sm font-mono text-gray-600">{location.ip_address}</span>
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right hidden md:table-cell">
                              <span className="text-sm font-medium text-gray-900">{location.unique_users}</span>
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right">
                              <span className="text-sm font-medium text-gray-900">{location.session_count}</span>
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right">
                              <span className="text-sm font-medium text-gray-900">{location.total_hours}h</span>
                            </td>
                          </tr>
                          {isExpanded && location.users && location.users.length > 0 && (
                            <tr>
                              <td colSpan={6} className="px-4 py-3 bg-gray-50">
                                <div className="pl-12">
                                  <div className="text-xs font-medium text-gray-500 uppercase mb-2">Users at this location:</div>
                                  <div className="space-y-2">
                                    {location.users.map((user, userIndex) => (
                                      <div key={userIndex} className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                                        <div>
                                          <div className="text-sm font-medium text-gray-900">{user.full_name}</div>
                                          <div className="text-xs text-gray-500">{user.email}</div>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          {user.session_count} session{user.session_count !== 1 ? 's' : ''}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>

                {locationStats.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <MapPin className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p>No location data available</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'devices' && (
            <div>
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setShowManageDevices(true)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  Manage Nicknames
                </button>
              </div>

              <div className="overflow-x-auto -mx-3 sm:mx-0">
                <table className="w-full min-w-[360px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8"></th>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Browser</th>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">OS</th>
                      <th className="px-2 sm:px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Users</th>
                      <th className="px-2 sm:px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sessions</th>
                      <th className="px-2 sm:px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {deviceStats.map((device, index) => {
                      const DeviceIcon = getDeviceIconComponent(device.device_type);
                      const isExpanded = expandedDevices.has(index);
                      const toggleExpand = () => {
                        const newExpanded = new Set(expandedDevices);
                        if (isExpanded) {
                          newExpanded.delete(index);
                        } else {
                          newExpanded.add(index);
                        }
                        setExpandedDevices(newExpanded);
                      };

                      return (
                        <>
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-2 sm:px-4 py-3">
                              <button
                                onClick={toggleExpand}
                                className="p-1.5 hover:bg-gray-200 rounded"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-gray-600" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-600" />
                                )}
                              </button>
                            </td>
                            <td className="px-2 sm:px-4 py-3">
                              <div className="flex items-center gap-2">
                                <DeviceIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                                <div>
                                  <span className="font-medium text-gray-900 capitalize text-sm">{device.device_type}</span>
                                  <div className="text-xs text-gray-500 md:hidden">{device.browser_name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 sm:px-4 py-3 hidden md:table-cell">
                              <span className="text-sm text-gray-600">{device.browser_name}</span>
                            </td>
                            <td className="px-2 sm:px-4 py-3 hidden lg:table-cell">
                              <span className="text-sm text-gray-600">{device.os_name}</span>
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right hidden sm:table-cell">
                              <span className="text-sm font-medium text-gray-900">{device.unique_users}</span>
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right">
                              <span className="text-sm font-medium text-gray-900">{device.session_count}</span>
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right">
                              <span className="text-sm font-medium text-gray-900">{device.total_hours}h</span>
                            </td>
                          </tr>
                          {isExpanded && device.users && device.users.length > 0 && (
                            <tr>
                              <td colSpan={7} className="px-4 py-3 bg-gray-50">
                                <div className="pl-12">
                                  <div className="text-xs font-medium text-gray-500 uppercase mb-2">Users using this device:</div>
                                  <div className="space-y-2">
                                    {device.users.map((user, userIndex) => (
                                      <div key={userIndex} className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                                        <div>
                                          <div className="text-sm font-medium text-gray-900">{user.full_name}</div>
                                          <div className="text-xs text-gray-500">{user.email}</div>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          {user.session_count} session{user.session_count !== 1 ? 's' : ''}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>

                {deviceStats.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Monitor className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p>No device data available</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-6">
              {scheduleLoading ? (
                <div className="flex items-center justify-center py-16 text-gray-500">
                  <RotateCcw className="w-5 h-5 animate-spin mr-2" />
                  Loading schedule settings...
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">How scheduled logout works</p>
                      <p>When enabled, all user sessions will be forcibly terminated at the configured time each day. This revokes active authentication tokens so users must log back in. Useful for enforcing end-of-day security policies or daily session resets.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                    <div className="space-y-5">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Settings className="w-4 h-4 text-gray-500" />
                        Schedule Configuration
                      </h3>

                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div>
                          <p className="font-medium text-gray-900">Enable Daily Logout</p>
                          <p className="text-sm text-gray-500 mt-0.5">Automatically log out all users at the scheduled time</p>
                        </div>
                        <button
                          onClick={() => setEditEnabled(!editEnabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${editEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Logout Time</label>
                        <input
                          type="time"
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {editEnabled
                            ? `Next logout: ${getNextRunLabel(editTime, editTimezone)} (${editTimezone})`
                            : 'Schedule is currently disabled'}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                        <select
                          value={editTimezone}
                          onChange={(e) => setEditTimezone(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                        >
                          {COMMON_TIMEZONES.map((tz) => (
                            <option key={tz.value} value={tz.value}>{tz.label}</option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">The timezone your team uses when interpreting the logout time.</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Label / Note</label>
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          placeholder="e.g. End of business day logout"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                        />
                      </div>

                      {scheduleError && (
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                          {scheduleError}
                        </div>
                      )}

                      {scheduleSaved && (
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                          <CheckCircle className="w-4 h-4" />
                          Schedule saved successfully.
                        </div>
                      )}

                      <button
                        onClick={saveSchedule}
                        disabled={scheduleSaving}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                      >
                        {scheduleSaving ? (
                          <><RotateCcw className="w-4 h-4 animate-spin" /> Saving...</>
                        ) : (
                          <><CheckCircle className="w-4 h-4" /> Save Schedule</>
                        )}
                      </button>
                    </div>

                    <div className="space-y-5">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-gray-500" />
                        Status & History
                      </h3>

                      {schedule && (
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Schedule Status</span>
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${schedule.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${schedule.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                              {schedule.enabled ? 'Active' : 'Disabled'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Configured Time</span>
                            <span className="text-sm font-medium text-gray-900">
                              {schedule.logout_time?.slice(0, 5)} {schedule.timezone}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Last Ran</span>
                            <span className="text-sm text-gray-900">
                              {cleanupHistory.length > 0 && cleanupHistory[0].success
                                ? formatDistanceToNow(cleanupHistory[0].execution_time)
                                : schedule.last_run_at
                                  ? formatDistanceToNow(schedule.last_run_at)
                                  : <span className="text-gray-400 italic text-xs">Never</span>}
                            </span>
                          </div>
                          {(cleanupHistory.length > 0 || schedule.last_run_at) && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">Sessions Closed (last run)</span>
                              <span className="text-sm font-medium text-gray-900">
                                {cleanupHistory.length > 0 ? cleanupHistory[0].sessions_closed : schedule.last_run_count ?? 0}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Currently Active Sessions</span>
                            <span className="text-sm font-medium text-gray-900">{activeSessions.length}</span>
                          </div>
                        </div>
                      )}

                      {cleanupHistory.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-gray-500" />
                            Cleanup History
                          </h4>
                          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                            {cleanupHistory.map((entry) => (
                              <div key={entry.id} className="flex items-center justify-between px-3 py-2 text-xs bg-white hover:bg-gray-50">
                                <div className="flex items-center gap-2">
                                  {entry.success ? (
                                    <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                  ) : (
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                  )}
                                  <span className="text-gray-700">
                                    {new Date(entry.execution_time).toLocaleString(undefined, {
                                      month: 'short', day: 'numeric', year: 'numeric',
                                      hour: '2-digit', minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  {entry.success ? (
                                    <span className="text-gray-500">{entry.sessions_closed} session{entry.sessions_closed !== 1 ? 's' : ''} closed</span>
                                  ) : (
                                    <span className="text-red-600 truncate max-w-[160px]" title={entry.error_message || ''}>
                                      {entry.error_message || 'Error'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="border border-red-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 bg-red-50 border-b border-red-200">
                          <p className="text-sm font-semibold text-red-800 flex items-center gap-2">
                            <LogOut className="w-4 h-4" />
                            Force Logout All Users Now
                          </p>
                          <p className="text-xs text-red-600 mt-0.5">
                            Immediately revokes all active sessions. Users must log back in.
                          </p>
                        </div>
                        <div className="p-4 bg-white">
                          {forceLogoutResult && (
                            <div className="mb-3 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                              <CheckCircle className="w-4 h-4 shrink-0" />
                              Signed out {forceLogoutResult.users} user(s) and closed {forceLogoutResult.sessions} session(s).
                            </div>
                          )}

                          {!forceLogoutConfirm ? (
                            <button
                              onClick={() => { setForceLogoutConfirm(true); setForceLogoutResult(null); setScheduleError(null); }}
                              disabled={forceLogoutRunning || activeSessions.length === 0}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors text-sm"
                            >
                              <LogOut className="w-4 h-4" />
                              {activeSessions.length === 0 ? 'No Active Sessions' : `Force Logout All ${activeSessions.length} User(s)`}
                            </button>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>This will immediately sign out <strong>{activeSessions.length} active user(s)</strong>. Are you sure?</span>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setForceLogoutConfirm(false)}
                                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={runForceLogout}
                                  disabled={forceLogoutRunning}
                                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium text-sm transition-colors"
                                >
                                  {forceLogoutRunning ? (
                                    <><RotateCcw className="w-3.5 h-3.5 animate-spin" /> Running...</>
                                  ) : (
                                    <><LogOut className="w-3.5 h-3.5" /> Confirm Logout</>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showManageLocations && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Manage Location Nicknames</h3>
              <button
                onClick={() => setShowManageLocations(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <IPNicknameManager />
            </div>
          </div>
        </div>
      )}

      {showManageDevices && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Manage Device Nicknames</h3>
              <button
                onClick={() => setShowManageDevices(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <DeviceNicknameManager />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
