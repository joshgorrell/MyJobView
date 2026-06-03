import React, { useState, useEffect } from 'react';
import { Camera, Upload, Calendar, User, MapPin, Award, Filter, Search, Download, Trash2, X, ThumbsUp, TrendingUp, Clock, UserCircle, Video, Edit, FileText, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import PaparazziModal from './PaparazziModal';
import { QuickActionModal } from '../Shared/QuickActionModal';
import ConfirmModal from '../ui/ConfirmModal';

interface JobPhoto {
  id: string;
  work_order_id: string | null;
  technician_id: string;
  photo_url: string;
  thumbnail_url?: string;
  media_type: 'photo' | 'video';
  category: string;
  caption: string;
  contact_id?: string | null;
  project_id?: string | null;
  taken_at: string;
  created_at: string;
  technician_name?: string;
  contact_name?: string;
  project_name?: string;
  like_count?: number;
  user_has_liked?: boolean;
}

interface JobPhotosGalleryProps {
  initialShowUpload?: boolean;
  onClose?: () => void;
}

interface PaparazziRequest {
  id: string;
  contact_id: string;
  project_id: string | null;
  requested_by: string;
  description: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  status: 'pending' | 'completed' | 'cancelled';
  completed_at: string | null;
  created_at: string;
  contact_name?: string;
  project_name?: string;
  requester_name?: string;
}

function PaparazziRequestsView() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<PaparazziRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedRequest, setSelectedRequest] = useState<PaparazziRequest | null>(null);
  const [confirmDeleteRequestId, setConfirmDeleteRequestId] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const { data: requestsData, error: requestsError } = await supabase
        .from('paparazzi_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;

      const requestIds = requestsData?.map(r => r.id) || [];

      const { data: detailsData, error: detailsError } = await supabase
        .from('paparazzi_requests')
        .select(`
          id,
          contacts:contact_id(full_name),
          projects:project_id(name),
          profiles:requested_by(full_name)
        `)
        .in('id', requestIds);

      if (detailsError) throw detailsError;

      const requestsWithDetails = (requestsData || []).map(request => {
        const details = detailsData?.find(d => d.id === request.id);
        return {
          ...request,
          contact_name: (details?.contacts as any)?.full_name,
          project_name: (details?.projects as any)?.name,
          requester_name: (details?.profiles as any)?.full_name
        };
      });

      setRequests(requestsWithDetails);
    } catch (error) {
      console.error('Error loading paparazzi requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateRequestStatus = async (requestId: string, newStatus: 'completed' | 'cancelled') => {
    try {
      const { error } = await supabase
        .from('paparazzi_requests')
        .update({ status: newStatus })
        .eq('id', requestId);

      if (error) throw error;
      await loadRequests();
      setSelectedRequest(null);
    } catch (error) {
      console.error('Error updating request status:', error);
      alert('Failed to update request status');
    }
  };

  const deleteRequest = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('paparazzi_requests')
        .delete()
        .eq('id', requestId);

      if (error) throw error;
      await loadRequests();
      setSelectedRequest(null);
    } catch (error) {
      console.error('Error deleting request:', error);
      alert('Failed to delete request');
    }
  };

  const filteredRequests = requests.filter(request => {
    if (filterStatus === 'all') return true;
    return request.status === filterStatus;
  });

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      completed: 'bg-green-100 text-green-800 border-green-200',
      cancelled: 'bg-gray-100 text-gray-800 border-gray-200'
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${styles[status as keyof typeof styles]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading requests...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-hide pb-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors whitespace-nowrap ${
              filterStatus === 'all'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterStatus('pending')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors whitespace-nowrap ${
              filterStatus === 'pending'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilterStatus('completed')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors whitespace-nowrap ${
              filterStatus === 'completed'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Completed
          </button>
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Camera className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No requests found</h3>
          <p className="text-gray-600">
            {filterStatus === 'all'
              ? 'No paparazzi requests yet. Click the Paparazzi button to request professional photos!'
              : `No ${filterStatus} requests`}
          </p>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {filteredRequests.map((request) => (
            <div
              key={request.id}
              onClick={() => setSelectedRequest(request)}
              className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer active:scale-[0.99]"
            >
              <div className="flex items-start justify-between mb-2 sm:mb-3 gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{request.customer_name}</h3>
                  {request.project_name && (
                    <p className="text-xs sm:text-sm text-gray-600 mt-1 truncate">{request.project_name}</p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {getStatusBadge(request.status)}
                </div>
              </div>

              <p className="text-xs sm:text-sm text-gray-700 mb-2 sm:mb-3 line-clamp-2">{request.description}</p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{request.requester_name || 'Unknown'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 flex-shrink-0" />
                  <span className="whitespace-nowrap">{new Date(request.created_at).toLocaleDateString()}</span>
                </div>
                {request.completed_at && (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="w-3 h-3 flex-shrink-0" />
                    <span className="whitespace-nowrap">Completed {new Date(request.completed_at).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmDeleteRequestId}
        title="Delete Request"
        message="Are you sure you want to delete this request? This cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteRequestId) {
            const id = confirmDeleteRequestId;
            setConfirmDeleteRequestId(null);
            deleteRequest(id);
          }
        }}
        onCancel={() => setConfirmDeleteRequestId(null)}
      />

      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Request Details</h3>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{selectedRequest.customer_name}</h4>
                  {selectedRequest.project_name && (
                    <p className="text-lg text-gray-600 mt-1">{selectedRequest.project_name}</p>
                  )}
                </div>
                {getStatusBadge(selectedRequest.status)}
              </div>

              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-2">Work Description</h5>
                <p className="text-sm sm:text-base text-gray-900 whitespace-pre-wrap">{selectedRequest.description}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {selectedRequest.customer_phone && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700 mb-1">Phone</h5>
                    <p className="text-sm sm:text-base text-gray-900">{selectedRequest.customer_phone}</p>
                  </div>
                )}
                {selectedRequest.customer_email && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700 mb-1">Email</h5>
                    <p className="text-sm sm:text-base text-gray-900 break-all">{selectedRequest.customer_email}</p>
                  </div>
                )}
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-1">Requested By</h5>
                  <p className="text-sm sm:text-base text-gray-900">{selectedRequest.requester_name || 'Unknown'}</p>
                </div>
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-1">Request Date</h5>
                  <p className="text-sm sm:text-base text-gray-900">{new Date(selectedRequest.created_at).toLocaleDateString()}</p>
                </div>
                {selectedRequest.completed_at && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700 mb-1">Completed Date</h5>
                    <p className="text-sm sm:text-base text-gray-900">{new Date(selectedRequest.completed_at).toLocaleDateString()}</p>
                  </div>
                )}
              </div>

              {(profile?.role === 'admin' || profile?.role === 'owner') && selectedRequest.status === 'pending' && (
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => updateRequestStatus(selectedRequest.id, 'completed')}
                    className="flex-1 px-4 py-2.5 sm:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    Mark Completed
                  </button>
                  <button
                    onClick={() => updateRequestStatus(selectedRequest.id, 'cancelled')}
                    className="flex-1 px-4 py-2.5 sm:py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
                  >
                    Cancel Request
                  </button>
                </div>
              )}

              {(profile?.role === 'admin' || profile?.role === 'owner' || selectedRequest.requested_by === profile?.id) && (
                <div className="pt-3 border-t border-gray-100">
                  <button
                    onClick={() => setConfirmDeleteRequestId(selectedRequest.id)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors font-medium text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Request
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

export function JobPhotosGallery({ initialShowUpload = false, onClose }: JobPhotosGalleryProps = {}) {
  const { user, profile } = useAuth();
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterMediaType, setFilterMediaType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'popularity' | 'date' | 'uploader'>('date');
  const [showUploadModal, setShowUploadModal] = useState(initialShowUpload);
  const [selectedPhoto, setSelectedPhoto] = useState<JobPhoto | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoPoints, setPhotoPoints] = useState(1);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [contacts, setContacts] = useState<Array<{ id: string; full_name: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [editingPhoto, setEditingPhoto] = useState<JobPhoto | null>(null);
  const [showPaparazziModal, setShowPaparazziModal] = useState(false);
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'gallery' | 'requests'>('gallery');
  const [paparazziRequests, setPaparazziRequests] = useState<PaparazziRequest[]>([]);
  const [selectedPaparazziRequestId, setSelectedPaparazziRequestId] = useState<string>('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PHOTOS_PER_PAGE = 50;

  useEffect(() => {
    loadPhotos();
    loadSettings();
  }, []);

  useEffect(() => {
    if (initialShowUpload) {
      setShowUploadModal(true);
      loadContacts(); // Only load contacts when needed
    }
  }, [initialShowUpload]);

  const loadSettings = async () => {
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
  };

  const loadContacts = async () => {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name')
        .order('full_name');

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  const loadProjectsForContact = async (contactId: string) => {
    if (!contactId) {
      setProjects([]);
      setSelectedProjectId('');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('contact_id', contactId)
        .order('name');

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
      setProjects([]);
    }
  };

  const loadPendingPaparazziRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('paparazzi_requests')
        .select('id, customer_name, project_id, description, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const requestsWithProjects = await Promise.all(
        (data || []).map(async (request) => {
          if (request.project_id) {
            const { data: project } = await supabase
              .from('projects')
              .select('name')
              .eq('id', request.project_id)
              .single();
            return { ...request, project_name: project?.name };
          }
          return request;
        })
      );

      setPaparazziRequests(requestsWithProjects as PaparazziRequest[]);
    } catch (error) {
      console.error('Error loading paparazzi requests:', error);
    }
  };

  const createThumbnail = async (file: File, maxWidth = 400, maxHeight = 400): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };

      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Could not create thumbnail'));
            }
          },
          'image/jpeg',
          0.8
        );
      };

      img.onerror = () => reject(new Error('Could not load image'));
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
  };

  const loadPhotos = async (loadMore = false) => {
    if (!profile) return;

    try {
      const currentPage = loadMore ? page + 1 : 0;
      const from = currentPage * PHOTOS_PER_PAGE;
      const to = from + PHOTOS_PER_PAGE - 1;

      // Optimized single query with all needed data
      const { data: photosData, error: photosError } = await supabase
        .from('job_photos')
        .select(`
          id,
          work_order_id,
          technician_id,
          photo_url,
          thumbnail_url,
          media_type,
          category,
          caption,
          contact_id,
          project_id,
          taken_at,
          created_at,
          profiles!job_photos_technician_id_fkey(full_name),
          contacts(full_name),
          projects(name)
        `)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (photosError) throw photosError;

      // Get like counts in a separate efficient query
      const photoIds = photosData?.map(p => p.id) || [];
      if (photoIds.length === 0) {
        setHasMore(false);
        setLoading(false);
        return;
      }

      const [likeCounts, userLikes] = await Promise.all([
        supabase
          .from('job_photo_likes')
          .select('photo_id')
          .in('photo_id', photoIds),
        supabase
          .from('job_photo_likes')
          .select('photo_id')
          .eq('user_id', profile.id)
          .in('photo_id', photoIds)
      ]);

      // Count likes per photo
      const likeCountMap = new Map<string, number>();
      likeCounts.data?.forEach(like => {
        likeCountMap.set(like.photo_id, (likeCountMap.get(like.photo_id) || 0) + 1);
      });

      const likedPhotoIds = new Set(userLikes.data?.map(l => l.photo_id) || []);

      // Merge all data
      const photosWithLikes = (photosData || []).map(photo => ({
        ...photo,
        technician_name: (photo.profiles as any)?.full_name,
        contact_name: (photo.contacts as any)?.full_name,
        project_name: (photo.projects as any)?.name,
        like_count: likeCountMap.get(photo.id) || 0,
        user_has_liked: likedPhotoIds.has(photo.id)
      }));

      if (loadMore) {
        setPhotos(prev => [...prev, ...photosWithLikes]);
        setPage(currentPage);
      } else {
        setPhotos(photosWithLikes);
        setPage(0);
      }

      setHasMore(photosData.length === PHOTOS_PER_PAGE);
    } catch (error) {
      console.error('Error loading photos:', error);
    } finally {
      setLoading(false);
    }
  };

  const createVideoThumbnail = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      video.onloadeddata = () => {
        video.currentTime = 1; // Get frame at 1 second
      };

      video.onseeked = () => {
        canvas.width = 400;
        canvas.height = (video.videoHeight / video.videoWidth) * 400;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Could not create thumbnail'));
            }
            URL.revokeObjectURL(video.src);
          },
          'image/jpeg',
          0.8
        );
      };

      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error('Could not load video'));
      };

      video.src = URL.createObjectURL(file);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!profile) {
      alert('You must be logged in to upload media');
      return;
    }

    if (!photoCaption.trim()) {
      alert('Please enter a caption for your media');
      return;
    }

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith('video/');
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `job-photos/${fileName}`;
        const thumbnailPath = `job-photos/thumbs/${fileName.replace(`.${fileExt}`, '')}.jpg`;

        // Upload file
        const { error: uploadError } = await supabase.storage
          .from('job-photos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('job-photos')
          .getPublicUrl(filePath);

        // Create and upload thumbnail
        let thumbnailUrl = null;
        try {
          const thumbnailBlob = isVideo
            ? await createVideoThumbnail(file)
            : await createThumbnail(file);

          const { error: thumbUploadError } = await supabase.storage
            .from('job-photos')
            .upload(thumbnailPath, thumbnailBlob);

          if (!thumbUploadError) {
            const { data: { publicUrl: thumbPublicUrl } } = supabase.storage
              .from('job-photos')
              .getPublicUrl(thumbnailPath);
            thumbnailUrl = thumbPublicUrl;
          }
        } catch (thumbError) {
          console.error('Error creating thumbnail:', thumbError);
        }

        const { error: insertError } = await supabase
          .from('job_photos')
          .insert({
            work_order_id: null,
            technician_id: profile.id,
            photo_url: publicUrl,
            thumbnail_url: thumbnailUrl,
            media_type: isVideo ? 'video' : 'photo',
            caption: photoCaption.trim(),
            contact_id: selectedContactId || null,
            project_id: selectedProjectId || null,
            paparazzi_request_id: selectedPaparazziRequestId || null,
            taken_at: new Date().toISOString(),
          });

        if (insertError) throw insertError;

        try {
          await supabase.rpc('award_points', {
            p_user_id: profile.id,
            p_points: photoPoints,
            p_reason: isVideo ? 'Uploaded job video' : 'Uploaded job photo'
          });
        } catch (err) {
          console.error('Error awarding points:', err);
        }
      }

      if (selectedPaparazziRequestId) {
        try {
          const { error: updateError } = await supabase
            .from('paparazzi_requests')
            .update({ status: 'completed' })
            .eq('id', selectedPaparazziRequestId);

          if (updateError) throw updateError;

          const { data: requestData } = await supabase
            .from('paparazzi_requests')
            .select('requested_by, customer_name, project_id')
            .eq('id', selectedPaparazziRequestId)
            .single();

          if (requestData) {
            const { data: requesterProfile } = await supabase
              .from('profiles')
              .select('email, full_name')
              .eq('id', requestData.requested_by)
              .single();

            let projectName;
            if (requestData.project_id) {
              const { data: projectData } = await supabase
                .from('projects')
                .select('name')
                .eq('id', requestData.project_id)
                .single();
              projectName = projectData?.name;
            }

            if (requesterProfile?.email) {
              await supabase.functions.invoke('send-paparazzi-photos-notification', {
                body: {
                  requestId: selectedPaparazziRequestId,
                  requesterEmail: requesterProfile.email,
                  requesterName: requesterProfile.full_name || 'Team Member',
                  customerName: requestData.customer_name,
                  projectName,
                  photoCount: files.length
                }
              });
            }
          }
        } catch (err) {
          console.error('Error updating paparazzi request:', err);
        }
      }

      await loadPhotos();
      setShowUploadModal(false);
      setPhotoCaption('');
      setSelectedContactId('');
      setSelectedProjectId('');
      setSelectedPaparazziRequestId('');
      setProjects([]);
      if (onClose) onClose();
    } catch (error: any) {
      console.error('Error uploading media:', error);
      alert(`Error uploading media: ${error?.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const toggleLike = async (photoId: string, currentlyLiked: boolean) => {
    if (!profile) return;

    try {
      if (currentlyLiked) {
        // Unlike
        const { error } = await supabase
          .from('job_photo_likes')
          .delete()
          .eq('photo_id', photoId)
          .eq('user_id', profile.id);

        if (error) throw error;
      } else {
        // Like
        const { error } = await supabase
          .from('job_photo_likes')
          .insert({
            photo_id: photoId,
            user_id: profile.id
          });

        if (error) throw error;
      }

      await loadPhotos();
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const deletePhoto = async (photoId: string) => {
    try {
      const { error } = await supabase
        .from('job_photos')
        .delete()
        .eq('id', photoId);

      if (error) throw error;
      await loadPhotos();
    } catch (error) {
      console.error('Error deleting photo:', error);
    }
  };

  const openEditModal = async (photo: JobPhoto) => {
    setEditingPhoto(photo);
    setPhotoCaption(photo.caption || '');
    setSelectedContactId(photo.contact_id || '');
    setSelectedProjectId(photo.project_id || '');

    if (photo.contact_id) {
      await loadProjectsForContact(photo.contact_id);
    }
  };

  const updatePhotoInfo = async () => {
    if (!editingPhoto) return;

    try {
      const { error } = await supabase
        .from('job_photos')
        .update({
          caption: photoCaption.trim(),
          contact_id: selectedContactId || null,
          project_id: selectedProjectId || null,
        })
        .eq('id', editingPhoto.id);

      if (error) throw error;

      await loadPhotos();
      setEditingPhoto(null);
      setPhotoCaption('');
      setSelectedContactId('');
      setSelectedProjectId('');
      setProjects([]);
    } catch (error: any) {
      console.error('Error updating photo:', error);
      alert(`Error updating photo: ${error?.message || 'Unknown error'}`);
    }
  };

  const filteredAndSortedPhotos = photos
    .filter(photo => {
      const matchesSearch =
        photo.caption?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        photo.technician_name?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = filterType === 'all' || photo.category === filterType;
      const matchesMediaType = filterMediaType === 'all' || photo.media_type === filterMediaType;

      return matchesSearch && matchesType && matchesMediaType;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'popularity':
          return (b.like_count || 0) - (a.like_count || 0);
        case 'date':
          return new Date(b.taken_at).getTime() - new Date(a.taken_at).getTime();
        case 'uploader':
          return (a.technician_name || '').localeCompare(b.technician_name || '');
        default:
          return 0;
      }
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading photos...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-col gap-4 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Job Photos & Videos</h2>
            <p className="text-sm sm:text-base text-gray-600 mt-1">All project and work order media in one place</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowPaparazziModal(true)}
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2.5 sm:py-2 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors shadow-md font-medium"
            >
              <Camera className="w-4 h-4" />
              Paparazzi
            </button>
            <button
              onClick={() => {
                setShowUploadModal(true);
                loadContacts();
                loadPendingPaparazziRequests();
              }}
              className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 sm:py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Upload className="w-4 h-4" />
              Upload Media
              <span className="ml-2 px-2 py-0.5 bg-blue-500 rounded-full text-xs">+{photoPoints} {photoPoints === 1 ? 'pt' : 'pts'}</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6 -mx-4 sm:mx-0 px-4 sm:px-0">
          <nav className="-mb-px flex space-x-6 sm:space-x-8 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveTab('gallery')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                activeTab === 'gallery'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4" />
                <span>Gallery</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                activeTab === 'requests'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span>Paparazzi Requests</span>
              </div>
            </button>
          </nav>
        </div>

        {activeTab === 'gallery' ? (
        <>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mb-6">
          <div className="flex-1 min-w-full sm:min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by caption or user..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <select
            value={filterMediaType}
            onChange={(e) => setFilterMediaType(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Media</option>
            <option value="photo">Photos Only</option>
            <option value="video">Videos Only</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Types</option>
            <option value="before">Before</option>
            <option value="during">During</option>
            <option value="after">After</option>
            <option value="progress">Progress</option>
            <option value="completed">Completed</option>
            <option value="issue">Issue</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'popularity' | 'date' | 'uploader')}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="date">Sort by Date</option>
            <option value="popularity">Sort by Popularity</option>
            <option value="uploader">Sort by Uploader</option>
          </select>
        </div>

        {filteredAndSortedPhotos.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Camera className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No photos found</h3>
            <p className="text-gray-600 mb-4">Upload job photos to earn points and improve documentation</p>
            <button
              onClick={() => {
                setShowUploadModal(true);
                loadContacts();
                loadPendingPaparazziRequests();
              }}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload className="w-5 h-5" />
              Upload Your First Photo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredAndSortedPhotos.map((photo) => (
              <div
                key={photo.id}
                className="group relative aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-500 transition-all"
              >
                <img
                  src={photo.thumbnail_url || photo.photo_url}
                  alt={photo.caption || 'Job photo'}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setSelectedPhoto(photo)}
                  loading="lazy"
                />

                {/* Video indicator */}
                {photo.media_type === 'video' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-16 h-16 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center">
                      <Video className="w-8 h-8 text-white fill-white" />
                    </div>
                  </div>
                )}

                {/* Like button and count */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLike(photo.id, photo.user_has_liked || false);
                  }}
                  className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg backdrop-blur-sm transition-all ${
                    photo.user_has_liked
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/90 text-gray-700 hover:bg-blue-50'
                  }`}
                >
                  <ThumbsUp className={`w-4 h-4 ${photo.user_has_liked ? 'fill-current' : ''}`} />
                  <span className="text-sm font-medium">{photo.like_count || 0}</span>
                </button>

                {/* Info overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                    {photo.caption && (
                      <div className="text-sm font-medium mb-1 line-clamp-2">
                        {photo.caption}
                      </div>
                    )}
                    <div className="text-xs text-gray-300 flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {photo.technician_name || 'Unknown'}
                    </div>
                  </div>
                </div>

                {/* Delete button for admins */}
                {profile?.role === 'admin' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeletePhotoId(photo.id);
                    }}
                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Load More Button */}
        {filteredAndSortedPhotos.length > 0 && hasMore && (
          <div className="flex justify-center mt-8">
            <button
              onClick={() => loadPhotos(true)}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <TrendingUp className="w-5 h-5" />
                  <span>Load More Photos</span>
                </>
              )}
            </button>
          </div>
        )}
        </>
        ) : (
          <PaparazziRequestsView />
        )}
      </div>

      <PaparazziModal
        isOpen={showPaparazziModal}
        onClose={() => {
          setShowPaparazziModal(false);
          if (activeTab === 'requests') {
            // Refresh requests view
            setActiveTab('requests');
          }
        }}
      />

      {showUploadModal && (
        <QuickActionModal
          title="Upload Job Media"
          subtitle={`Earn ${photoPoints} ${photoPoints === 1 ? 'point' : 'points'} per photo uploaded`}
          icon={<Upload className="w-5 h-5 text-white" />}
          accentColor="from-blue-600 to-cyan-700"
          onClose={() => {
            setShowUploadModal(false);
            setPhotoCaption('');
            setSelectedPaparazziRequestId('');
          }}
          maxWidth="sm:max-w-lg"
        >
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">

            <div className="p-3 bg-blue-950/40 rounded-lg border border-blue-700/50">
              <div className="flex items-center gap-2 text-blue-300 mb-1">
                <Award className="w-4 h-4" />
                <span className="font-medium text-sm">Earn {photoPoints} {photoPoints === 1 ? 'Point' : 'Points'} Per Photo!</span>
              </div>
              <p className="text-xs text-blue-400">
                Help improve documentation by uploading job photos
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Caption *
              </label>
              <input
                type="text"
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                placeholder="Describe what's in the photo..."
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Caption will be applied to all media uploaded together
              </p>
            </div>

            {paparazziRequests.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Link to Paparazzi Request (Optional)
                </label>
                <select
                  value={selectedPaparazziRequestId}
                  onChange={(e) => setSelectedPaparazziRequestId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-blue-600/50 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                >
                  <option value="">No request selected</option>
                  {paparazziRequests.map((request) => (
                    <option key={request.id} value={request.id}>
                      {request.customer_name}
                      {request.project_name ? ` - ${request.project_name}` : ''}
                      {' '}
                      ({new Date(request.created_at).toLocaleDateString()})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-blue-400 mt-1">
                  Photos will be linked to this request and the requester will be notified
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Contact (Optional)
              </label>
              <select
                value={selectedContactId}
                onChange={(e) => {
                  setSelectedContactId(e.target.value);
                  loadProjectsForContact(e.target.value);
                }}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              >
                <option value="">No contact selected</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.full_name}
                  </option>
                ))}
              </select>
            </div>

            {selectedContactId && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Project (Optional)
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                >
                  <option value="">No project selected</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={`border border-dashed rounded-lg p-8 text-center transition-colors ${!photoCaption.trim() ? 'border-gray-700 opacity-60' : 'border-blue-500/60 hover:border-blue-400'}`}>
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleFileUpload}
                disabled={uploading || !photoCaption.trim()}
                className="hidden"
                id="photo-upload"
              />
              <label
                htmlFor="photo-upload"
                className={`flex flex-col items-center ${!photoCaption.trim() ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {uploading ? (
                  <>
                    <div className="animate-spin w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full mb-3" />
                    <span className="text-sm text-gray-300">Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-gray-500 mb-3" />
                    <span className="text-sm font-medium text-gray-200 mb-1">
                      {photoCaption.trim() ? 'Click to upload photos or videos' : 'Enter a caption first'}
                    </span>
                    <span className="text-xs text-gray-500">
                      Images: PNG, JPG • Videos: MP4, MOV
                    </span>
                  </>
                )}
              </label>
            </div>

          </div>
        </QuickActionModal>
      )}

      {selectedPhoto && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <button
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-lg"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="max-w-6xl w-full max-h-[90vh] overflow-auto">
            {selectedPhoto.media_type === 'video' ? (
              <video
                src={selectedPhoto.photo_url}
                controls
                className="w-full h-auto rounded-lg"
                autoPlay
              />
            ) : (
              <img
                src={selectedPhoto.photo_url}
                alt={selectedPhoto.caption || 'Job photo'}
                className="w-full h-auto rounded-lg"
              />
            )}
            <div className="mt-4 bg-white rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => toggleLike(selectedPhoto.id, selectedPhoto.user_has_liked || false)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                    selectedPhoto.user_has_liked
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-blue-50'
                  }`}
                >
                  <ThumbsUp className={`w-5 h-5 ${selectedPhoto.user_has_liked ? 'fill-current' : ''}`} />
                  <span className="font-medium">{selectedPhoto.like_count || 0} {(selectedPhoto.like_count || 0) === 1 ? 'Like' : 'Likes'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Category:</span>
                  <span className="ml-2 font-medium capitalize">{selectedPhoto.category || 'General'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Uploaded By:</span>
                  <span className="ml-2 font-medium">
                    {selectedPhoto.technician_name || 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Date Taken:</span>
                  <span className="ml-2 font-medium">
                    {new Date(selectedPhoto.taken_at).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Uploaded:</span>
                  <span className="ml-2 font-medium">
                    {new Date(selectedPhoto.created_at).toLocaleDateString()}
                  </span>
                </div>
                {selectedPhoto.contact_name && (
                  <div>
                    <span className="text-gray-500">Contact:</span>
                    <span className="ml-2 font-medium">{selectedPhoto.contact_name}</span>
                  </div>
                )}
                {selectedPhoto.project_name && (
                  <div>
                    <span className="text-gray-500">Project:</span>
                    <span className="ml-2 font-medium">{selectedPhoto.project_name}</span>
                  </div>
                )}
              </div>
              {selectedPhoto.caption && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <span className="text-gray-500">Caption:</span>
                  <p className="mt-1 text-gray-900">{selectedPhoto.caption}</p>
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    openEditModal(selectedPhoto);
                    setSelectedPhoto(null);
                  }}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Edit Info
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmDeletePhotoId}
        title="Delete Photo"
        message="Delete this photo?"
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

      {editingPhoto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Media Info</h3>
              <button
                onClick={() => {
                  setEditingPhoto(null);
                  setPhotoCaption('');
                  setSelectedContactId('');
                  setSelectedProjectId('');
                  setProjects([]);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <img
                src={editingPhoto.thumbnail_url || editingPhoto.photo_url}
                alt="Preview"
                className="w-full h-48 object-cover rounded-lg mb-4"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Caption
              </label>
              <input
                type="text"
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                placeholder="Describe what's in the photo..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact (Optional)
              </label>
              <select
                value={selectedContactId}
                onChange={(e) => {
                  setSelectedContactId(e.target.value);
                  loadProjectsForContact(e.target.value);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">No contact selected</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.full_name}
                  </option>
                ))}
              </select>
            </div>

            {selectedContactId && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project (Optional)
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">No project selected</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setEditingPhoto(null);
                  setPhotoCaption('');
                  setSelectedContactId('');
                  setSelectedProjectId('');
                  setProjects([]);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={updatePhotoInfo}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
