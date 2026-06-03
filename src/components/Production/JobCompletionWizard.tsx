import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { SignaturePad } from './SignaturePad';
import { gpsTrackingService } from '../../lib/gpsTracking';
import { CheckCircle, Circle, Camera, AlertCircle, FileText, PenTool, Send, ChevronRight, ChevronLeft, Mail } from 'lucide-react';

interface JobCompletionWizardProps {
  workOrderId: string;
  onComplete: () => void;
  onCancel: () => void;
}

interface WorkOrder {
  id: string;
  title: string;
  type: string;
  work_order_number: string;
}

interface ChecklistTemplate {
  id: string;
  template_name: string;
  checklist_items: Array<{
    id: number;
    item: string;
    required: boolean;
  }>;
  required_photos: string[];
  requires_signature: boolean;
}

interface JobPhoto {
  category: string;
}

export function JobCompletionWizard({ workOrderId, onComplete, onCancel }: JobCompletionWizardProps) {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [jobPhotos, setJobPhotos] = useState<JobPhoto[]>([]);

  const [checklist, setChecklist] = useState<Record<number, boolean>>({});
  const [techNotes, setTechNotes] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [qualityScore, setQualityScore] = useState(5);
  const [flagForReview, setFlagForReview] = useState(false);
  const [sendFeedbackEmail, setSendFeedbackEmail] = useState(false);

  useEffect(() => {
    loadData();
  }, [workOrderId]);

  async function loadData() {
    try {
      const [woResult, photosResult] = await Promise.all([
        supabase
          .from('work_orders')
          .select('id, title, type, work_order_number')
          .eq('id', workOrderId)
          .maybeSingle(),
        supabase
          .from('job_photos')
          .select('category')
          .eq('work_order_id', workOrderId)
      ]);

      if (woResult.error) throw woResult.error;
      if (!woResult.data) throw new Error('Work order not found');

      setWorkOrder(woResult.data);
      setJobPhotos(photosResult.data || []);

      const jobType = woResult.data.type || 'General';
      const { data: templateData, error: templateError } = await supabase
        .from('job_completion_templates')
        .select('*')
        .eq('job_type', jobType)
        .eq('is_active', true)
        .maybeSingle();

      if (templateError && templateError.code !== 'PGRST116') throw templateError;

      if (!templateData) {
        const { data: generalTemplate } = await supabase
          .from('job_completion_templates')
          .select('*')
          .eq('job_type', 'General')
          .eq('is_active', true)
          .maybeSingle();

        setTemplate(generalTemplate);
      } else {
        setTemplate(templateData);
      }

      if (templateData?.checklist_items) {
        const initialChecklist: Record<number, boolean> = {};
        templateData.checklist_items.forEach((item: any) => {
          initialChecklist[item.id] = false;
        });
        setChecklist(initialChecklist);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load job completion data');
    } finally {
      setLoading(false);
    }
  }

  function toggleChecklistItem(itemId: number) {
    setChecklist({ ...checklist, [itemId]: !checklist[itemId] });
  }

  function canProceedToNextStep(): boolean {
    if (step === 2 && template) {
      const requiredItems = template.checklist_items.filter(item => item.required);
      return requiredItems.every(item => checklist[item.id]);
    }
    if (step === 3 && template?.required_photos) {
      return template.required_photos.every(category =>
        jobPhotos.some(photo => photo.category === category)
      );
    }
    if (step === 5 && template?.requires_signature) {
      return !!signatureDataUrl && !!customerName.trim();
    }
    return true;
  }

  async function handleSubmit() {
    if (!profile || !workOrder || !template) return;

    setSubmitting(true);

    try {
      let signatureUrl = null;

      if (signatureDataUrl) {
        const base64Data = signatureDataUrl.split(',')[1];
        const blob = await fetch(`data:image/png;base64,${base64Data}`).then(r => r.blob());
        const fileName = `${profile.id}/${Date.now()}.png`;

        const { error: uploadError } = await supabase.storage
          .from('customer_signatures')
          .upload(fileName, blob);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('customer_signatures')
          .getPublicUrl(fileName);

        signatureUrl = publicUrl;
      }

      const checklistData = {
        template_id: template.id,
        template_name: template.template_name,
        items: template.checklist_items.map(item => ({
          ...item,
          completed: checklist[item.id] || false
        }))
      };

      const { error: insertError } = await supabase
        .from('job_completions')
        .insert({
          work_order_id: workOrderId,
          technician_id: profile.id,
          template_id: template.id,
          checklist_data: checklistData,
          tech_notes: techNotes.trim() || null,
          customer_signature_url: signatureUrl,
          customer_name: customerName.trim() || null,
          customer_email: customerEmail.trim() || null,
          quality_score: qualityScore,
          flagged_for_review: flagForReview
        });

      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from('work_orders')
        .update({ status: 'completed', actual_completion_date: new Date().toISOString().split('T')[0] })
        .eq('id', workOrderId);

      if (updateError) throw updateError;

      // Capture GPS coordinates for job clock-out
      const gpsResult = await gpsTrackingService.captureLocationForClockEvent(true);

      // Update active time_entry with clock_out and GPS coordinates
      const now = new Date();
      const { data: activeEntry, error: fetchError } = await supabase
        .from('time_entries')
        .select('id, clock_in')
        .eq('work_order_id', workOrderId)
        .eq('technician_id', profile.id)
        .is('clock_out', null)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching active time entry:', fetchError);
      } else if (activeEntry) {
        const clockInTime = new Date(activeEntry.clock_in);
        const clockOutTime = now;
        const diffMs = clockOutTime.getTime() - clockInTime.getTime();
        const totalHours = Math.max(0, diffMs / (1000 * 60 * 60));

        const { error: timeUpdateError } = await supabase
          .from('time_entries')
          .update({
            clock_out: now.toISOString(),
            total_hours: totalHours,
            status: 'completed',
            clock_out_latitude: gpsResult.latitude,
            clock_out_longitude: gpsResult.longitude,
            clock_out_gps_accuracy: gpsResult.accuracy,
            clock_out_gps_capture_method: gpsResult.method,
            clock_out_gps_duration_ms: gpsResult.duration_ms,
            clock_out_gps_attempted_at: gpsResult.attempted_at,
            clock_out_gps_captured_at: gpsResult.captured_at
          })
          .eq('id', activeEntry.id);

        if (timeUpdateError) {
          console.error('Error updating time entry:', timeUpdateError);
        }
      }

      // Stop GPS tracking
      gpsTrackingService.stopTracking();

      // Send feedback email if requested
      if (sendFeedbackEmail && customerEmail.trim()) {
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
                }),
              }
            );

            const result = await response.json();
            if (result.success) {
              console.log('Feedback email sent successfully');
            } else {
              console.error('Failed to send feedback email:', result.error || result.message);
            }
          }
        } catch (emailError) {
          console.error('Error sending feedback email:', emailError);
          // Don't throw - job completion should still succeed even if email fails
        }
      }

      onComplete();
    } catch (error) {
      console.error('Error submitting job completion:', error);
      alert('Failed to submit job completion');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!workOrder || !template) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Unable to load job completion data</p>
      </div>
    );
  }

  const totalSteps = 5;
  const progress = (step / totalSteps) * 100;

  return (
    <div className="bg-white rounded-xl shadow-lg max-w-2xl mx-auto">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl sm:text-2xl font-bold text-white">Complete Job</h2>
        <p className="text-gray-300">
          {workOrder.work_order_number}: {workOrder.title}
        </p>
        <div className="mt-4 bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-600 mt-2">Step {step} of {totalSteps}</p>
      </div>

      {/* Step Content */}
      <div className="p-6 min-h-[400px]">
        {/* Step 1: Overview */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-blue-100 rounded-lg">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Job Overview</h3>
                <p className="text-sm text-gray-600">Review job details before proceeding</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div>
                <span className="text-sm font-medium text-gray-700">Work Order:</span>
                <p className="text-gray-900">{workOrder.work_order_number}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Job Title:</span>
                <p className="text-gray-900">{workOrder.title}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Job Type:</span>
                <p className="text-gray-900">{workOrder.type || 'General'}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Checklist Template:</span>
                <p className="text-gray-900">{template.template_name}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Total Checklist Items:</span>
                <p className="text-gray-900">
                  {template.checklist_items.length} items
                  ({template.checklist_items.filter(i => i.required).length} required)
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Job Photos:</span>
                <p className="text-gray-900">{jobPhotos.length} photos uploaded</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <AlertCircle className="w-4 h-4 inline mr-2" />
              You will need to complete all required checklist items and obtain customer signature.
            </div>
          </div>
        )}

        {/* Step 2: Checklist */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Job Checklist</h3>
                <p className="text-sm text-gray-600">Mark all items as completed</p>
              </div>
            </div>

            <div className="space-y-2">
              {template.checklist_items.map(item => (
                <button
                  key={item.id}
                  onClick={() => toggleChecklistItem(item.id)}
                  className={`w-full flex items-start gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                    checklist[item.id]
                      ? 'bg-green-50 border-green-300'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {checklist[item.id] ? (
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-6 h-6 text-gray-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <span className={`${checklist[item.id] ? 'text-green-900' : 'text-gray-900'}`}>
                      {item.item}
                    </span>
                    {item.required && (
                      <span className="ml-2 text-xs text-red-600 font-medium">Required</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {!canProceedToNextStep() && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                Please complete all required checklist items before proceeding.
              </div>
            )}
          </div>
        )}

        {/* Step 3: Photos */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Camera className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Photo Verification</h3>
                <p className="text-sm text-gray-600">Ensure required photos are captured</p>
              </div>
            </div>

            <div className="space-y-3">
              {template.required_photos.map(category => {
                const hasPhoto = jobPhotos.some(p => p.category === category);
                return (
                  <div
                    key={category}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 ${
                      hasPhoto
                        ? 'bg-green-50 border-green-300'
                        : 'bg-red-50 border-red-300'
                    }`}
                  >
                    {hasPhoto ? (
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-red-600" />
                    )}
                    <div className="flex-1">
                      <span className={hasPhoto ? 'text-green-900' : 'text-red-900'}>
                        {category.charAt(0).toUpperCase() + category.slice(1)} Photo
                      </span>
                      {hasPhoto ? (
                        <span className="ml-2 text-xs text-green-600">✓ Captured</span>
                      ) : (
                        <span className="ml-2 text-xs text-red-600">Missing</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {!canProceedToNextStep() && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                Please capture all required photos before proceeding. Go back to the work order to add photos.
              </div>
            )}
          </div>
        )}

        {/* Step 4: Notes */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-orange-100 rounded-lg">
                <FileText className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Technician Notes</h3>
                <p className="text-sm text-gray-600">Add any observations or comments</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={techNotes}
                onChange={(e) => setTechNotes(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={8}
                placeholder="Enter any notes about the job, parts used, customer concerns, recommendations, etc..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quality Self-Assessment
              </label>
              <select
                value={qualityScore}
                onChange={(e) => setQualityScore(parseInt(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={5}>5 - Excellent (Above and beyond)</option>
                <option value={4}>4 - Good (Met all requirements)</option>
                <option value={3}>3 - Satisfactory (Met basic requirements)</option>
                <option value={2}>2 - Needs Improvement (Some issues)</option>
                <option value={1}>1 - Poor (Major issues)</option>
              </select>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="flag-review"
                checked={flagForReview}
                onChange={(e) => setFlagForReview(e.target.checked)}
                className="mt-1"
              />
              <label htmlFor="flag-review" className="text-sm text-gray-700">
                Flag this job for manager review (check if there were any issues, complications, or concerns)
              </label>
            </div>
          </div>
        )}

        {/* Step 5: Signature */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-indigo-100 rounded-lg">
                <PenTool className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Customer Signature</h3>
                <p className="text-sm text-gray-600">Customer sign-off required</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter customer name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Email (Optional)
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => {
                  setCustomerEmail(e.target.value);
                  // Auto-check feedback email for service orders if email is provided
                  if (e.target.value.trim() && (workOrder.type === 'service' || workOrder.type === 'warranty' || workOrder.type === 'vip_program')) {
                    setSendFeedbackEmail(true);
                  }
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter customer email"
              />
            </div>

            {/* Feedback Email Checkbox */}
            <div className="border border-gray-200 rounded-lg p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendFeedbackEmail}
                  onChange={(e) => setSendFeedbackEmail(e.target.checked)}
                  disabled={!customerEmail.trim()}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-600" />
                    <span className="font-medium text-gray-900">
                      Send "How did it go?" email to customer
                    </span>
                  </div>
                  {customerEmail.trim() ? (
                    <p className="text-xs text-gray-600 mt-1">
                      Email will be sent to {customerEmail}
                    </p>
                  ) : (
                    <p className="text-xs text-orange-600 mt-1">
                      Enter customer email above to enable this option
                    </p>
                  )}
                </div>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Signature {template.requires_signature && <span className="text-red-500">*</span>}
              </label>
              {signatureDataUrl ? (
                <div className="border-2 border-green-300 rounded-lg p-4 bg-green-50">
                  <img src={signatureDataUrl} alt="Customer signature" className="max-h-32 mx-auto" />
                  <button
                    onClick={() => setShowSignaturePad(true)}
                    className="mt-3 w-full py-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    Change Signature
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSignaturePad(true)}
                  className="w-full py-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-gray-600 font-medium"
                >
                  Tap to Capture Signature
                </button>
              )}
            </div>

            {!canProceedToNextStep() && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                Customer name and signature are required to complete the job.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-6 border-t border-gray-200 flex gap-3">
        <button
          onClick={onCancel}
          className="px-6 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300"
        >
          Cancel
        </button>
        <div className="flex-1" />
        {step > 1 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex items-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        )}
        {step < totalSteps ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceedToNextStep()}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting || !canProceedToNextStep()}
            className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Send className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Complete Job
              </>
            )}
          </button>
        )}
      </div>

      {/* Signature Pad Modal */}
      {showSignaturePad && (
        <SignaturePad
          onSave={(dataUrl) => {
            setSignatureDataUrl(dataUrl);
            setShowSignaturePad(false);
          }}
          onCancel={() => setShowSignaturePad(false)}
        />
      )}
    </div>
  );
}
