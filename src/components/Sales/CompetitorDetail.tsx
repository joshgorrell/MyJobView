import { useState, useEffect } from 'react';
import { X, Building2, MapPin, Phone, Globe, FileText, Users, Edit, ExternalLink, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Competitor {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface ProspectRelationship {
  id: string;
  prospect_id: string;
  relationship_type: string;
  relationship_strength: string | null;
  estimated_annual_spend: number | null;
  pain_points: string[] | null;
  notes: string | null;
  prospect: {
    id: string;
    contact_name: string;
    company_name: string;
    assigned_to_name: string | null;
  };
}

interface CompetitorDetailProps {
  competitor: Competitor;
  onClose: () => void;
  onEdit: () => void;
}

export function CompetitorDetail({ competitor, onClose, onEdit }: CompetitorDetailProps) {
  const [prospects, setProspects] = useState<ProspectRelationship[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProspects();
  }, [competitor.id]);

  async function loadProspects() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('prospect_competitor_relationships')
        .select(`
          *,
          prospect:contacts!prospect_id (
            id,
            contact_name,
            company_name,
            assigned_to_name
          )
        `)
        .eq('competitor_id', competitor.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setProspects(data as any || []);
    } catch (error) {
      console.error('Error loading prospects:', error);
    } finally {
      setLoading(false);
    }
  }

  function getRelationshipTypeBadge(type: string) {
    const styles = {
      current_supplier: 'bg-red-100 text-red-800',
      past_supplier: 'bg-gray-100 text-gray-800',
      alternate_supplier: 'bg-yellow-100 text-yellow-800',
      evaluating: 'bg-blue-100 text-blue-800',
    };

    const labels = {
      current_supplier: 'Current Supplier',
      past_supplier: 'Past Supplier',
      alternate_supplier: 'Alternate Supplier',
      evaluating: 'Evaluating',
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[type as keyof typeof styles] || 'bg-gray-100 text-gray-800'}`}>
        {labels[type as keyof typeof labels] || type}
      </span>
    );
  }

  function getStrengthIndicator(strength: string | null) {
    if (!strength) return null;

    const config = {
      weak: { color: 'bg-green-500', label: 'Weak' },
      moderate: { color: 'bg-yellow-500', label: 'Moderate' },
      strong: { color: 'bg-orange-500', label: 'Strong' },
      entrenched: { color: 'bg-red-500', label: 'Entrenched' },
    };

    const { color, label } = config[strength as keyof typeof config] || { color: 'bg-gray-500', label: strength };

    return (
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${color}`}></div>
        <span className="text-sm text-gray-600">{label}</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{competitor.name}</h2>
              {!competitor.is_active && (
                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-700 rounded mt-1">
                  Inactive
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Edit className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Competitor Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {competitor.address && (
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Address</p>
                  <p className="text-sm text-gray-600">{competitor.address}</p>
                </div>
              </div>
            )}

            {competitor.phone && (
              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Phone</p>
                  <a
                    href={`tel:${competitor.phone}`}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    {competitor.phone}
                  </a>
                </div>
              </div>
            )}

            {competitor.website && (
              <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Website</p>
                  <a
                    href={competitor.website.startsWith('http') ? competitor.website : `https://${competitor.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    {competitor.website}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          {competitor.notes && (
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700 mb-1">Notes</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{competitor.notes}</p>
                </div>
              </div>
            </div>
          )}

          {/* Prospects Using This Competitor */}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900">
                Prospects ({prospects.length})
              </h3>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-sm text-gray-600 mt-2">Loading prospects...</p>
              </div>
            ) : prospects.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">No prospects using this competitor yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {prospects.map((rel) => (
                  <div
                    key={rel.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <a
                          href={`#contact/${rel.prospect_id}`}
                          className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
                        >
                          {rel.prospect.contact_name}
                        </a>
                        {rel.prospect.company_name && (
                          <p className="text-sm text-gray-600 mt-0.5">{rel.prospect.company_name}</p>
                        )}
                      </div>
                      {getRelationshipTypeBadge(rel.relationship_type)}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      {rel.relationship_strength && getStrengthIndicator(rel.relationship_strength)}

                      {rel.estimated_annual_spend && (
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">
                            ${rel.estimated_annual_spend.toLocaleString()}/yr
                          </span>
                        </div>
                      )}

                      {rel.prospect.assigned_to_name && (
                        <span className="text-gray-500">
                          Assigned to: {rel.prospect.assigned_to_name}
                        </span>
                      )}
                    </div>

                    {rel.pain_points && rel.pain_points.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <p className="text-xs font-medium text-gray-700 mb-1">Pain Points:</p>
                        <div className="flex flex-wrap gap-1">
                          {rel.pain_points.map((point, idx) => (
                            <span
                              key={idx}
                              className="inline-block px-2 py-0.5 text-xs bg-red-50 text-red-700 rounded"
                            >
                              {point}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {rel.notes && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <p className="text-xs text-gray-600">{rel.notes}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
