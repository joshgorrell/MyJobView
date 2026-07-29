import React, { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Camera, Package, AlertCircle, DollarSign, Upload, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface PartRequestFormProps {
  workOrderId: string;
  projectId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function PartRequestForm({ workOrderId, projectId, onSuccess, onCancel }: PartRequestFormProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    part_name: '',
    part_number: '',
    quantity: 1,
    urgency: 'not_urgent',
    reason: '',
    estimated_cost: ''
  });

  function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    if (!formData.part_name.trim()) {
      alert('Please enter part name');
      return;
    }

    if (!formData.reason.trim()) {
      alert('Please explain why this part is needed');
      return;
    }

    setLoading(true);

    try {
      let photoUrl = null;

      if (photoFile) {
        const fileExt = photoFile.name.split('.').pop();
        const fileName = `${profile.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('parts_request_photos')
          .upload(fileName, photoFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('parts_request_photos')
          .getPublicUrl(fileName);

        photoUrl = publicUrl;
      }

      const { data: requestData, error: reqError } = await supabase
        .from('product_requests')
        .insert({
          requested_by: profile.id,
          request_type: 'job',
          work_order_id: workOrderId,
          project_id: projectId || null,
          notes: formData.reason.trim(),
          priority: formData.urgency === 'immediate' || formData.urgency === 'today' ? 'urgent' : 'normal',
        })
        .select('id')
        .single();

      if (reqError) throw reqError;

      if (photoUrl || formData.part_name.trim() || formData.part_number.trim() || formData.quantity > 0 || (formData.estimated_cost && parseFloat(formData.estimated_cost) > 0)) {
        const { error: itemError } = await supabase
          .from('product_request_items')
          .insert({
            request_id: requestData.id,
            product_name: formData.part_name.trim(),
            model_number: formData.part_number.trim() || null,
            quantity_requested: formData.quantity,
            estimated_cost: formData.estimated_cost ? parseFloat(formData.estimated_cost) : null,
            notes: photoUrl ? `Photo: ${photoUrl}` : null,
          });

        if (itemError) throw itemError;
      }

      setFormData({
        part_name: '',
        part_number: '',
        quantity: 1,
        urgency: 'not_urgent',
        reason: '',
        estimated_cost: ''
      });
      removePhoto();

      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error submitting parts request:', error);
      alert('Failed to submit parts request');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <AlertCircle className="w-4 h-4 inline mr-2" />
        Submit a request for parts needed to complete this job. Include a photo if possible.
      </div>

      {/* Photo Capture */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Part Photo (Optional)
        </label>
        {photoPreview ? (
          <div className="relative">
            <img
              src={photoPreview}
              alt="Part preview"
              className="w-full h-48 object-cover rounded-lg border border-gray-300"
            />
            <button
              type="button"
              onClick={removePhoto}
              className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full hover:bg-red-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoCapture}
              className="hidden"
              id="part-photo-input"
            />
            <label
              htmlFor="part-photo-input"
              className="flex items-center justify-center gap-2 w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <Camera className="w-6 h-6 text-gray-400" />
              <span className="text-gray-600">Tap to capture photo</span>
            </label>
          </div>
        )}
      </div>

      {/* Part Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Part Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.part_name}
          onChange={(e) => setFormData({ ...formData, part_name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="e.g., Air Filter 16x25x1"
          required
        />
      </div>

      {/* Part Number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Part Number (if known)
        </label>
        <input
          type="text"
          value={formData.part_number}
          onChange={(e) => setFormData({ ...formData, part_number: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="e.g., AC-123456"
        />
      </div>

      {/* Quantity and Urgency Row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Quantity <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="1"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Urgency <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.urgency}
            onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
            <option value="immediate">Immediate (Job stopped)</option>
            <option value="today">Today (Need ASAP)</option>
            <option value="this_week">This Week</option>
            <option value="not_urgent">Not Urgent</option>
          </select>
        </div>
      </div>

      {/* Estimated Cost */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Estimated Cost (Optional)
        </label>
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="number"
            step="0.01"
            min="0"
            value={formData.estimated_cost}
            onChange={(e) => setFormData({ ...formData, estimated_cost: e.target.value })}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Reason */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Why is this part needed? <span className="text-red-500">*</span>
        </label>
        <textarea
          value={formData.reason}
          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={3}
          placeholder="Explain why this part is needed to complete the job..."
          required
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? (
            <>
              <Upload className="w-5 h-5 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Package className="w-5 h-5" />
              Submit Request
            </>
          )}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
