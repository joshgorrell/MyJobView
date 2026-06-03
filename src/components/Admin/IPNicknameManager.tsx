import { useEffect, useState } from 'react';
import { MapPin, Plus, Edit2, Trash2, Save, X, Home, Building2, Wifi, Coffee, Shield, Smartphone } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDistanceToNow } from '../../lib/utils';
import ConfirmModal from '../ui/ConfirmModal';

interface IPNickname {
  id: string;
  ip_address: string;
  nickname: string;
  description: string | null;
  color: string;
  icon: string;
  first_seen: string;
  last_seen: string;
  session_count: number;
  total_time_seconds: number;
  is_trusted: boolean;
}

const PRESET_NICKNAMES = [
  { label: 'Home', icon: 'home', color: '#10B981' },
  { label: 'Office', icon: 'building-2', color: '#3B82F6' },
  { label: 'VPN', icon: 'shield', color: '#8B5CF6' },
  { label: 'Mobile Data', icon: 'smartphone', color: '#F59E0B' },
  { label: 'Coffee Shop', icon: 'coffee', color: '#EC4899' },
  { label: 'Remote', icon: 'wifi', color: '#6366F1' },
];

const ICON_MAP: { [key: string]: any } = {
  'home': Home,
  'building-2': Building2,
  'shield': Shield,
  'smartphone': Smartphone,
  'coffee': Coffee,
  'wifi': Wifi,
  'map-pin': MapPin,
};

export function IPNicknameManager() {
  const [ipNicknames, setIpNicknames] = useState<IPNickname[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    ip_address: '',
    nickname: '',
    description: '',
    color: '#3B82F6',
    icon: 'map-pin',
    is_trusted: true,
  });

  useEffect(() => {
    loadIPNicknames();
  }, []);

  async function loadIPNicknames() {
    try {
      const { data, error } = await supabase
        .from('ip_nicknames')
        .select('*')
        .order('last_seen', { ascending: false });

      if (error) throw error;
      setIpNicknames(data || []);
    } catch (error) {
      console.error('Error loading IP nicknames:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      if (editingId) {
        const { error } = await supabase
          .from('ip_nicknames')
          .update({
            nickname: formData.nickname,
            description: formData.description,
            color: formData.color,
            icon: formData.icon,
            is_trusted: formData.is_trusted,
          })
          .eq('id', editingId);

        if (error) throw error;
      } else if (addingNew) {
        const { error } = await supabase
          .from('ip_nicknames')
          .insert({
            ip_address: formData.ip_address,
            nickname: formData.nickname,
            description: formData.description,
            color: formData.color,
            icon: formData.icon,
            is_trusted: formData.is_trusted,
          });

        if (error) throw error;
      }

      setEditingId(null);
      setAddingNew(false);
      resetForm();
      loadIPNicknames();
    } catch (error) {
      console.error('Error saving IP nickname:', error);
      alert('Error saving IP nickname');
    }
  }

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase
        .from('ip_nicknames')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadIPNicknames();
    } catch (error) {
      console.error('Error deleting IP nickname:', error);
      alert('Error deleting IP nickname');
    }
  }

  function startEdit(ipNickname: IPNickname) {
    setEditingId(ipNickname.id);
    setFormData({
      ip_address: ipNickname.ip_address,
      nickname: ipNickname.nickname,
      description: ipNickname.description || '',
      color: ipNickname.color,
      icon: ipNickname.icon,
      is_trusted: ipNickname.is_trusted,
    });
  }

  function startAddNew() {
    setAddingNew(true);
    resetForm();
  }

  function cancelEdit() {
    setEditingId(null);
    setAddingNew(false);
    resetForm();
  }

  function resetForm() {
    setFormData({
      ip_address: '',
      nickname: '',
      description: '',
      color: '#3B82F6',
      icon: 'map-pin',
      is_trusted: true,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading IP addresses...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-900">
          <MapPin className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold">IP Address Nicknames</h2>
        </div>
        {!addingNew && (
          <button
            onClick={startAddNew}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Nickname
          </button>
        )}
      </div>

      {addingNew && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New IP Nickname</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                IP Address
              </label>
              <input
                type="text"
                value={formData.ip_address}
                onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="192.168.1.1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quick Presets
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_NICKNAMES.map((preset) => {
                  const IconComponent = ICON_MAP[preset.icon];
                  return (
                    <button
                      key={preset.label}
                      onClick={() => applyPreset(preset)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
                    >
                      <IconComponent className="w-4 h-4" style={{ color: preset.color }} />
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nickname
              </label>
              <input
                type="text"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Home, Office, VPN"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Additional notes about this location"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-full h-10 border border-gray-300 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trusted Location
                </label>
                <label className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={formData.is_trusted}
                    onChange={(e) => setFormData({ ...formData, is_trusted: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">Mark as trusted</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={!formData.ip_address || !formData.nickname}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
              <button
                onClick={cancelEdit}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nickname</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sessions</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total Time</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Last Seen</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {ipNicknames.map((ipNickname) => {
                const IconComponent = ICON_MAP[ipNickname.icon] || MapPin;
                const isEditing = editingId === ipNickname.id;

                if (isEditing) {
                  return (
                    <tr key={ipNickname.id} className="bg-blue-50">
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {ipNickname.ip_address}
                      </td>
                      <td className="px-4 py-3" colSpan={5}>
                        <div className="space-y-3">
                          <div className="flex gap-2">
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
                              placeholder="Nickname"
                            />
                            <input
                              type="text"
                              value={formData.description}
                              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                              placeholder="Description"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={formData.color}
                                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                className="w-10 h-8 border border-gray-300 rounded cursor-pointer"
                              />
                              <label className="flex items-center gap-1 text-xs">
                                <input
                                  type="checkbox"
                                  checked={formData.is_trusted}
                                  onChange={(e) => setFormData({ ...formData, is_trusted: e.target.checked })}
                                  className="w-3 h-3"
                                />
                                Trusted
                              </label>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={handleSave}
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
                  <tr key={ipNickname.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-gray-600">{ipNickname.ip_address}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="p-1.5 rounded"
                          style={{ backgroundColor: ipNickname.color + '20' }}
                        >
                          <IconComponent className="w-4 h-4" style={{ color: ipNickname.color }} />
                        </div>
                        <span className="text-sm font-medium text-gray-900">{ipNickname.nickname}</span>
                        {!ipNickname.is_trusted && (
                          <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                            Untrusted
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-500">{ipNickname.description || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-medium text-gray-900">{ipNickname.session_count}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-600">{formatDuration(ipNickname.total_time_seconds)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-gray-500">
                        {formatDistanceToNow(ipNickname.last_seen)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => startEdit(ipNickname)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(ipNickname.id)}
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

          {ipNicknames.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <MapPin className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No IP nicknames configured yet</p>
              <p className="text-sm mt-1">Add nicknames to track where users log in from</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete IP Nickname"
        message="Are you sure you want to delete this IP nickname?"
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
