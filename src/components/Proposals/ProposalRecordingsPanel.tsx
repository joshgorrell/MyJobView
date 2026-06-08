import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Video, Square, Play, Pause, Trash2, Eye, EyeOff,
  Upload, AlertCircle, Loader2, RotateCcw, CheckCircle,
  Mic, MicOff, Camera, CameraOff, Clock, GripVertical,
  Film, BookMarked
} from 'lucide-react';
import { VideoLibraryPickerModal } from './VideoLibraryPickerModal';

export interface ProposalRecording {
  id: string;
  proposal_id: string;
  room_id: string | null;
  title: string;
  video_url: string | null;
  storage_path: string | null;
  description: string | null;
  duration_seconds: number | null;
  is_portal_visible: boolean;
  recording_scope: 'full_proposal' | 'area';
  sort_order: number;
  created_at: string;
  created_by: string | null;
}

interface ProposalRoom {
  id: string;
  name: string;
  sort_order: number;
}

interface ProposalRecordingsPanelProps {
  proposalId: string;
  rooms: ProposalRoom[];
  onRecordingsChange?: (count: number) => void;
}

type RecordingState = 'idle' | 'requesting' | 'recording' | 'processing' | 'uploading';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function RecordingCard({
  recording,
  onDelete,
  onToggleVisibility,
  onTitleChange,
  onDescriptionChange,
  onSaveToLibrary,
  signedUrls,
}: {
  recording: ProposalRecording;
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string, visible: boolean) => void;
  onTitleChange: (id: string, title: string) => void;
  onDescriptionChange: (id: string, desc: string) => void;
  onSaveToLibrary: (recording: ProposalRecording) => void;
  signedUrls: Record<string, string>;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(recording.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(recording.description || '');
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoSrc = recording.storage_path
    ? signedUrls[recording.storage_path]
    : recording.video_url || undefined;

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setPlaying(!playing);
  };

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${
      recording.is_portal_visible ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-75'
    }`}>
      {/* Header */}
      <div className="flex items-start gap-3 p-3">
        <div className="flex-shrink-0 mt-0.5 text-gray-300 cursor-grab">
          <GripVertical className="w-4 h-4" />
        </div>

        <div className="flex-shrink-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            recording.recording_scope === 'full_proposal'
              ? 'bg-blue-100 text-blue-600'
              : 'bg-teal-100 text-teal-600'
          }`}>
            <Video className="w-4 h-4" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={() => {
                setEditingTitle(false);
                if (titleValue.trim() !== recording.title) {
                  onTitleChange(recording.id, titleValue.trim() || 'Presentation Recording');
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setEditingTitle(false);
                  if (titleValue.trim() !== recording.title) {
                    onTitleChange(recording.id, titleValue.trim() || 'Presentation Recording');
                  }
                }
              }}
              className="w-full text-sm font-semibold text-gray-900 border border-blue-400 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <button
              onClick={() => setEditingTitle(true)}
              className="text-sm font-semibold text-gray-900 hover:text-blue-600 text-left truncate max-w-full block"
              title="Click to edit title"
            >
              {recording.title}
            </button>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
              recording.recording_scope === 'full_proposal'
                ? 'bg-blue-50 text-blue-600'
                : 'bg-teal-50 text-teal-600'
            }`}>
              {recording.recording_scope === 'full_proposal' ? 'Full Proposal' : 'Area Video'}
            </span>
            {recording.duration_seconds != null && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(recording.duration_seconds)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Portal visibility toggle */}
          <button
            onClick={() => onToggleVisibility(recording.id, !recording.is_portal_visible)}
            title={recording.is_portal_visible ? 'Visible on portal - click to hide' : 'Hidden from portal - click to show'}
            className={`p-1.5 rounded-lg transition-colors ${
              recording.is_portal_visible
                ? 'text-green-600 hover:bg-green-50'
                : 'text-gray-400 hover:bg-gray-100'
            }`}
          >
            {recording.is_portal_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          {/* Expand/preview */}
          {videoSrc && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Preview video"
            >
              <Play className="w-4 h-4" />
            </button>
          )}

          {/* Save to Library */}
          {recording.storage_path && (
            <button
              onClick={() => onSaveToLibrary(recording)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
              title="Save to My Video Library"
            >
              <BookMarked className="w-4 h-4" />
            </button>
          )}

          {/* Delete */}
          <button
            onClick={() => onDelete(recording.id)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Video preview */}
      {expanded && videoSrc && (
        <div className="px-3 pb-3">
          <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
            <video
              ref={videoRef}
              src={videoSrc}
              onEnded={() => setPlaying(false)}
              controls
              className="w-full h-full"
            />
          </div>
        </div>
      )}

      {/* Description */}
      <div className="px-3 pb-3 pt-0">
        {editingDesc ? (
          <textarea
            autoFocus
            value={descValue}
            onChange={(e) => setDescValue(e.target.value)}
            onBlur={() => {
              setEditingDesc(false);
              if (descValue !== (recording.description || '')) {
                onDescriptionChange(recording.id, descValue);
              }
            }}
            rows={2}
            placeholder="Add a description for the customer..."
            className="w-full text-xs text-gray-600 border border-blue-400 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        ) : (
          <button
            onClick={() => setEditingDesc(true)}
            className="text-xs text-gray-400 hover:text-gray-700 text-left block w-full"
          >
            {recording.description ? recording.description : '+ Add description for customer...'}
          </button>
        )}
      </div>

      {!recording.is_portal_visible && (
        <div className="px-3 pb-2">
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <EyeOff className="w-3 h-3" />
            Hidden from customer portal
          </p>
        </div>
      )}
    </div>
  );
}

function InlineRecorder({
  label,
  scope,
  proposalId,
  roomId,
  sortOrder,
  onRecorded,
}: {
  label: string;
  scope: 'full_proposal' | 'area';
  proposalId: string;
  roomId: string | null;
  sortOrder: number;
  onRecorded: () => void;
}) {
  const { profile } = useAuth();
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

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

  useEffect(() => {
    if (showPreview && previewVideoRef.current && streamRef.current && videoEnabled) {
      previewVideoRef.current.srcObject = streamRef.current;
    }
  }, [showPreview, videoEnabled]);

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    setError(null);
    setRecordingState('requesting');

    try {
      const constraints: MediaStreamConstraints = {
        audio: audioEnabled,
        video: videoEnabled ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        } : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Choose best supported format
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : '';

      const recorderOptions = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => handleRecordingStop(mimeType);

      recorder.start(1000); // collect data every second
      setRecordingState('recording');
      setElapsed(0);
      setShowPreview(videoEnabled);

      timerRef.current = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      setError(
        err.name === 'NotAllowedError'
          ? 'Camera/microphone permission denied. Please allow access and try again.'
          : err.name === 'NotFoundError'
          ? 'No camera or microphone found on this device.'
          : `Error starting recording: ${err.message}`
      );
      setRecordingState('idle');
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
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
      // Get org id for storage path
      const { data: profileData } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', profile!.id)
        .maybeSingle();

      const orgId = profileData?.organization_id || 'unknown';
      const recordingId = crypto.randomUUID();
      const storagePath = `${orgId}/${proposalId}/${recordingId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('proposal-recordings')
        .upload(storagePath, blob, {
          contentType: mimeType || 'video/webm',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      setUploadProgress(80);

      // Save to DB
      const defaultTitle = scope === 'full_proposal'
        ? 'Full Proposal Walkthrough'
        : `Area Recording`;

      const { error: dbError } = await supabase
        .from('proposal_recordings')
        .insert({
          proposal_id: proposalId,
          room_id: roomId,
          title: defaultTitle,
          storage_path: storagePath,
          duration_seconds: durationSeconds,
          recording_scope: scope,
          is_portal_visible: true,
          sort_order: sortOrder,
          created_by: profile!.id,
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

  const isRecording = recordingState === 'recording';
  const isBusy = recordingState !== 'idle';

  return (
    <div className="space-y-2">
      {/* Live preview while recording */}
      {showPreview && isRecording && (
        <div className="relative bg-black rounded-lg overflow-hidden aspect-video max-h-40">
          <video
            ref={previewVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
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
            <span className="text-sm text-blue-700 font-medium">Uploading recording...</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {recordingState === 'processing' && (
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
          <Loader2 className="w-4 h-4 animate-spin" />
          Processing recording...
        </div>
      )}

      {recordingState === 'requesting' && (
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
          <Loader2 className="w-4 h-4 animate-spin" />
          Requesting camera/microphone access...
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p>{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 text-xs underline mt-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {recordingState === 'idle' && (
        <div className="flex items-center gap-2">
          {/* Media toggles */}
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            title={audioEnabled ? 'Mute audio' : 'Enable audio'}
            className={`p-2 rounded-lg border transition-colors ${
              audioEnabled
                ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
                : 'border-red-300 bg-red-50 text-red-600'
            }`}
          >
            {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setVideoEnabled(!videoEnabled)}
            title={videoEnabled ? 'Disable camera' : 'Enable camera'}
            className={`p-2 rounded-lg border transition-colors ${
              videoEnabled
                ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
                : 'border-amber-300 bg-amber-50 text-amber-600'
            }`}
          >
            {videoEnabled ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
          </button>

          <button
            onClick={startRecording}
            className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
          >
            <span className="w-2 h-2 bg-white rounded-full" />
            Record {label}
          </button>
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
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium"
          >
            <Square className="w-3 h-3 fill-current" />
            Stop
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProposalRecordingsPanel({
  proposalId,
  rooms,
  onRecordingsChange,
}: ProposalRecordingsPanelProps) {
  const { profile } = useAuth();
  const [recordings, setRecordings] = useState<ProposalRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [libraryPickerScope, setLibraryPickerScope] = useState<{ scope: 'full_proposal' | 'area'; roomId: string | null; sortOrder: number }>({ scope: 'full_proposal', roomId: null, sortOrder: 0 });
  const [savingToLibrary, setSavingToLibrary] = useState<ProposalRecording | null>(null);
  const [saveLibraryType, setSaveLibraryType] = useState<'thank_you' | 'introduction' | 'general' | 'other'>('general');
  const [saveLibraryPublic, setSaveLibraryPublic] = useState(false);
  const [saveLibraryTitle, setSaveLibraryTitle] = useState('');
  const [savingLib, setSavingLib] = useState(false);

  const loadRecordings = useCallback(async () => {
    const { data, error } = await supabase
      .from('proposal_recordings')
      .select('*')
      .eq('proposal_id', proposalId)
      .order('recording_scope', { ascending: false }) // full_proposal first
      .order('sort_order')
      .order('created_at');

    if (!error && data) {
      setRecordings(data);
      onRecordingsChange?.(data.length);
      // Fetch signed URLs for stored videos
      const paths = data
        .filter(r => r.storage_path)
        .map(r => r.storage_path as string);
      if (paths.length > 0) {
        await fetchSignedUrls(paths);
      }
    }
    setLoading(false);
  }, [proposalId]);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  async function fetchSignedUrls(paths: string[]) {
    const urls: Record<string, string> = {};
    await Promise.all(
      paths.map(async (path) => {
        const { data } = await supabase.storage
          .from('proposal-recordings')
          .createSignedUrl(path, 3600);
        if (data?.signedUrl) urls[path] = data.signedUrl;
      })
    );
    setSignedUrls(urls);
  }

  async function handleDelete(id: string) {
    const recording = recordings.find(r => r.id === id);
    if (!recording) return;

    // Delete from storage if applicable
    if (recording.storage_path) {
      await supabase.storage
        .from('proposal-recordings')
        .remove([recording.storage_path]);
    }

    await supabase.from('proposal_recordings').delete().eq('id', id);
    await loadRecordings();
  }

  async function handleToggleVisibility(id: string, visible: boolean) {
    await supabase
      .from('proposal_recordings')
      .update({ is_portal_visible: visible })
      .eq('id', id);
    setRecordings(prev => prev.map(r => r.id === id ? { ...r, is_portal_visible: visible } : r));
  }

  async function handleTitleChange(id: string, title: string) {
    await supabase.from('proposal_recordings').update({ title }).eq('id', id);
    setRecordings(prev => prev.map(r => r.id === id ? { ...r, title } : r));
  }

  async function handleDescriptionChange(id: string, description: string) {
    await supabase.from('proposal_recordings').update({ description }).eq('id', id);
    setRecordings(prev => prev.map(r => r.id === id ? { ...r, description } : r));
  }

  async function handleSaveToLibraryConfirm() {
    if (!savingToLibrary || !profile) return;
    setSavingLib(true);
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', profile.id)
        .maybeSingle();
      const orgId = profileData?.organization_id;
      if (!orgId) throw new Error('No organization found');

      await supabase.from('staff_video_library').insert({
        organization_id: orgId,
        created_by: profile.id,
        title: saveLibraryTitle.trim() || savingToLibrary.title,
        video_type: saveLibraryType,
        storage_path: savingToLibrary.storage_path,
        duration_seconds: savingToLibrary.duration_seconds,
        is_public: saveLibraryPublic,
      });

      setSavingToLibrary(null);
    } catch (err: any) {
      alert(`Failed to save: ${err.message}`);
    } finally {
      setSavingLib(false);
    }
  }

  const fullProposalRecordings = recordings.filter(r => r.recording_scope === 'full_proposal');
  const areaRecordings = recordings.filter(r => r.recording_scope === 'area');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Video className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-900 mb-1">Presentation Video Recordings</p>
            <p className="text-sm text-blue-700">
              Record a video walkthrough of the entire proposal, and/or individual videos per area. Customers
              can watch these on their portal while reviewing the proposal — so they hear you explain
              each item as they read through it.
            </p>
          </div>
        </div>
      </div>

      {/* Full Proposal Recording Section */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
            <Video className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">Full Proposal Walkthrough</h3>
          {fullProposalRecordings.length > 0 && (
            <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              {fullProposalRecordings.length} recording{fullProposalRecordings.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Record one video covering the entire proposal — great for a brief intro or complete walkthrough.
          This will appear at the top of the proposal in the customer portal.
        </p>

        {/* Existing full-proposal recordings */}
        {fullProposalRecordings.length > 0 && (
          <div className="space-y-2 mb-4">
            {fullProposalRecordings.map(r => (
              <RecordingCard
                key={r.id}
                recording={r}
                onDelete={handleDelete}
                onToggleVisibility={handleToggleVisibility}
                onTitleChange={handleTitleChange}
                onDescriptionChange={handleDescriptionChange}
                onSaveToLibrary={(rec) => { setSavingToLibrary(rec); setSaveLibraryTitle(rec.title); setSaveLibraryType('general'); setSaveLibraryPublic(false); }}
                signedUrls={signedUrls}
              />
            ))}
          </div>
        )}

        {/* Recorder + Library picker */}
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4 space-y-3">
          <InlineRecorder
            label="Full Walkthrough"
            scope="full_proposal"
            proposalId={proposalId}
            roomId={null}
            sortOrder={fullProposalRecordings.length}
            onRecorded={loadRecordings}
          />
          <div className="flex items-center gap-2">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>
          <button
            onClick={() => { setLibraryPickerScope({ scope: 'full_proposal', roomId: null, sortOrder: fullProposalRecordings.length }); setShowLibraryPicker(true); }}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            <Film className="w-4 h-4" />
            Add from My Video Library
          </button>
        </div>
      </section>

      {/* Per-Area Recordings Section */}
      {rooms.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-teal-100 rounded-lg flex items-center justify-center">
              <Video className="w-3.5 h-3.5 text-teal-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">Per-Area Videos</h3>
            {areaRecordings.length > 0 && (
              <span className="ml-auto text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">
                {areaRecordings.length} recorded
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Record a short video for each area or room. The video will appear inline within that area
            in the customer portal so customers can watch your explanation as they review the line items.
          </p>

          <div className="space-y-4">
            {rooms.map(room => {
              const roomRecordings = areaRecordings.filter(r => r.room_id === room.id);
              return (
                <div key={room.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* Room header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-gray-800 to-gray-700">
                    <Video className="w-4 h-4 text-gray-300" />
                    <span className="text-sm font-semibold text-white">{room.name}</span>
                    {roomRecordings.length > 0 && (
                      <span className="ml-auto flex items-center gap-1 text-xs bg-teal-500 text-white px-2 py-0.5 rounded-full font-medium">
                        <CheckCircle className="w-3 h-3" />
                        Recorded
                      </span>
                    )}
                  </div>

                  <div className="p-4 space-y-3">
                    {/* Existing area recordings */}
                    {roomRecordings.map(r => (
                      <RecordingCard
                        key={r.id}
                        recording={r}
                        onDelete={handleDelete}
                        onToggleVisibility={handleToggleVisibility}
                        onTitleChange={handleTitleChange}
                        onDescriptionChange={handleDescriptionChange}
                        onSaveToLibrary={(rec) => { setSavingToLibrary(rec); setSaveLibraryTitle(rec.title); setSaveLibraryType('general'); setSaveLibraryPublic(false); }}
                        signedUrls={signedUrls}
                      />
                    ))}

                    {/* Area recorder */}
                    <div className={roomRecordings.length > 0 ? 'border-t border-gray-100 pt-3' : ''}>
                      <InlineRecorder
                        label={room.name}
                        scope="area"
                        proposalId={proposalId}
                        roomId={room.id}
                        sortOrder={roomRecordings.length}
                        onRecorded={loadRecordings}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {rooms.length === 0 && (
        <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
          Add areas to the proposal to record per-area videos.
        </div>
      )}

      {/* Video Library Picker Modal */}
      {showLibraryPicker && (
        <VideoLibraryPickerModal
          proposalId={proposalId}
          currentRoomId={libraryPickerScope.roomId}
          scope={libraryPickerScope.scope}
          sortOrder={libraryPickerScope.sortOrder}
          onClose={() => setShowLibraryPicker(false)}
          onAdded={() => { setShowLibraryPicker(false); loadRecordings(); }}
        />
      )}

      {/* Save to Library Modal */}
      {savingToLibrary && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-lg">
                  <BookMarked className="w-5 h-5 text-green-600" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Save to Video Library</h2>
              </div>
              <button onClick={() => setSavingToLibrary(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-500">This video will be saved to your library and can be reused on any future proposal.</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                <input
                  type="text"
                  value={saveLibraryTitle}
                  onChange={(e) => setSaveLibraryTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Video Type</label>
                <select
                  value={saveLibraryType}
                  onChange={(e) => setSaveLibraryType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="thank_you">Thank You</option>
                  <option value="introduction">Introduction</option>
                  <option value="general">General</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={saveLibraryPublic}
                  onChange={(e) => setSaveLibraryPublic(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600"
                />
                Share with team (other reps can use this video)
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 px-5 pb-5">
              <button onClick={() => setSavingToLibrary(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <button
                onClick={handleSaveToLibraryConfirm}
                disabled={savingLib}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {savingLib ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookMarked className="w-4 h-4" />}
                Save to Library
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
