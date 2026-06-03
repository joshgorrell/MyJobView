import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Film, Plus, Upload, Trash2, Eye, EyeOff, Globe, Lock, Clock, AlertCircle, Loader2, Square, Mic, MicOff, Camera, CameraOff, Play, Search, X, Check, CreditCard as Edit2, Users, Video } from 'lucide-react';

export interface LibraryVideo {
  id: string;
  organization_id: string;
  created_by: string;
  title: string;
  description: string | null;
  video_type: 'thank_you' | 'introduction' | 'general' | 'other';
  storage_path: string | null;
  duration_seconds: number | null;
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  creator_name?: string;
}

type RecordingState = 'idle' | 'requesting' | 'recording' | 'processing' | 'uploading';

const VIDEO_TYPES: { value: LibraryVideo['video_type']; label: string; color: string }[] = [
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

function TypeBadge({ type }: { type: LibraryVideo['video_type'] }) {
  const t = VIDEO_TYPES.find(v => v.value === type);
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${t?.color ?? 'bg-gray-100 text-gray-700'}`}>
      {t?.label ?? type}
    </span>
  );
}

// ─── Inline recorder (library-scoped, saves to staff_video_library) ───────────
function LibraryRecorder({
  onRecorded,
  onCancel,
}: {
  onRecorded: () => void;
  onCancel: () => void;
}) {
  const { profile } = useAuth();
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [title, setTitle] = useState('');
  const [videoType, setVideoType] = useState<LibraryVideo['video_type']>('general');
  const [isPublic, setIsPublic] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    return () => {
      stopStream();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    setError(null);
    setRecordingState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioEnabled,
        video: videoEnabled ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
      });
      streamRef.current = stream;

      if (previewVideoRef.current && videoEnabled) {
        previewVideoRef.current.srcObject = stream;
        previewVideoRef.current.muted = true;
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => handleRecordingStop(mimeType);
      recorder.start(1000);
      setRecordingState('recording');
      setElapsed(0);
      setShowPreview(videoEnabled);
      timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000);
    } catch (err: any) {
      setError(
        err.name === 'NotAllowedError' ? 'Camera/microphone permission denied.' :
        err.name === 'NotFoundError' ? 'No camera or microphone found.' :
        `Error: ${err.message}`
      );
      setRecordingState('idle');
    }
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    mediaRecorderRef.current?.stop();
    stopStream();
    setShowPreview(false);
    setRecordingState('processing');
  }

  async function handleRecordingStop(mimeType: string) {
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
    const durationSeconds = elapsed;

    setRecordingState('uploading');
    setUploadProgress(0);

    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', profile!.id)
        .maybeSingle();

      const orgId = profileData?.organization_id || 'unknown';
      const videoId = crypto.randomUUID();
      const storagePath = `${orgId}/library/${profile!.id}/${videoId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('proposal-recordings')
        .upload(storagePath, blob, { contentType: mimeType || 'video/webm', upsert: false });

      if (uploadError) throw uploadError;
      setUploadProgress(80);

      const { error: dbError } = await supabase
        .from('staff_video_library')
        .insert({
          organization_id: orgId,
          created_by: profile!.id,
          title: title.trim() || 'My Video',
          video_type: videoType,
          storage_path: storagePath,
          duration_seconds: durationSeconds,
          is_public: isPublic,
        });

      if (dbError) throw dbError;

      setUploadProgress(100);
      setRecordingState('idle');
      setElapsed(0);
      onRecorded();
    } catch (err: any) {
      setError(`Upload failed: ${err.message}`);
      setRecordingState('idle');
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setRecordingState('uploading');
    setUploadProgress(0);
    setError(null);

    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', profile!.id)
        .maybeSingle();

      const orgId = profileData?.organization_id || 'unknown';
      const videoId = crypto.randomUUID();
      const ext = file.name.split('.').pop() || 'mp4';
      const storagePath = `${orgId}/library/${profile!.id}/${videoId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('proposal-recordings')
        .upload(storagePath, file, { contentType: file.type, upsert: false });

      if (uploadError) throw uploadError;
      setUploadProgress(80);

      const { error: dbError } = await supabase
        .from('staff_video_library')
        .insert({
          organization_id: orgId,
          created_by: profile!.id,
          title: title.trim() || file.name.replace(/\.[^.]+$/, ''),
          video_type: videoType,
          storage_path: storagePath,
          is_public: isPublic,
        });

      if (dbError) throw dbError;

      setUploadProgress(100);
      setRecordingState('idle');
      onRecorded();
    } catch (err: any) {
      setError(`Upload failed: ${err.message}`);
      setRecordingState('idle');
    }
  }

  const isRecording = recordingState === 'recording';
  const isBusy = recordingState !== 'idle';

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Add New Video</h3>
        {!isBusy && (
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Metadata fields */}
      {!isBusy && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Thank You Message"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select
              value={videoType}
              onChange={(e) => setVideoType(e.target.value as LibraryVideo['video_type'])}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {VIDEO_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Globe className="w-4 h-4 text-gray-500" />
              Share with team (visible to other reps in your organization)
            </label>
          </div>
        </div>
      )}

      {/* Live preview */}
      {showPreview && isRecording && (
        <div className="relative bg-black rounded-lg overflow-hidden aspect-video max-h-48">
          <video ref={previewVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            REC {formatDuration(elapsed)}
          </div>
        </div>
      )}

      {recordingState === 'uploading' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            <span className="text-sm text-blue-700 font-medium">Uploading video...</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-1.5">
            <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {(recordingState === 'processing' || recordingState === 'requesting') && (
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-100 p-3 rounded-lg">
          <Loader2 className="w-4 h-4 animate-spin" />
          {recordingState === 'processing' ? 'Processing recording...' : 'Requesting camera access...'}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {recordingState === 'idle' && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            title={audioEnabled ? 'Mute audio' : 'Enable audio'}
            className={`p-2 rounded-lg border transition-colors ${audioEnabled ? 'border-gray-300 text-gray-600 hover:bg-gray-100' : 'border-red-300 bg-red-50 text-red-600'}`}
          >
            {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setVideoEnabled(!videoEnabled)}
            title={videoEnabled ? 'Disable camera' : 'Enable camera'}
            className={`p-2 rounded-lg border transition-colors ${videoEnabled ? 'border-gray-300 text-gray-600 hover:bg-gray-100' : 'border-amber-300 bg-amber-50 text-amber-600'}`}
          >
            {videoEnabled ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
          </button>
          <button
            onClick={startRecording}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
          >
            <span className="w-2 h-2 bg-white rounded-full" />
            Record Video
          </button>
          <span className="text-gray-400 text-sm">or</span>
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium cursor-pointer">
            <Upload className="w-4 h-4" />
            Upload File
            <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      )}

      {isRecording && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-red-600 font-medium">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Recording {formatDuration(elapsed)}
          </div>
          <button
            onClick={stopRecording}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium"
          >
            <Square className="w-3 h-3 fill-current" />
            Stop
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Video card ────────────────────────────────────────────────────────────────
function VideoCard({
  video,
  signedUrl,
  isOwn,
  onDelete,
  onTogglePublic,
  onTitleChange,
  onTypeChange,
}: {
  video: LibraryVideo;
  signedUrl: string | null;
  isOwn: boolean;
  onDelete: (id: string) => void;
  onTogglePublic: (id: string, current: boolean) => void;
  onTitleChange: (id: string, title: string) => void;
  onTypeChange: (id: string, type: LibraryVideo['video_type']) => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(video.title);
  const [showVideo, setShowVideo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function saveTitle() {
    if (draftTitle.trim() && draftTitle.trim() !== video.title) {
      onTitleChange(video.id, draftTitle.trim());
    }
    setEditingTitle(false);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Video preview area */}
      <div
        className="relative bg-gray-900 aspect-video cursor-pointer group flex items-center justify-center"
        onClick={() => signedUrl && setShowVideo(!showVideo)}
      >
        {showVideo && signedUrl ? (
          <video
            src={signedUrl}
            controls
            autoPlay
            className="w-full h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <Film className="w-12 h-12 text-gray-600" />
            {signedUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-white/90 rounded-full p-3">
                  <Play className="w-6 h-6 text-gray-900 fill-current" />
                </div>
              </div>
            )}
            {video.duration_seconds != null && (
              <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                {formatDuration(video.duration_seconds)}
              </div>
            )}
          </>
        )}
      </div>

      {/* Card body */}
      <div className="p-3 space-y-2">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          {editingTitle ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                autoFocus
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                className="flex-1 text-sm border-b border-blue-500 bg-transparent focus:outline-none text-gray-800"
              />
              <button onClick={saveTitle} className="text-green-600 hover:text-green-700">
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-800 truncate">{video.title}</span>
              {isOwn && (
                <button
                  onClick={() => { setDraftTitle(video.title); setEditingTitle(true); }}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ opacity: 1 }}
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Type select */}
        <div className="flex items-center gap-2">
          {isOwn ? (
            <select
              value={video.video_type}
              onChange={(e) => onTypeChange(video.id, e.target.value as LibraryVideo['video_type'])}
              className="text-xs border border-gray-200 rounded-md px-1.5 py-0.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {VIDEO_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          ) : (
            <TypeBadge type={video.video_type} />
          )}

          {!isOwn && video.creator_name && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Users className="w-3 h-3" />
              {video.creator_name}
            </span>
          )}
        </div>

        {/* Footer actions */}
        {isOwn && (
          <div className="flex items-center justify-between pt-1 border-t border-gray-100">
            <button
              onClick={() => onTogglePublic(video.id, video.is_public)}
              title={video.is_public ? 'Make private' : 'Share with team'}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors ${
                video.is_public
                  ? 'bg-green-50 text-green-700 hover:bg-green-100'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {video.is_public ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              {video.is_public ? 'Public' : 'Private'}
            </button>

            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onDelete(video.id)}
                  className="text-xs px-2 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main VideoLibrary page ────────────────────────────────────────────────────
export default function VideoLibrary() {
  const { profile } = useAuth();
  const [myVideos, setMyVideos] = useState<LibraryVideo[]>([]);
  const [teamVideos, setTeamVideos] = useState<LibraryVideo[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'mine' | 'team'>('mine');
  const [typeFilter, setTypeFilter] = useState<LibraryVideo['video_type'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRecorder, setShowRecorder] = useState(false);

  const loadVideos = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      // Own videos
      const { data: own } = await supabase
        .from('staff_video_library')
        .select('*')
        .eq('created_by', profile.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      // Team public videos (exclude own)
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

      setMyVideos(ownList);
      setTeamVideos(teamList);

      // Fetch signed URLs
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

  async function handleDelete(id: string) {
    const video = myVideos.find(v => v.id === id);
    if (!video) return;

    await supabase.from('staff_video_library').update({ is_active: false }).eq('id', id);

    if (video.storage_path) {
      await supabase.storage.from('proposal-recordings').remove([video.storage_path]);
    }
    setMyVideos(prev => prev.filter(v => v.id !== id));
  }

  async function handleTogglePublic(id: string, current: boolean) {
    await supabase.from('staff_video_library').update({ is_public: !current }).eq('id', id);
    setMyVideos(prev => prev.map(v => v.id === id ? { ...v, is_public: !current } : v));
  }

  async function handleTitleChange(id: string, title: string) {
    await supabase.from('staff_video_library').update({ title }).eq('id', id);
    setMyVideos(prev => prev.map(v => v.id === id ? { ...v, title } : v));
  }

  async function handleTypeChange(id: string, video_type: LibraryVideo['video_type']) {
    await supabase.from('staff_video_library').update({ video_type }).eq('id', id);
    setMyVideos(prev => prev.map(v => v.id === id ? { ...v, video_type } : v));
  }

  const displayVideos = activeTab === 'mine' ? myVideos : teamVideos;
  const filtered = displayVideos.filter(v => {
    if (typeFilter !== 'all' && v.video_type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!v.title.toLowerCase().includes(q) && !(v.description || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <Film className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Video Library</h1>
              <p className="text-sm text-gray-500">Save and reuse videos across any proposal</p>
            </div>
          </div>
          <button
            onClick={() => setShowRecorder(!showRecorder)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Video
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Inline recorder */}
        {showRecorder && (
          <LibraryRecorder
            onRecorded={() => { setShowRecorder(false); loadVideos(); }}
            onCancel={() => setShowRecorder(false)}
          />
        )}

        {/* Tabs + filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-1 bg-gray-200 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('mine')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'mine' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Video className="w-4 h-4" />
              My Videos
              {myVideos.length > 0 && (
                <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
                  {myVideos.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('team')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'team' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Users className="w-4 h-4" />
              Team Shared
              {teamVideos.length > 0 && (
                <span className="bg-gray-500 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
                  {teamVideos.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
              />
            </div>

            {/* Type filter */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${typeFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                All
              </button>
              {VIDEO_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTypeFilter(typeFilter === t.value ? 'all' : t.value)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${typeFilter === t.value ? 'bg-gray-800 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="bg-gray-100 rounded-full p-5 mb-4">
              <Film className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              {activeTab === 'mine' ? 'No videos yet' : 'No shared team videos'}
            </h3>
            <p className="text-sm text-gray-500 max-w-sm">
              {activeTab === 'mine'
                ? 'Record a thank you message, introduction, or walkthrough video to reuse on any proposal.'
                : 'When team members share videos publicly, they will appear here.'}
            </p>
            {activeTab === 'mine' && (
              <button
                onClick={() => setShowRecorder(true)}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Your First Video
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(video => (
              <VideoCard
                key={video.id}
                video={video}
                signedUrl={video.storage_path ? (signedUrls[video.storage_path] ?? null) : null}
                isOwn={activeTab === 'mine'}
                onDelete={handleDelete}
                onTogglePublic={handleTogglePublic}
                onTitleChange={handleTitleChange}
                onTypeChange={handleTypeChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
