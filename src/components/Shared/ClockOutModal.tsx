import { useState, useEffect } from 'react';
import { X, Upload, Camera, Award, AlertCircle, WifiOff, CheckCircle, Clock, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { gpsTrackingService } from '../../lib/gpsTracking';
import { offlineSupabaseUpdate } from '../../lib/offlineSupport';
import { updateClockEntryAddress } from '../../lib/reverseGeocode';

interface ClockOutModalProps {
  type: 'daily' | 'job';
  entryId: string;
  technicianId: string;
  workOrderId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ClockOutModal({ type, entryId, technicianId, workOrderId, onClose, onSuccess }: ClockOutModalProps) {
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoCaptions, setPhotoCaptions] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<'done_for_day' | 'complete'>('done_for_day');
  const [sendFeedbackEmail, setSendFeedbackEmail] = useState(false);
  const [workOrderType, setWorkOrderType] = useState<string | null>(null);
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);

  const noteChars = notes.trim().length;
  const notesValid = noteChars >= 20;
  const pointsForNote = notesValid ? 1 : 0;

  const validPhotos = photos.filter((_, i) => photoCaptions[i]?.trim().length >= 20);
  const pointsForPhotos = validPhotos.length;

  const totalPoints = pointsForNote + pointsForPhotos;

  // Load work order details if it's a job clock-out
  useEffect(() => {
    if (type === 'job' && workOrderId) {
      loadWorkOrderDetails();
    }
  }, [type, workOrderId]);

  async function loadWorkOrderDetails() {
    if (!workOrderId) return;

    try {
      const { data: workOrder, error } = await supabase
        .from('work_orders')
        .select(`
          type,
          contact:contacts(email)
        `)
        .eq('id', workOrderId)
        .maybeSingle();

      if (error) throw error;

      if (workOrder) {
        setWorkOrderType(workOrder.type);
        setCustomerEmail(workOrder.contact?.email || null);

        // Set defaults based on work order type
        if (workOrder.type === 'service' || workOrder.type === 'warranty' || workOrder.type === 'vip_program') {
          setJobStatus('complete');
          setSendFeedbackEmail(workOrder.contact?.email ? true : false);
        } else {
          setJobStatus('done_for_day');
          setSendFeedbackEmail(false);
        }
      }
    } catch (err) {
      console.error('Error loading work order details:', err);
    }
  }

  async function handleClockOut() {
    // Enforce minimum 20 characters for job clock out
    if (type === 'job' && noteChars < 20) {
      setError('Job notes must be at least 20 characters. Please describe what work was completed.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // 1. Update the clock entry immediately (non-blocking)
      const tableName = type === 'daily' ? 'daily_clock_entries' : 'time_entries';
      const updateData: any = {
        clock_out: new Date().toISOString(),
      };

      if (notes.trim()) {
        updateData.notes = notes.trim();
      }

      // If clocking out offline, mark it as an offline entry
      if (type === 'daily' && !navigator.onLine) {
        updateData.offline_entry = true;
      }

      // Mark job as complete if selected
      if (type === 'job' && jobStatus === 'complete') {
        updateData.marked_complete = true;
      }

      const { error: updateError } = await offlineSupabaseUpdate(
        tableName,
        updateData,
        entryId
      );

      if (updateError) throw updateError;

      // 1.5. Update work order status to completed if marked complete
      if (type === 'job' && workOrderId && jobStatus === 'complete') {
        const { error: woError } = await supabase
          .from('work_orders')
          .update({
            status: 'completed',
            actual_completion_date: new Date().toISOString().split('T')[0],
          })
          .eq('id', workOrderId);

        if (woError) {
          console.error('Error updating work order status:', woError);
          // Don't throw - clock out should still succeed
        }
      }

      // 2. Upload photos if any (only if online)
      if (photos.length > 0 && workOrderId && navigator.onLine) {
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          const caption = photoCaptions[i]?.trim();

          // Only upload photos with valid captions (>= 20 chars)
          if (!caption || caption.length < 20) continue;

          // Upload to storage
          const fileExt = photo.name.split('.').pop();
          const fileName = `${workOrderId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

          const { error: uploadError, data: uploadData } = await supabase.storage
            .from('job-photos')
            .upload(fileName, photo);

          if (uploadError) throw uploadError;

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('job-photos')
            .getPublicUrl(fileName);

          // Insert photo record
          const { error: photoError } = await supabase
            .from('job_photos')
            .insert({
              work_order_id: workOrderId,
              technician_id: technicianId,
              photo_url: publicUrl,
              caption: caption,
              category: 'completion',
            });

          if (photoError) throw photoError;
        }
      }

      // 3. Send feedback email if requested (only if online and job is marked complete)
      if (type === 'job' && workOrderId && jobStatus === 'complete' && sendFeedbackEmail && navigator.onLine) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const response = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-work-order-feedback`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  workOrderId,
                  timeEntryId: entryId,
                }),
              }
            );

            const result = await response.json();
            if (result.success) {
              console.log('Feedback email sent successfully');
            } else if (result.alreadySent) {
              console.log('Feedback email was already sent for this work order');
            } else if (result.noEmail) {
              console.log('Customer does not have an email address');
            } else {
              console.error('Failed to send feedback email:', result.error);
            }
          }
        } catch (emailError) {
          console.error('Error sending feedback email:', emailError);
          // Don't throw - clock out should still succeed even if email fails
        }
      }

      // Stop GPS tracking when clocking out
      // This stops tracking for both daily clock and job clock outs
      gpsTrackingService.stopTracking();

      // Capture GPS location silently in background (non-blocking) for all clock-outs
      gpsTrackingService.captureLocationForClockEvent(true).then(async (gpsResult) => {
        try {
          // Calculate GPS quality score
          const { data: scoreData } = await supabase.rpc('calculate_gps_quality_score', {
            p_accuracy: gpsResult.accuracy,
            p_method: gpsResult.method,
            p_duration_ms: gpsResult.duration_ms,
            p_refined: false,
            p_original_accuracy: null
          });

          const qualityScore = scoreData || 0;

          const gpsData = {
            clock_out_latitude: gpsResult.latitude,
            clock_out_longitude: gpsResult.longitude,
            clock_out_gps_accuracy: gpsResult.accuracy,
            clock_out_gps_capture_method: gpsResult.method,
            clock_out_gps_duration_ms: gpsResult.duration_ms,
            clock_out_gps_attempted_at: gpsResult.attempted_at,
            clock_out_gps_captured_at: gpsResult.captured_at,
            clock_out_gps_quality_score: qualityScore,
          };

          const clockTable = type === 'daily' ? 'daily_clock_entries' as const : 'time_entries' as const;

          await supabase
            .from(clockTable)
            .update(gpsData)
            .eq('id', entryId);

          if (gpsResult.latitude && gpsResult.longitude) {
            updateClockEntryAddress(entryId, gpsResult.latitude, gpsResult.longitude, true, clockTable).catch(() => {});
          }

          if (gpsResult.accuracy && gpsResult.accuracy > 50) {
            gpsTrackingService.startPostCaptureRefinement(entryId, true, clockTable);
          }
        } catch (error) {
          // Silently fail - GPS metadata is not critical
          console.error('GPS metadata update failed:', error);
        }
      }).catch(() => {
        // Silently fail - GPS capture is best-effort only
      });

      // Show offline notification if applicable
      if (!navigator.onLine) {
        alert('You clocked out offline. Your data will sync when you reconnect. Photos will be uploaded when online.');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error clocking out:', err);
      setError(err.message || 'Failed to clock out');
    } finally {
      setUploading(false);
    }
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setPhotos(prev => [...prev, ...files]);
    setPhotoCaptions(prev => [...prev, ...files.map(() => '')]);
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoCaptions(prev => prev.filter((_, i) => i !== index));
  }

  function updateCaption(index: number, caption: string) {
    setPhotoCaptions(prev => {
      const newCaptions = [...prev];
      newCaptions[index] = caption;
      return newCaptions;
    });
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Clock Out {type === 'daily' ? '- End of Day' : '- Complete Job'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {type === 'daily' ? 'Add notes to earn points!' : 'Add notes and photos to earn points!'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!navigator.onLine && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start gap-3">
              <WifiOff className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-orange-800">
                You are offline. Clock-out will be saved locally and synced when you reconnect. Photos cannot be uploaded until you're online.
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">{error}</div>
            </div>
          )}

          {/* Points Preview */}
          <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5 text-yellow-600" />
              <span className="font-semibold text-gray-900">Points to Earn</span>
            </div>
            <div className="text-3xl font-bold text-yellow-600">{totalPoints}</div>
            <div className="text-sm text-gray-600 mt-2 space-y-1">
              {pointsForNote > 0 && <div>✓ {pointsForNote} point for detailed notes</div>}
              {pointsForPhotos > 0 && <div>✓ {pointsForPhotos} point{pointsForPhotos > 1 ? 's' : ''} for {pointsForPhotos} photo{pointsForPhotos > 1 ? 's' : ''}</div>}
              {totalPoints === 0 && <div className="text-orange-600">Add notes (20+ chars) or photos to earn points!</div>}
            </div>
          </div>

          {/* Job Status Selection - Only for job clock out */}
          {type === 'job' && workOrderId && (
            <div className="border-2 border-gray-200 rounded-lg p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-3">
                  Job Status
                </label>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                    style={{
                      borderColor: jobStatus === 'done_for_day' ? '#3b82f6' : '#e5e7eb',
                      backgroundColor: jobStatus === 'done_for_day' ? '#eff6ff' : 'transparent'
                    }}>
                    <input
                      type="radio"
                      name="jobStatus"
                      value="done_for_day"
                      checked={jobStatus === 'done_for_day'}
                      onChange={(e) => {
                        setJobStatus(e.target.value as 'done_for_day' | 'complete');
                        setSendFeedbackEmail(false);
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-blue-600" />
                        <span className="font-medium text-gray-900">Done for the day</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        I'll continue this job later (keeps work order in progress)
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                    style={{
                      borderColor: jobStatus === 'complete' ? '#10b981' : '#e5e7eb',
                      backgroundColor: jobStatus === 'complete' ? '#f0fdf4' : 'transparent'
                    }}>
                    <input
                      type="radio"
                      name="jobStatus"
                      value="complete"
                      checked={jobStatus === 'complete'}
                      onChange={(e) => {
                        setJobStatus(e.target.value as 'done_for_day' | 'complete');
                        // Auto-check feedback email for service orders if customer has email
                        if (customerEmail && (workOrderType === 'service' || workOrderType === 'warranty' || workOrderType === 'vip_program')) {
                          setSendFeedbackEmail(true);
                        }
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="font-medium text-gray-900">Job is complete</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        Work is finished and ready for customer feedback
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Feedback Email Checkbox - Only show when job is complete */}
              {jobStatus === 'complete' && (
                <div className="pt-3 border-t border-gray-200">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendFeedbackEmail}
                      onChange={(e) => setSendFeedbackEmail(e.target.checked)}
                      disabled={!customerEmail}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-gray-900">
                          Send "How did it go?" email to customer
                        </span>
                      </div>
                      {customerEmail ? (
                        <p className="text-xs text-gray-600 mt-1">
                          Email will be sent to {customerEmail}
                        </p>
                      ) : (
                        <p className="text-xs text-orange-600 mt-1">
                          Customer does not have an email address on file
                        </p>
                      )}
                    </div>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Notes Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {type === 'daily' ? 'Daily Notes' : 'Job Notes'} (Optional - 1 point if 20+ characters)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={type === 'daily'
                ? "What did you accomplish today? Any issues or observations?"
                : "What work was completed? Any issues or follow-up needed?"}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={4}
            />
            <div className="flex items-center justify-between mt-2">
              <div className={`text-sm ${noteChars >= 20 ? 'text-green-600 font-medium' : 'text-gray-500'}`}>
                {noteChars}/20 characters {noteChars >= 20 && '✓ Earns 1 point!'}
              </div>
            </div>
          </div>

          {/* Photos Section - Only for job clock out */}
          {type === 'job' && workOrderId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Photos (Optional - 1 point per photo with description)
              </label>

              <div className="space-y-4">
                {/* Photo Upload Button */}
                <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer">
                  <Camera className="w-5 h-5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">Add Photos</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                </label>

                {/* Photo Previews */}
                {photos.map((photo, index) => {
                  const caption = photoCaptions[index] || '';
                  const captionLength = caption.trim().length;
                  const isValid = captionLength >= 20;

                  return (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <img
                          src={URL.createObjectURL(photo)}
                          alt="Preview"
                          className="w-24 h-24 object-cover rounded-lg"
                        />
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={caption}
                            onChange={(e) => updateCaption(index, e.target.value)}
                            placeholder="Describe this photo (20+ chars required)"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <div className="flex items-center justify-between">
                            <div className={`text-xs ${isValid ? 'text-green-600 font-medium' : 'text-gray-500'}`}>
                              {captionLength}/20 characters {isValid && '✓ Earns 1 point!'}
                            </div>
                            <button
                              onClick={() => removePhoto(index)}
                              className="text-xs text-red-600 hover:text-red-700 font-medium"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {photos.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  Only photos with descriptions of 20+ characters will be uploaded and earn points.
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              disabled={uploading}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleClockOut}
              disabled={uploading || (type === 'job' && !notesValid)}
              className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {uploading ? 'Clocking Out...' : 'Clock Out'}
            </button>
          </div>
          {type === 'job' && !notesValid && (
            <p className="text-sm text-red-600 text-center mt-2">
              Job notes must be at least 20 characters to clock out
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
