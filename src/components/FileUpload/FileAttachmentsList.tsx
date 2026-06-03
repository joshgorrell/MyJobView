import { useState, useEffect } from 'react';
import { Download, Trash2, Eye, File, Image, FileText, Video, Music } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface FileAttachment {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  uploaded_at: string;
  uploaded_by: string;
  uploader_name?: string;
}

interface FileAttachmentsListProps {
  contextType: 'message' | 'proposal' | 'project' | 'contact';
  contextId: string;
  canDelete?: boolean;
  onFileDeleted?: () => void;
}

export function FileAttachmentsList({
  contextType,
  contextId,
  canDelete = false,
  onFileDeleted
}: FileAttachmentsListProps) {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadAttachments();
  }, [contextType, contextId]);

  async function loadAttachments() {
    try {
      const { data, error } = await supabase
        .from('file_attachments')
        .select(`
          id,
          file_name,
          file_size,
          file_type,
          storage_path,
          uploaded_at,
          uploaded_by,
          profiles:uploaded_by (
            full_name
          )
        `)
        .eq('context_type', contextType)
        .eq('context_id', contextId)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;

      const formattedAttachments = (data || []).map((att: any) => ({
        ...att,
        uploader_name: att.profiles?.full_name || 'Unknown User',
      }));

      setAttachments(formattedAttachments);
    } catch (error) {
      console.error('Error loading attachments:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(attachment: FileAttachment) {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(attachment.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Failed to download file');
    }
  }

  async function handleView(attachment: FileAttachment) {
    try {
      const { data } = supabase.storage
        .from('attachments')
        .getPublicUrl(attachment.storage_path);

      window.open(data.publicUrl, '_blank');
    } catch (error) {
      console.error('Error viewing file:', error);
      alert('Failed to view file');
    }
  }

  function handleDelete(attachmentId: string, storagePath: string, fileName: string) {
    setConfirmDelete({ id: attachmentId, path: storagePath, name: fileName });
  }

  async function doDelete() {
    if (!confirmDelete) return;
    const { id: attachmentId, path: storagePath } = confirmDelete;
    setConfirmDelete(null);
    setDeleting(attachmentId);
    try {
      const { error: storageError } = await supabase.storage
        .from('attachments')
        .remove([storagePath]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('file_attachments')
        .delete()
        .eq('id', attachmentId);

      if (dbError) throw dbError;

      setAttachments(attachments.filter(a => a.id !== attachmentId));
      if (onFileDeleted) {
        onFileDeleted();
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('Failed to delete file');
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-sm text-gray-600">Loading attachments...</p>
      </div>
    );
  }

  if (attachments.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <File className="w-12 h-12 mx-auto mb-2 text-gray-400" />
        <p className="text-sm">No attachments yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
        >
          <FileIcon fileType={attachment.file_type} />

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {attachment.file_name}
            </p>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{formatFileSize(attachment.file_size)}</span>
              <span>•</span>
              <span>{attachment.uploader_name}</span>
              <span>•</span>
              <span>{new Date(attachment.uploaded_at).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {attachment.file_type.startsWith('image/') && (
              <button
                onClick={() => handleView(attachment)}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="View"
              >
                <Eye className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => handleDownload(attachment)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>

            {canDelete && (
              <button
                onClick={() => handleDelete(attachment.id, attachment.storage_path, attachment.file_name)}
                disabled={deleting === attachment.id}
                className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}

      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="Delete File"
        message={`Delete "${confirmDelete?.name}"? This cannot be undone.`}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function FileIcon({ fileType }: { fileType: string }) {
  if (fileType.startsWith('image/')) {
    return <Image className="w-8 h-8 text-blue-500" />;
  }
  if (fileType.startsWith('video/')) {
    return <Video className="w-8 h-8 text-purple-500" />;
  }
  if (fileType.startsWith('audio/')) {
    return <Music className="w-8 h-8 text-green-500" />;
  }
  if (fileType === 'application/pdf') {
    return <FileText className="w-8 h-8 text-red-500" />;
  }
  return <File className="w-8 h-8 text-gray-500" />;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
