import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle, Bug, CheckCircle2, FileText, Image, Lightbulb, Loader2, MessageSquare, Paperclip, Video, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type FeedbackType = 'bug' | 'idea' | 'general';

interface TellUsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TYPE_OPTIONS: Array<{
  value: FeedbackType;
  label: string;
  description: string;
  icon: typeof Bug;
  iconClass: string;
  selectedClass: string;
}> = [
  {
    value: 'bug',
    label: 'Bug / Problem',
    description: "Something isn't working right",
    icon: Bug,
    iconClass: 'text-green-500',
    selectedClass: 'border-green-500/70 bg-green-500/10 ring-1 ring-green-500/30',
  },
  {
    value: 'idea',
    label: 'Feature / Idea',
    description: 'Something MJV could add or improve',
    icon: Lightbulb,
    iconClass: 'text-amber-400',
    selectedClass: 'border-amber-400/70 bg-amber-400/10 ring-1 ring-amber-400/30',
  },
  {
    value: 'general',
    label: 'General Feedback',
    description: 'Anything else you want us to know',
    icon: MessageSquare,
    iconClass: 'text-blue-400',
    selectedClass: 'border-blue-400/70 bg-blue-400/10 ring-1 ring-blue-400/30',
  },
];

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
  'text/plain',
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(file: File) {
  if (file.type.startsWith('image/')) return Image;
  if (file.type.startsWith('video/')) return Video;
  if (file.type === 'application/pdf' || file.type === 'text/plain') return FileText;
  return Paperclip;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const [, base64 = ''] = result.split(',');
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read attachment'));
    reader.readAsDataURL(file);
  });
}

export default function TellUsModal({ isOpen, onClose }: TellUsModalProps) {
  const { user, profile, companySettings } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('bug');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  if (!isOpen) return null;

  const reset = () => {
    setFeedbackType('bug');
    setMessage('');
    setFiles([]);
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    reset();
    onClose();
  };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setError(null);

    const next = Array.from(incoming);
    if (files.length + next.length > MAX_FILES) {
      setError(`You can attach up to ${MAX_FILES} files.`);
      return;
    }

    const unsupported = next.find(file => !ACCEPTED_TYPES.includes(file.type));
    if (unsupported) {
      setError(`${unsupported.name} is not a supported file type.`);
      return;
    }

    const oversized = next.find(file => file.size > MAX_FILE_BYTES);
    if (oversized) {
      setError(`${oversized.name} is larger than 10 MB.`);
      return;
    }

    const nextTotal = totalSize + next.reduce((sum, file) => sum + file.size, 0);
    if (nextTotal > MAX_TOTAL_BYTES) {
      setError('Attachments must be 20 MB or less in total.');
      return;
    }

    setFiles(current => [...current, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) {
      setError('Please enter a message.');
      return;
    }
    if (!user || !profile) {
      setError('You must be signed in to send feedback.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const attachments = await Promise.all(files.map(async file => ({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        content: await fileToBase64(file),
      })));

      const { error: invokeError } = await supabase.functions.invoke('send-mjv-feedback', {
        body: {
          type: feedbackType,
          message: message.trim(),
          pageUrl: window.location.href,
          browserInfo: navigator.userAgent,
          submittedAt: new Date().toISOString(),
          dealerName: companySettings?.company_name || 'Unknown dealer',
          organizationId: profile.organization_id || null,
          userName: profile.full_name || profile.username || user.email || 'Unknown user',
          userEmail: profile.email || user.email || '',
          attachments,
        },
      });

      if (invokeError) throw invokeError;

      setSuccess(true);
      setMessage('');
      setFiles([]);
    } catch (err: any) {
      console.error('Error sending MyJobView feedback:', err);
      setError(err?.message || 'We could not send your feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="tell-us-title">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4 sm:px-6">
          <div>
            <h2 id="tell-us-title" className="text-xl font-bold text-white">Tell Us</h2>
            <p className="mt-1 text-sm text-gray-400">Found a problem? Have an idea? Tell the MyJobView team.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white disabled:opacity-50"
            aria-label="Close Tell Us"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="p-6 sm:p-8">
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-400" />
              <h3 className="text-lg font-semibold text-white">Thanks!</h3>
              <p className="mt-1 text-gray-300">Your feedback has been sent to the MyJobView team.</p>
              <button
                type="button"
                onClick={handleClose}
                className="mt-5 rounded-lg bg-gray-700 px-5 py-2.5 font-medium text-white transition-colors hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-6">
            <div>
              <span className="mb-2 block text-sm font-medium text-gray-300">What are you telling us about?</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {TYPE_OPTIONS.map(option => {
                  const Icon = option.icon;
                  const selected = feedbackType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFeedbackType(option.value)}
                      className={`rounded-xl border p-3 text-left transition-all ${selected ? option.selectedClass : 'border-gray-700 bg-gray-800/60 hover:border-gray-600 hover:bg-gray-800'}`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`h-5 w-5 ${option.iconClass}`} />
                        <span className="text-sm font-semibold text-white">{option.label}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-gray-400">{option.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="tell-us-message" className="mb-2 block text-sm font-medium text-gray-300">Message</label>
              <textarea
                id="tell-us-message"
                value={message}
                onChange={event => setMessage(event.target.value)}
                rows={7}
                maxLength={10000}
                placeholder="Tell us what's on your mind..."
                className="w-full resize-y rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-white placeholder-gray-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                disabled={isSubmitting}
                autoFocus
                required
              />
              <div className="mt-1 text-right text-xs text-gray-500">{message.length.toLocaleString()} / 10,000</div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="block text-sm font-medium text-gray-300">Add media <span className="font-normal text-gray-500">(optional)</span></span>
                  <span className="text-xs text-gray-500">Screenshots, photos, short videos, PDF or text files · up to 5 files</span>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting || files.length >= MAX_FILES}
                  className="inline-flex flex-shrink-0 items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Paperclip className="h-4 w-4" />
                  Add Media
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,application/pdf,text/plain"
                  className="hidden"
                  onChange={event => addFiles(event.target.files)}
                />
              </div>

              {files.length > 0 && (
                <div className="mt-3 space-y-2">
                  {files.map((file, index) => {
                    const FileIcon = getFileIcon(file);
                    return (
                      <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-950/70 px-3 py-2.5">
                        <FileIcon className="h-5 w-5 flex-shrink-0 text-gray-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-gray-200">{file.name}</p>
                          <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFiles(current => current.filter((_, currentIndex) => currentIndex !== index))}
                          disabled={isSubmitting}
                          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white disabled:opacity-50"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  <p className="text-right text-xs text-gray-500">{formatBytes(totalSize)} total</p>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-gray-800 pt-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !message.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                {isSubmitting ? 'Sending...' : 'Send to MyJobView'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
