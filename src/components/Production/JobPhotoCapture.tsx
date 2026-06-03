import React, { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Camera, Upload, X, Image as ImageIcon, MapPin } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { gpsTrackingService } from '../../lib/gpsTracking';

interface JobPhotoCaptureProps {
  workOrderId: string;
  onSuccess?: () => void;
  compact?: boolean;
}

interface PhotoPreview {
  file: File;
  preview: string;
  caption: string;
  hasGPS: boolean;
  latitude?: number;
  longitude?: number;
}

export function JobPhotoCapture({ workOrderId, onSuccess, compact = false }: JobPhotoCaptureProps) {
  const { profile } = useAuth();
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [photoPoints, setPhotoPoints] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('photo_upload_points')
        .single();

      if (error) throw error;
      if (data?.photo_upload_points) {
        setPhotoPoints(data.photo_upload_points);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    let gpsData = null;
    try {
      const position = await gpsTrackingService.getCurrentLocation();
      gpsData = {
        latitude: position.latitude,
        longitude: position.longitude
      };
    } catch (error) {
      console.log('GPS not available:', error);
    }

    const newPhotos: PhotoPreview[] = [];

    for (const file of files) {
      const reader = new FileReader();
      const preview = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      newPhotos.push({
        file,
        preview,
        caption: '',
        hasGPS: !!gpsData,
        latitude: gpsData?.latitude,
        longitude: gpsData?.longitude
      });
    }

    setPhotos([...photos, ...newPhotos]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function removePhoto(index: number) {
    setPhotos(photos.filter((_, i) => i !== index));
  }

  function updatePhoto(index: number, updates: Partial<PhotoPreview>) {
    setPhotos(photos.map((photo, i) =>
      i === index ? { ...photo, ...updates } : photo
    ));
  }

  async function handleUpload() {
    if (!profile || photos.length === 0) return;

    // Check that all photos have captions
    const missingCaptions = photos.some(photo => !photo.caption.trim());
    if (missingCaptions) {
      alert('Please add a caption to all photos before uploading');
      return;
    }

    setUploading(true);

    try {
      for (const photo of photos) {
        const fileExt = photo.file.name.split('.').pop();
        const fileName = `${profile.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('job_photos')
          .upload(fileName, photo.file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('job_photos')
          .getPublicUrl(fileName);

        const { error: dbError } = await supabase
          .from('job_photos')
          .insert({
            work_order_id: workOrderId,
            technician_id: profile.id,
            photo_url: publicUrl,
            caption: photo.caption.trim(),
            latitude: photo.latitude || null,
            longitude: photo.longitude || null,
            is_customer_visible: true,
            metadata: {
              file_name: photo.file.name,
              file_size: photo.file.size,
              file_type: photo.file.type
            },
            taken_at: new Date().toISOString()
          });

        if (dbError) throw dbError;

        // Award points for photo upload
        try {
          await supabase.rpc('award_points', {
            p_user_id: profile.id,
            p_points: photoPoints,
            p_reason: 'Uploaded job photo'
          });
        } catch (err) {
          console.error('Error awarding points:', err);
        }
      }

      setPhotos([]);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error uploading photos:', error);
      alert('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  }

  if (compact && photos.length === 0) {
    return (
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handlePhotoCapture}
          className="hidden"
          id="job-photo-input-compact"
        />
        <label
          htmlFor="job-photo-input-compact"
          className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg cursor-pointer hover:bg-blue-700 transition-colors"
        >
          <Camera className="w-5 h-5" />
          Add Job Photos
        </label>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Photo Input */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handlePhotoCapture}
          className="hidden"
          id="job-photo-input"
        />
        <label
          htmlFor="job-photo-input"
          className="flex items-center justify-center gap-2 w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
        >
          <Camera className="w-8 h-8 text-gray-400" />
          <div className="text-center">
            <div className="text-gray-600 font-medium">Tap to capture photos</div>
            <div className="text-sm text-gray-500 mt-1">Multiple photos supported</div>
          </div>
        </label>
      </div>

      {/* Photo Previews */}
      {photos.length > 0 && (
        <div className="space-y-3">
          {photos.map((photo, index) => (
            <div key={index} className="bg-white rounded-lg border border-gray-200 p-3 space-y-3">
              {/* Preview Image */}
              <div className="relative">
                <img
                  src={photo.preview}
                  alt={`Preview ${index + 1}`}
                  className="w-full h-48 object-cover rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-lg"
                >
                  <X className="w-4 h-4" />
                </button>
                {photo.hasGPS && (
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-green-600 text-white text-xs rounded-full flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    GPS Tagged
                  </div>
                )}
              </div>

              {/* Caption */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Caption *
                </label>
                <input
                  type="text"
                  value={photo.caption}
                  onChange={(e) => updatePhoto(index, { caption: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Describe what's in this photo..."
                  required
                />
              </div>
            </div>
          ))}

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={uploading || photos.some(p => !p.caption.trim())}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {uploading ? (
              <>
                <Upload className="w-5 h-5 animate-spin" />
                Uploading {photos.length} photo{photos.length > 1 ? 's' : ''}...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Upload {photos.length} photo{photos.length > 1 ? 's' : ''} (+{photoPoints * photos.length} {photoPoints * photos.length === 1 ? 'pt' : 'pts'})
              </>
            )}
          </button>

          <button
            onClick={() => setPhotos([])}
            disabled={uploading}
            className="w-full py-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            Cancel
          </button>
        </div>
      )}

      {photos.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p>No photos selected</p>
          <p className="mt-1">Tap above to capture job documentation</p>
        </div>
      )}
    </div>
  );
}
