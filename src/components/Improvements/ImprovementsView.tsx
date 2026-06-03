import { useState, useEffect } from 'react';
import { Bug, Plus, AlertCircle, CheckCircle, Clock, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Issue {
  id: string;
  title: string;
  description: string;
  issue_type: string;
  priority: string;
  status: string;
  page_url: string | null;
  browser_info: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  profiles?: { full_name: string };
}

export function ImprovementsView() {
  const { profile } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [form, setForm] = useState({
    title: '',
    description: '',
    issue_type: 'bug',
    priority: 'medium',
    page_url: window.location.href,
  });

  useEffect(() => {
    loadIssues();
  }, [profile, filterStatus]);

  async function loadIssues() {
    if (!profile) return;

    try {
      let query = supabase
        .from('issue_reports')
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false });

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      if (profile.role !== 'admin') {
        query = query.eq('user_id', profile.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setIssues(data || []);
    } catch (error) {
      console.error('Error loading issues:', error);
    } finally {
      setLoading(false);
    }
  }

  async function submitIssue(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    try {
      const browserInfo = `${navigator.userAgent}`;

      const { error } = await supabase.from('issue_reports').insert({
        user_id: profile.id,
        title: form.title,
        description: form.description,
        issue_type: form.issue_type,
        priority: form.priority,
        page_url: form.page_url,
        browser_info: browserInfo,
      });

      if (error) throw error;

      setForm({
        title: '',
        description: '',
        issue_type: 'bug',
        priority: 'medium',
        page_url: window.location.href,
      });
      setShowForm(false);
      loadIssues();
    } catch (error) {
      console.error('Error submitting issue:', error);
      alert('Failed to submit issue. Please try again.');
    }
  }

  async function updateIssueStatus(issueId: string, newStatus: string, adminNotes?: string) {
    try {
      const updateData: any = { status: newStatus };
      if (adminNotes !== undefined) {
        updateData.admin_notes = adminNotes;
      }

      const { error } = await supabase
        .from('issue_reports')
        .update(updateData)
        .eq('id', issueId);

      if (error) throw error;
      loadIssues();
      setSelectedIssue(null);
    } catch (error) {
      console.error('Error updating issue:', error);
      alert('Failed to update issue.');
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'resolved':
      case 'closed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <Bug className="w-5 h-5 text-gray-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'bug':
        return 'Bug Report';
      case 'feature_request':
        return 'Feature Request';
      case 'question':
        return 'Question';
      default:
        return 'Other';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-400">Loading issues...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Suggestions</h1>
            <p className="text-sm text-gray-400 mt-1">Report bugs, request features, or ask questions</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Submit Suggestion
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterStatus('open')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === 'open'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Open
          </button>
          <button
            onClick={() => setFilterStatus('in_progress')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === 'in_progress'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            In Progress
          </button>
          <button
            onClick={() => setFilterStatus('resolved')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === 'resolved'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Resolved
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-700">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Submit a Suggestion</h2>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={submitIssue} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Issue Type
                  </label>
                  <select
                    value={form.issue_type}
                    onChange={(e) => setForm({ ...form, issue_type: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="bug">Bug Report</option>
                    <option value="feature_request">Feature Request</option>
                    <option value="question">Question</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Priority
                  </label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                    placeholder="Brief summary of the issue"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                    rows={6}
                    placeholder="Detailed description of the issue. Include steps to reproduce if it's a bug."
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Page URL
                  </label>
                  <input
                    type="text"
                    value={form.page_url}
                    onChange={(e) => setForm({ ...form, page_url: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                    placeholder="Where did this happen?"
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Submit
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {issues.length === 0 ? (
          <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
            <Bug className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-300">No suggestions submitted yet</p>
            <p className="text-sm text-gray-500 mt-1">Submit your first suggestion to get started</p>
          </div>
        ) : (
          issues.map((issue) => (
            <div
              key={issue.id}
              className="bg-gray-800 rounded-lg border border-gray-700 p-6 hover:bg-gray-750 transition-colors cursor-pointer"
              onClick={() => setSelectedIssue(issue)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {getStatusIcon(issue.status)}
                  <div>
                    <h3 className="font-semibold text-white">{issue.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400">{getTypeLabel(issue.issue_type)}</span>
                      <span className="text-xs text-gray-600">•</span>
                      <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(issue.priority)}`}>
                        {issue.priority}
                      </span>
                      {profile?.role === 'admin' && issue.profiles && (
                        <>
                          <span className="text-xs text-gray-600">•</span>
                          <span className="text-xs text-gray-400">by {issue.profiles.full_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(issue.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-gray-300 line-clamp-2">{issue.description}</p>
              {issue.admin_notes && (
                <div className="mt-3 p-3 bg-blue-900/30 rounded-lg border border-blue-800">
                  <p className="text-xs font-medium text-blue-300 mb-1">Admin Response:</p>
                  <p className="text-sm text-blue-200">{issue.admin_notes}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {selectedIssue && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-gray-700">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getStatusIcon(selectedIssue.status)}
                  <h2 className="text-xl font-bold text-white">{selectedIssue.title}</h2>
                </div>
                <button
                  onClick={() => setSelectedIssue(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className={`text-sm px-3 py-1 rounded ${getPriorityColor(selectedIssue.priority)}`}>
                    {selectedIssue.priority}
                  </span>
                  <span className="text-sm text-gray-300">{getTypeLabel(selectedIssue.issue_type)}</span>
                  <span className="text-sm text-gray-400">
                    Status: <span className="font-medium capitalize text-gray-300">{selectedIssue.status.replace('_', ' ')}</span>
                  </span>
                </div>

                <div>
                  <h3 className="font-semibold text-white mb-2">Description</h3>
                  <p className="text-gray-300 whitespace-pre-wrap">{selectedIssue.description}</p>
                </div>

                {selectedIssue.page_url && (
                  <div>
                    <h3 className="font-semibold text-white mb-2">Page URL</h3>
                    <a
                      href={selectedIssue.page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline text-sm"
                    >
                      {selectedIssue.page_url}
                    </a>
                  </div>
                )}

                {selectedIssue.browser_info && (
                  <div>
                    <h3 className="font-semibold text-white mb-2">Browser Info</h3>
                    <p className="text-xs text-gray-400 font-mono">{selectedIssue.browser_info}</p>
                  </div>
                )}

                {selectedIssue.admin_notes && (
                  <div className="p-4 bg-blue-900/30 rounded-lg border border-blue-800">
                    <h3 className="font-semibold text-blue-300 mb-2">Admin Response</h3>
                    <p className="text-blue-200">{selectedIssue.admin_notes}</p>
                  </div>
                )}

                {profile?.role === 'admin' && (
                  <div className="border-t border-gray-700 pt-4 mt-4">
                    <h3 className="font-semibold text-white mb-3">Admin Actions</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedIssue.status === 'open' && (
                        <button
                          onClick={() => updateIssueStatus(selectedIssue.id, 'in_progress')}
                          className="px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm"
                        >
                          Mark In Progress
                        </button>
                      )}
                      {selectedIssue.status !== 'resolved' && (
                        <button
                          onClick={() => {
                            const notes = prompt('Add resolution notes (optional):');
                            updateIssueStatus(selectedIssue.id, 'resolved', notes || undefined);
                          }}
                          className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                        >
                          Mark Resolved
                        </button>
                      )}
                      {selectedIssue.status !== 'closed' && (
                        <button
                          onClick={() => updateIssueStatus(selectedIssue.id, 'closed')}
                          className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                        >
                          Close Issue
                        </button>
                      )}
                      {selectedIssue.status !== 'open' && (
                        <button
                          onClick={() => updateIssueStatus(selectedIssue.id, 'open')}
                          className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                        >
                          Reopen Issue
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-500 border-t border-gray-700 pt-4">
                  <p>Created: {new Date(selectedIssue.created_at).toLocaleString()}</p>
                  <p>Last Updated: {new Date(selectedIssue.updated_at).toLocaleString()}</p>
                  {selectedIssue.resolved_at && (
                    <p>Resolved: {new Date(selectedIssue.resolved_at).toLocaleString()}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
