import { useState, useEffect } from 'react';
import { X, Plus, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Competitor {
  id: string;
  name: string;
  website: string | null;
  is_active: boolean;
}

interface CompetitorSelectorProps {
  selectedCompetitorIds: string[];
  onChange: (competitorIds: string[]) => void;
  className?: string;
}

export function CompetitorSelector({ selectedCompetitorIds, onChange, className = '' }: CompetitorSelectorProps) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCompetitorName, setNewCompetitorName] = useState('');
  const [newCompetitorWebsite, setNewCompetitorWebsite] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCompetitors();
  }, []);

  async function loadCompetitors() {
    try {
      const { data, error } = await supabase
        .from('competitors')
        .select('id, name, website, is_active')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      setCompetitors(data || []);
    } catch (err) {
      console.error('Error loading competitors:', err);
    }
  }

  async function handleAddCompetitor() {
    if (!newCompetitorName.trim()) {
      setError('Competitor name is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: existing } = await supabase
        .from('competitors')
        .select('id')
        .ilike('name', newCompetitorName.trim())
        .maybeSingle();

      if (existing) {
        setError('A competitor with this name already exists');
        setLoading(false);
        return;
      }

      const { data: newCompetitor, error: insertError } = await supabase
        .from('competitors')
        .insert([{ name: newCompetitorName.trim(), website: newCompetitorWebsite.trim() || null, is_active: true }])
        .select()
        .single();

      if (insertError) throw insertError;

      setCompetitors(prev => [...prev, newCompetitor].sort((a, b) => a.name.localeCompare(b.name)));
      onChange([...selectedCompetitorIds, newCompetitor.id]);
      setNewCompetitorName('');
      setNewCompetitorWebsite('');
      setShowAddForm(false);
    } catch (err: any) {
      console.error('Error creating competitor:', err);
      setError(err.message || 'Failed to create competitor');
    } finally {
      setLoading(false);
    }
  }

  function handleToggleCompetitor(competitorId: string) {
    if (selectedCompetitorIds.includes(competitorId)) {
      onChange(selectedCompetitorIds.filter(id => id !== competitorId));
    } else {
      onChange([...selectedCompetitorIds, competitorId]);
    }
  }

  const selectedCompetitors = competitors.filter(c => selectedCompetitorIds.includes(c.id));
  const availableCompetitors = competitors.filter(c => !selectedCompetitorIds.includes(c.id));

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-3">
        <Building2 className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-blue-200">Currently Works With (Competitors)</span>
      </div>

      {selectedCompetitors.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selectedCompetitors.map(c => (
            <div
              key={c.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded-full text-sm"
            >
              <Building2 className="w-3 h-3" />
              <span className="font-medium">{c.name}</span>
              <button
                type="button"
                onClick={() => handleToggleCompetitor(c.id)}
                className="hover:bg-orange-500/30 rounded-full p-0.5 transition-colors ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {availableCompetitors.length > 0 && (
        <div className="mb-3">
          <select
            value=""
            onChange={e => { if (e.target.value) handleToggleCompetitor(e.target.value); }}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select a competitor to add...</option>
            {availableCompetitors.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {!showAddForm ? (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 border border-blue-500/30 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add New Competitor
        </button>
      ) : (
        <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-3 space-y-3 mt-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-200">Create New Competitor</span>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setNewCompetitorName(''); setNewCompetitorWebsite(''); setError(null); }}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">{error}</p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={newCompetitorName}
              onChange={e => { setNewCompetitorName(e.target.value); setError(null); }}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-white rounded-lg text-sm placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. ABC Security Systems"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Website (optional)</label>
            <input
              type="url"
              value={newCompetitorWebsite}
              onChange={e => setNewCompetitorWebsite(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-white rounded-lg text-sm placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://example.com"
              disabled={loading}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddCompetitor}
              disabled={loading || !newCompetitorName.trim()}
              className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create & Select'}
            </button>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setNewCompetitorName(''); setNewCompetitorWebsite(''); setError(null); }}
              disabled={loading}
              className="px-3 py-1.5 border border-gray-600 text-gray-300 text-sm rounded-lg hover:bg-gray-700 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500 mt-2">
        Track which security companies this prospect currently works with.
      </p>
    </div>
  );
}
