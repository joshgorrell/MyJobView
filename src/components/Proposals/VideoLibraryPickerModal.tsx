import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  X, Film, Search, Users, Video, Play, Loader2, AlertCircle, Check
} from 'lucide-react';
import { LibraryVideo } from '../Sales/VideoLibrary';

const VIDEO_TYPES = [
  { value: 'thank_you', label: 'Thank You', color: 'bg-green-100 text-green-700' },
  { value: 'introduction', label: 'Introduction', color: 'bg-blue-100 text-blue-700' },
  { value: 'general', label: 'General', color: 'bg-gray-100 text-gray-700' },
  { value: 'other', label: 'Other', color: 'bg-amber-100 text-amber-700' },
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function TypeBadge({ type }: { type: string }) {
  const t = VIDEO_TYPES.find(v => v.value === type);
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${t?.color ?? 'bg-gray-100 text-gray-700'}`}>
      {t?.label ?? type}
    </span>
  );
}

interface VideoLibraryPickerModalProps {
  proposalId: string;
  currentRoomId?: string | null;
  scope?: 'full_proposal' | 'area';
  sortOrder?: number;
  onClose: () => void;
  onAdded: () => void;
}

export function VideoLibraryPickerModal({
  proposalId,
  currentRoomId = null,
  scope = 'full_proposal',
  sortOrder = 0,
  onClose,
  onAdded,
}: VideoLibraryPickerModalProps) {
  const { profile } = useAuth();
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'mine' | 'team'>('mine');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const loadVideos = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data: own } = await supabase
        .from('staff_video_library')
        .select('*')
        .eq('created_by', profile.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      const { data: team } = await supabase
        .from('staff_video_library')
        .select('*, profiles!created_by(full_name, username)')
        .eq('is_public', true)
        .eq('is_active', true)
        .neq('created_by', profile.id)
        .order('created_at', { ascending: false });

      const ownList: LibraryVideo[] = own ?? [];
      const teamList: LibraryVideo[] = (team ?? []).map((v: any) => ({
        ...v,
        creator_name: v.profiles?.full_name || v.profiles?.username || 'Team Member',
      }));

      setVideos([...ownList.map(v => ({ ...v, _tab: 'mine' as const })), ...teamList.map(v => ({ ...v, _tab: 'team' as const }))]);

      const allPaths = [...ownList, ...teamList]
        .filter(v => v.storage_path)
        .map(v => v.storage_path!);

      if (allPaths.length > 0) {
        const urlMap: Record<string, string> = {};
        await Promise.all(
          allPaths.map(async (path) => {
            const { data } = await supabase.storage
              .from('proposal-recordings')
              .createSignedUrl(path, 3600);
            if (data?.signedUrl) urlMap[path] = data.signedUrl;
          })
        );
        setSignedUrls(urlMap);
      }
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { loadVideos(); }, [loadVideos]);

  async function handleAdd() {
    if (!selectedId || !profile) return;
    const video = videos.find(v => v.id === selectedId);
    if (!video) return;

    setAdding(true);
    setError(null);
    try {
      const { error: dbError } = await supabase
        .from('proposal_recordings')
        .insert({
          proposal_id: proposalId,
          room_id: currentRoomId,
          title: video.title,
          storage_path: video.storage_path,
          duration_seconds: video.duration_seconds,
          recording_scope: scope,
          is_portal_visible: true,
          sort_order: sortOrder,
          created_by: profile.id,
          library_video_id: video.id,
        });

      if (dbError) throw dbError;
      onAdded();
    } catch (err: any) {
      setError(err.message || 'Failed to add video.');
    } finally {
      setAdding(false);
    }
  }

  const tabVideos = videos.filter((v: any) => activeTab === 'mine' ? !v.creator_name : !!v.creator_name);
  const filtered = tabVideos.filter(v => {
    if (typeFilter !== 'all' && v.video_type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!v.title.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const myCount = videos.filter((v: any) => !v.creator_name).length;
  const teamCount = videos.filter((v: any) => !!v.creator_name).length;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <Film className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Add from Video Library</h2>
              <p className="text-xs text-gray-500">Select a saved video to attach to this proposal</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs + search */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => { setActiveTab('mine'); setSelectedId(null); }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'mine' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              Mine {myCount > 0 && <span className="text-xs text-gray-500">({myCount})</span>}
            </button>
            <button
              onClick={() => { setActiveTab('team'); setSelectedId(null); }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'team' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Team {teamCount > 0 && <span className="text-xs text-gray-500">({teamCount})</span>}
            </button>
          </div>

          <div className="relative flex-1 min-w-32">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search videos..."
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-1">
            {['all', ...VIDEO_TYPES.map(t => t.value)].map(f => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors capitalize ${
                  typeFilter === f ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? 'All' : VIDEO_TYPES.find(t => t.value === f)?.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Film className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">
                {activeTab === 'mine' ? 'No videos in your library yet.' : 'No shared team videos available.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(video => {
                const isSelected = selectedId === video.id;
                const isPreviewing = previewId === video.id;
                const url = video.storage_path ? signedUrls[video.storage_path] : null;

                return (
                  <div
                    key={video.id}
                    onClick={() => setSelectedId(isSelected ? null : video.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {/* Thumbnail / preview toggle */}
                    <div
                      className="flex-shrink-0 w-16 h-12 bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center relative"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (url) setPreviewId(isPreviewing ? null : video.id);
                      }}
                    >
                      {isPreviewing && url ? (
                        <video src={url} autoPlay controls className="w-full h-full object-cover" />
                      ) : (
                        <>
                          <Film className="w-6 h-6 text-gray-600" />
                          {url && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                              <Play className="w-4 h-4 text-white fill-current" />
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-800 truncate">{video.title}</span>
                        <TypeBadge type={video.video_type} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {video.duration_seconds != null && (
                          <span className="text-xs text-gray-500">{formatDuration(video.duration_seconds)}</span>
                        )}
                        {(video as any).creator_name && (
                          <span className="text-xs text-gray-400">by {(video as any).creator_name}</span>
                        )}
                      </div>
                    </div>

                    {/* Checkmark */}
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {error && (
          <div className="px-5 pb-2">
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          </div>
        )}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={adding}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedId || adding}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
            Add to Proposal
          </button>
        </div>
      </div>
    </div>
  );
}
