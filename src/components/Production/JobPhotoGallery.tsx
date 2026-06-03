import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Image as ImageIcon, MapPin, Calendar, User, Download, Eye, EyeOff, X } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

interface JobPhoto {
  id: string;
  photo_url: string;
  category: string;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  is_customer_visible: boolean;
  taken_at: string;
  technician: {
    full_name: string;
  };
}

interface JobPhotoGalleryProps {
  workOrderId: string;
  customerView?: boolean;
}

export function JobPhotoGallery({ workOrderId, customerView = false }: JobPhotoGalleryProps) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<JobPhoto | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<string | null>(null);

  useEffect(() => {
    loadPhotos();

    const channel = supabase
      .channel('job-photos-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'job_photos',
        filter: `work_order_id=eq.${workOrderId}`
      }, () => {
        loadPhotos();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [workOrderId]);

  async function loadPhotos() {
    try {
      let query = supabase
        .from('job_photos')
        .select(`
          *,
          technician:profiles!technician_id(full_name)
        `)
        .eq('work_order_id', workOrderId)
        .order('taken_at', { ascending: true });

      if (customerView) {
        query = query.eq('is_customer_visible', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPhotos(data || []);
    } catch (error) {
      console.error('Error loading job photos:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleVisibility(photoId: string, currentVisibility: boolean) {
    try {
      const { error } = await supabase
        .from('job_photos')
        .update({ is_customer_visible: !currentVisibility })
        .eq('id', photoId);

      if (error) throw error;
      loadPhotos();
    } catch (error) {
      console.error('Error updating photo visibility:', error);
      alert('Failed to update photo visibility');
    }
  }

  async function deletePhoto(photoId: string) {
    try {
      const { error } = await supabase
        .from('job_photos')
        .delete()
        .eq('id', photoId);

      if (error) throw error;
      loadPhotos();
      setSelectedPhoto(null);
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert('Failed to delete photo');
    }
  }

  function getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      before: 'Before',
      during: 'During',
      after: 'After',
      issue: 'Issue',
      solution: 'Solution',
      parts: 'Parts',
      other: 'Other'
    };
    return labels[category] || category;
  }

  function getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      before: 'bg-blue-100 text-blue-800',
      during: 'bg-purple-100 text-purple-800',
      after: 'bg-green-100 text-green-800',
      issue: 'bg-red-100 text-red-800',
      solution: 'bg-teal-100 text-teal-800',
      parts: 'bg-orange-100 text-orange-800',
      other: 'bg-gray-100 text-gray-800'
    };
    return colors[category] || colors.other;
  }

  const categories = ['all', ...Array.from(new Set(photos.map(p => p.category)))];

  const filteredPhotos = categoryFilter === 'all'
    ? photos
    : photos.filter(p => p.category === categoryFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading photos...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Job Photos</h3>
          <p className="text-sm text-gray-600">{photos.length} photo{photos.length !== 1 ? 's' : ''}</p>
        </div>
        {photos.length > 0 && !customerView && (
          <button
            onClick={() => {
              const urls = photos.map(p => p.photo_url);
              alert('Download all feature - integrate with batch download');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Download All
          </button>
        )}
      </div>

      {/* Category Filter */}
      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setCategoryFilter(category)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                categoryFilter === category
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {category === 'all' ? 'All' : getCategoryLabel(category)}
              {category !== 'all' && ` (${photos.filter(p => p.category === category).length})`}
            </button>
          ))}
        </div>
      )}

      {/* Photo Grid */}
      {filteredPhotos.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <ImageIcon className="w-16 h-16 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No photos yet</p>
          {!customerView && (
            <p className="text-sm text-gray-400 mt-1">Photos will appear here once uploaded</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredPhotos.map(photo => (
            <div
              key={photo.id}
              className="relative group cursor-pointer"
              onClick={() => setSelectedPhoto(photo)}
            >
              <img
                src={photo.photo_url}
                alt={photo.caption || 'Job photo'}
                className="w-full h-48 object-cover rounded-lg shadow-sm hover:shadow-md transition-shadow"
              />
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition-all flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="absolute top-2 left-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(photo.category)}`}>
                  {getCategoryLabel(photo.category)}
                </span>
              </div>
              {!customerView && !photo.is_customer_visible && (
                <div className="absolute top-2 right-2">
                  <div className="p-1 bg-gray-900 bg-opacity-75 rounded-full">
                    <EyeOff className="w-4 h-4 text-white" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmDeletePhotoId}
        title="Delete Photo"
        message="Delete this photo? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeletePhotoId) {
            const id = confirmDeletePhotoId;
            setConfirmDeletePhotoId(null);
            deletePhoto(id);
          }
        }}
        onCancel={() => setConfirmDeletePhotoId(null)}
      />

      {/* Photo Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4" onClick={() => setSelectedPhoto(null)}>
          <div className="bg-white rounded-xl max-w-full sm:max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getCategoryColor(selectedPhoto.category)}`}>
                  {getCategoryLabel(selectedPhoto.category)}
                </span>
                {!customerView && (
                  <button
                    onClick={() => toggleVisibility(selectedPhoto.id, selectedPhoto.is_customer_visible)}
                    className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                      selectedPhoto.is_customer_visible
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {selectedPhoto.is_customer_visible ? (
                      <>
                        <Eye className="w-4 h-4" />
                        Visible to customer
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-4 h-4" />
                        Hidden from customer
                      </>
                    )}
                  </button>
                )}
              </div>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="p-4">
              <img
                src={selectedPhoto.photo_url}
                alt={selectedPhoto.caption || 'Job photo'}
                className="w-full rounded-lg"
              />
            </div>

            <div className="p-4 border-t border-gray-200 space-y-3">
              {selectedPhoto.caption && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Caption</h4>
                  <p className="text-gray-900">{selectedPhoto.caption}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <User className="w-4 h-4" />
                  <span>{selectedPhoto.technician?.full_name}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(selectedPhoto.taken_at).toLocaleString()}</span>
                </div>
              </div>

              {selectedPhoto.latitude && selectedPhoto.longitude && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4" />
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedPhoto.latitude},${selectedPhoto.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700"
                  >
                    View location on map
                  </a>
                </div>
              )}

              {!customerView && (
                <div className="flex gap-2 pt-2">
                  <a
                    href={selectedPhoto.photo_url}
                    download
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>
                  <button
                    onClick={() => setConfirmDeletePhotoId(selectedPhoto.id)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
