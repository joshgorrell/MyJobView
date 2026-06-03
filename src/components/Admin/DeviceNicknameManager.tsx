import { useEffect, useState } from 'react';
import { Monitor, Smartphone, Tablet, Plus, Edit2, Trash2, Save, X, Laptop, Tv, Watch } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDistanceToNow } from '../../lib/utils';
import ConfirmModal from '../ui/ConfirmModal';

interface DeviceNickname {
  id: string;
  device_signature: string;
  device_type: string | null;
  browser_name: string | null;
  os_name: string | null;
  nickname: string;
  description: string | null;
  color: string;
  icon: string;
  first_seen: string;
  last_seen: string;
  session_count: number;
  total_time_seconds: number;
}

const PRESET_NICKNAMES = [
  { label: 'Work Laptop', icon: 'laptop', color: '#3B82F6' },
  { label: 'Personal Phone', icon: 'smartphone', color: '#10B981' },
  { label: 'Home Desktop', icon: 'monitor', color: '#8B5CF6' },
  { label: 'Office Desktop', icon: 'monitor', color: '#F59E0B' },
  { label: 'iPad', icon: 'tablet', color: '#EC4899' },
  { label: 'Conference Room', icon: 'tv', color: '#6366F1' },
];

const ICON_MAP: { [key: string]: any } = {
  'monitor': Monitor,
  'smartphone': Smartphone,
  'tablet': Tablet,
  'laptop': Laptop,
  'tv': Tv,
  'watch': Watch,
};

export function DeviceNicknameManager() {
  const [deviceNicknames, setDeviceNicknames] = useState<DeviceNickname[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nickname: '',
    description: '',
    color: '#10B981',
    icon: 'monitor',
  });

  useEffect(() => {
    loadDeviceNicknames();
  }, []);

  async function loadDeviceNicknames() {
    try {
      const { data, error } = await supabase
        .from('device_nicknames')
        .select('*')
        .order('last_seen', { ascending: false });

      if (error) throw error;
      setDeviceNicknames(data || []);
    } catch (error) {
      console.error('Error loading device nicknames:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(deviceId: string) {
    try {
      const { error } = await supabase
        .from('device_nicknames')
        .update({
          nickname: formData.nickname,
          description: formData.description,
          color: formData.color,
          icon: formData.icon,
        })
        .eq('id', deviceId);

      if (error) throw error;

      setEditingId(null);
      resetForm();
      loadDeviceNicknames();
    } catch (error) {
      console.error('Error saving device nickname:', error);
      alert('Error saving device nickname');
    }
  }

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase
        .from('device_nicknames')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadDeviceNicknames();
    } catch (error) {
      console.error('Error deleting device nickname:', error);
      alert('Error deleting device nickname');
    }
  }

  function startEdit(device: DeviceNickname) {
    setEditingId(device.id);
    setFormData({
      nickname: device.nickname,
      description: device.description || '',
      color: device.color,
      icon: device.icon,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    resetForm();
  }

  function resetForm() {
    setFormData({
      nickname: '',
      description: '',
      color: '#10B981',
      icon: 'monitor',
    });
  }

  function applyPreset(preset: typeof PRESET_NICKNAMES[0]) {
    setFormData({
      ...formData,
      nickname: preset.label,
      color: preset.color,
      icon: preset.icon,
    });
  }

  function formatDuration(seconds: number): string {
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    return `${hours}h`;
  }

  function getDeviceTypeIcon(deviceType: string | null) {
    if (deviceType === 'mobile') return Smartphone;
    if (deviceType === 'tablet') return Tablet;
    return Monitor;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading devices...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-900">
          <Monitor className="w-6 h-6 text-green-600" />
          <div>
            <h2 className="text-xl font-bold">Device Nicknames</h2>
            <p className="text-sm text-gray-500">Give friendly names to devices used by your team</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device Info</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nickname</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sessions</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total Time</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Last Seen</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {deviceNicknames.map((device) => {
                const IconComponent = ICON_MAP[device.icon] || Monitor;
                const DeviceTypeIcon = getDeviceTypeIcon(device.device_type);
                const isEditing = editingId === device.id;

                if (isEditing) {
                  return (
                    <tr key={device.id} className="bg-green-50">
                      <td className="px-4 py-3 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <DeviceTypeIcon className="w-4 h-4" />
                          <div>
                            <div className="font-medium">{device.device_type || 'unknown'}</div>
                            <div className="text-xs text-gray-500">
                              {device.browser_name} on {device.os_name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3" colSpan={4}>
                        <div className="space-y-3">
                          <div className="flex gap-2 flex-wrap">
                            {PRESET_NICKNAMES.map((preset) => {
                              const PresetIcon = ICON_MAP[preset.icon];
                              return (
                                <button
                                  key={preset.label}
                                  onClick={() => applyPreset(preset)}
                                  className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-gray-50 rounded text-xs border border-gray-200"
                                >
                                  <PresetIcon className="w-3 h-3" style={{ color: preset.color }} />
                                  {preset.label}
                                </button>
                              );
                            })}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            <input
                              type="text"
                              value={formData.nickname}
                              onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                              placeholder="Device nickname"
                            />
                            <input
                              type="text"
                              value={formData.description}
                              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                              placeholder="Description"
                            />
                            <input
                              type="color"
                              value={formData.color}
                              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                              className="w-full h-8 border border-gray-300 rounded cursor-pointer"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleSave(device.id)}
                            className="p-1.5 bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={device.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <DeviceTypeIcon className="w-4 h-4 text-gray-500" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {device.device_type || 'unknown'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {device.browser_name} on {device.os_name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="p-1.5 rounded"
                          style={{ backgroundColor: device.color + '20' }}
                        >
                          <IconComponent className="w-4 h-4" style={{ color: device.color }} />
                        </div>
                        <span className="text-sm font-medium text-gray-900">{device.nickname}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-500">{device.description || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-medium text-gray-900">{device.session_count}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-600">{formatDuration(device.total_time_seconds)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-gray-500">
                        {formatDistanceToNow(device.last_seen)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => startEdit(device)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(device.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {deviceNicknames.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Monitor className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No devices found yet</p>
              <p className="text-sm mt-1">Device nicknames are created automatically when users log in</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Device Nickname"
        message="Are you sure you want to delete this device nickname?"
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteId) handleDelete(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
