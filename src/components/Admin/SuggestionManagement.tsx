import { useState, useEffect } from 'react';
import { Lightbulb, CheckCircle, XCircle, Eye, MessageSquare, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { FeatureSuggestion } from '../../lib/types';

export function SuggestionManagement() {
  const [suggestions, setSuggestions] = useState<FeatureSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSuggestion, setSelectedSuggestion] = useState<FeatureSuggestion | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    loadSuggestions();
  }, []);

  async function loadSuggestions() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('feature_suggestions')
        .select('*, profiles(full_name, email)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setSuggestions(data);
    } catch (error) {
      console.error('Error loading suggestions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateSuggestionStatus(suggestionId: string, status: string, notes: string) {
    setUpdatingStatus(true);
    try {
      const updateData: any = {
        status,
        admin_notes: notes || null,
        updated_at: new Date().toISOString(),
      };

      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('feature_suggestions')
        .update(updateData)
        .eq('id', suggestionId);

      if (error) throw error;

      setSelectedSuggestion(null);
      setAdminNotes('');
      loadSuggestions();
      alert('Suggestion updated successfully!');
    } catch (error) {
      console.error('Error updating suggestion:', error);
      alert('Failed to update suggestion');
    } finally {
      setUpdatingStatus(false);
    }
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      in_review: 'bg-blue-100 text-blue-800 border-blue-300',
      completed: 'bg-green-100 text-green-800 border-green-300',
      declined: 'bg-red-100 text-red-800 border-red-300',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[status as keyof typeof styles]}`}>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  const filterSuggestions = (status: string) => {
    return suggestions.filter((s) => s.status === status);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600">Loading suggestions...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Feature Suggestions Management</h2>
        <p className="text-gray-300">Review and manage user feature requests</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-600 font-medium">Pending</p>
              <p className="text-2xl font-bold text-yellow-900">{filterSuggestions('pending').length}</p>
            </div>
            <Lightbulb className="w-8 h-8 text-yellow-500" />
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">In Review</p>
              <p className="text-2xl font-bold text-blue-900">{filterSuggestions('in_review').length}</p>
            </div>
            <Eye className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Completed</p>
              <p className="text-2xl font-bold text-green-900">{filterSuggestions('completed').length}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 font-medium">Declined</p>
              <p className="text-2xl font-bold text-red-900">{filterSuggestions('declined').length}</p>
            </div>
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Submitted By
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  Date
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {suggestions.map((suggestion) => (
                <tr key={suggestion.id} className="hover:bg-gray-50">
                  <td className="px-3 sm:px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 break-words">{suggestion.title}</div>
                    <div className="text-xs sm:text-sm text-gray-500 line-clamp-2 mt-1">{suggestion.description}</div>
                    <div className="md:hidden mt-2">
                      <div className="text-xs text-gray-700">{suggestion.profiles?.full_name}</div>
                      <div className="text-xs text-gray-500">{new Date(suggestion.created_at).toLocaleDateString()}</div>
                    </div>
                  </td>
                  <td className="px-3 sm:px-6 py-4 hidden md:table-cell">
                    <div className="text-sm text-gray-900">{suggestion.profiles?.full_name}</div>
                    <div className="text-xs text-gray-500">{suggestion.profiles?.email}</div>
                  </td>
                  <td className="px-3 sm:px-6 py-4 text-sm text-gray-500 hidden lg:table-cell">
                    {new Date(suggestion.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 sm:px-6 py-4">
                    {getStatusBadge(suggestion.status)}
                  </td>
                  <td className="px-3 sm:px-6 py-4">
                    <button
                      onClick={() => {
                        setSelectedSuggestion(suggestion);
                        setAdminNotes(suggestion.admin_notes || '');
                      }}
                      className="text-blue-600 hover:text-blue-900 text-sm font-medium whitespace-nowrap"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSuggestion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900">Manage Suggestion</h3>
              <button
                onClick={() => {
                  setSelectedSuggestion(null);
                  setAdminNotes('');
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Title</h4>
                <p className="text-gray-700">{selectedSuggestion.title}</p>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Description</h4>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedSuggestion.description}</p>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Submitted By</h4>
                <p className="text-gray-700">
                  {selectedSuggestion.profiles?.full_name} ({selectedSuggestion.profiles?.email})
                </p>
                <p className="text-sm text-gray-500">
                  {new Date(selectedSuggestion.created_at).toLocaleString()}
                </p>
              </div>

              <div>
                <label className="block font-semibold text-gray-900 mb-2">
                  Admin Notes / Response
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Add notes or response to the user..."
                />
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Update Status</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => updateSuggestionStatus(selectedSuggestion.id, 'in_review', adminNotes)}
                    disabled={updatingStatus}
                    className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 text-sm sm:text-base"
                  >
                    <Eye className="w-4 h-4" />
                    <span className="whitespace-nowrap">Mark In Review</span>
                  </button>

                  <button
                    onClick={() => updateSuggestionStatus(selectedSuggestion.id, 'completed', adminNotes)}
                    disabled={updatingStatus}
                    className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 text-sm sm:text-base"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span className="whitespace-nowrap">Mark Completed</span>
                  </button>

                  <button
                    onClick={() => updateSuggestionStatus(selectedSuggestion.id, 'declined', adminNotes)}
                    disabled={updatingStatus}
                    className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 text-sm sm:text-base"
                  >
                    <XCircle className="w-4 h-4" />
                    <span className="whitespace-nowrap">Decline</span>
                  </button>

                  <button
                    onClick={() => updateSuggestionStatus(selectedSuggestion.id, 'pending', adminNotes)}
                    disabled={updatingStatus}
                    className="px-4 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 text-sm sm:text-base"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span className="whitespace-nowrap">Mark Pending</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
