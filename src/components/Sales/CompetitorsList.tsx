import { useState, useEffect } from 'react';
import { Plus, Search, Building2, Phone, Globe, Edit, Users, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CompetitorForm } from './CompetitorForm';
import { CompetitorDetail } from './CompetitorDetail';
import ConfirmModal from '../ui/ConfirmModal';

interface Competitor {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  prospect_count?: number;
}

export function CompetitorsList() {
  const { profile } = useAuth();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadCompetitors();
  }, []);

  async function loadCompetitors() {
    try {
      setLoading(true);

      // Load competitors with prospect count
      const { data: competitorsData, error: competitorsError } = await supabase
        .from('competitors')
        .select('*')
        .order('name');

      if (competitorsError) throw competitorsError;

      // Load prospect counts for each competitor
      if (competitorsData) {
        const competitorIds = competitorsData.map(c => c.id);
        const { data: relationshipsData } = await supabase
          .from('prospect_competitor_relationships')
          .select('competitor_id')
          .in('competitor_id', competitorIds);

        // Count prospects per competitor
        const prospectCounts: Record<string, number> = {};
        relationshipsData?.forEach(rel => {
          prospectCounts[rel.competitor_id] = (prospectCounts[rel.competitor_id] || 0) + 1;
        });

        // Add prospect counts to competitors
        const competitorsWithCounts = competitorsData.map(comp => ({
          ...comp,
          prospect_count: prospectCounts[comp.id] || 0,
        }));

        setCompetitors(competitorsWithCounts);
      }
    } catch (error) {
      console.error('Error loading competitors:', error);
      alert('Failed to load competitors');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(competitor: Competitor) {
    try {
      const { error } = await supabase
        .from('competitors')
        .delete()
        .eq('id', competitor.id);

      if (error) throw error;

      await loadCompetitors();
    } catch (error) {
      console.error('Error deleting competitor:', error);
      alert('Failed to delete competitor');
    }
  }

  function handleEdit(competitor: Competitor) {
    setSelectedCompetitor(competitor);
    setShowAddForm(true);
  }

  function handleViewDetails(competitor: Competitor) {
    setSelectedCompetitor(competitor);
    setShowDetailModal(true);
  }

  const filteredCompetitors = competitors.filter(comp =>
    comp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    comp.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    comp.website?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!profile?.can_view_prospects) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Access Restricted
          </h3>
          <p className="text-gray-600">
            You don't have permission to view competitor information.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Competitors</h2>
          <p className="text-sm text-gray-600 mt-1">
            Track competitors and their relationships with prospects
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedCompetitor(null);
            setShowAddForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Competitor
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search competitors..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Competitors Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading competitors...</p>
          </div>
        </div>
      ) : filteredCompetitors.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchQuery ? 'No competitors found' : 'No competitors yet'}
          </h3>
          <p className="text-gray-600 mb-4">
            {searchQuery
              ? 'Try adjusting your search terms'
              : 'Add your first competitor to start tracking prospect relationships'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => {
                setSelectedCompetitor(null);
                setShowAddForm(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Competitor
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCompetitors.map((competitor) => (
            <div
              key={competitor.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <button
                    onClick={() => handleViewDetails(competitor)}
                    className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors text-left"
                  >
                    {competitor.name}
                  </button>
                  {!competitor.is_active && (
                    <span className="inline-block px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-700 rounded mt-1">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(competitor)}
                    className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setConfirmModal({ title: 'Delete Competitor', message: `Are you sure you want to delete ${competitor.name}? This will also remove all prospect relationships with this competitor.`, onConfirm: () => handleDelete(competitor) })}
                    className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {competitor.address && (
                  <div className="flex items-start gap-2 text-gray-600">
                    <Building2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{competitor.address}</span>
                  </div>
                )}

                {competitor.phone && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-4 h-4 flex-shrink-0" />
                    <a href={`tel:${competitor.phone}`} className="hover:text-blue-600">
                      {competitor.phone}
                    </a>
                  </div>
                )}

                {competitor.website && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Globe className="w-4 h-4 flex-shrink-0" />
                    <a
                      href={competitor.website.startsWith('http') ? competitor.website : `https://${competitor.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-600 truncate"
                    >
                      {competitor.website}
                    </a>
                  </div>
                )}

                <div className="flex items-center gap-2 text-gray-600 pt-2 border-t border-gray-100">
                  <Users className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium">
                    {competitor.prospect_count || 0} prospect{competitor.prospect_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Competitor Modal */}
      {showAddForm && (
        <CompetitorForm
          competitor={selectedCompetitor}
          onClose={() => {
            setShowAddForm(false);
            setSelectedCompetitor(null);
          }}
          onSuccess={() => {
            setShowAddForm(false);
            setSelectedCompetitor(null);
            loadCompetitors();
          }}
        />
      )}

      {/* Competitor Detail Modal */}
      {showDetailModal && selectedCompetitor && (
        <CompetitorDetail
          competitor={selectedCompetitor}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedCompetitor(null);
          }}
          onEdit={() => {
            setShowDetailModal(false);
            setShowAddForm(true);
          }}
        />
      )}

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
