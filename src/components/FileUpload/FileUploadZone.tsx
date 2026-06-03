import { useState, useRef, DragEvent } from 'react';
import { Upload, X, File, Image, FileText, Video, Music } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface FileUploadZoneProps {
  contextType: 'message' | 'proposal' | 'project' | 'contact';
  contextId: string;
  onUploadComplete?: (files: UploadedFile[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  acceptedTypes?: string[];
}

interface UploadedFile {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  url: string;
}

export function FileUploadZone({
  contextType,
  contextId,
  onUploadComplete,
  maxFiles = 10,
  maxSizeMB = 10,
  acceptedTypes = ['image/*', 'application/pdf', 'text/*', 'video/*']
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  }

  function handleFiles(files: File[]) {
    setError('');

    if (files.length > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed`);
      return;
    }

    const maxBytes = maxSizeMB * 1024 * 1024;
    const oversizedFiles = files.filter(f => f.size > maxBytes);
    if (oversizedFiles.length > 0) {
      setError(`Files must be under ${maxSizeMB}MB. ${oversizedFiles[0].name} is too large.`);
      return;
    }

    setSelectedFiles(files);
  }

  function removeFile(index: number) {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  }

  async function uploadFiles() {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setError('');
    setUploadProgress(0);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const uploadedFiles: UploadedFile[] = [];
      const totalFiles = selectedFiles.length;

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `${contextType}/${contextId}/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('attachments')
          .getPublicUrl(filePath);

        const { data: attachment, error: dbError } = await supabase
          .from('file_attachments')
          .insert({
            file_name: file.name,
            file_size: file.size,
            file_type: file.type,
            storage_path: filePath,
            uploaded_by: user.id,
            context_type: contextType,
            context_id: contextId,
          })
          .select()
          .single();

        if (dbError) throw dbError;

        uploadedFiles.push({
          id: attachment.id,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          storage_path: filePath,
          url: urlData.publicUrl,
        });

        setUploadProgress(((i + 1) / totalFiles) * 100);
      }

      setSelectedFiles([]);
      if (onUploadComplete) {
        onUploadComplete(uploadedFiles);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload files');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept={acceptedTypes.join(',')}
        />

        <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />

        <p className="text-lg font-medium text-gray-900 mb-2">
          {isDragging ? 'Drop files here' : 'Upload Files'}
        </p>

        <p className="text-sm text-gray-600 mb-4">
          Drag and drop or{' '}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            browse
          </button>
        </p>

        <p className="text-xs text-gray-500">
          Maximum {maxFiles} files, up to {maxSizeMB}MB each
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">
              {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
            </p>
            <button
              onClick={() => setSelectedFiles([])}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Clear all
            </button>
          </div>

          <div className="space-y-2">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
              >
                <FileIcon fileType={file.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  disabled={uploading}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {uploading && (
            <div className="space-y-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-center text-gray-600">
                Uploading... {Math.round(uploadProgress)}%
              </p>
            </div>
          )}

          <button
            onClick={uploadFiles}
            disabled={uploading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {uploading ? 'Uploading...' : 'Upload Files'}
          </button>
        </div>
      )}
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
