import React, { useState, useMemo } from 'react';
import { X, Printer, Mail, Phone, Clock, Building2, CalendarClock, AlertCircle, MessageSquare, ChevronDown } from 'lucide-react';

interface ProspectRelationship {
  id: string;
  relationship_type: string;
  relationship_strength?: string;
  competitors: { id: string; name: string };
}

interface Prospect {
  id: string;
  company_name: string;
  contact_name: string;
  title?: string;
  email: string;
  phone: string;
  created_at: string;
  created_by: string;
  is_prospect: boolean;
  contact_type?: string;
  prospect_competitor_relationships?: ProspectRelationship[];
  last_connection?: { connection_date: string; connection_type: string };
  next_scheduled_connection?: { scheduled_date: string; connection_type: string };
  notes?: string;
}

interface SalesRep {
  id: string;
  full_name: string;
  role: string;
}

interface PrintProspectsViewProps {
  prospects: Prospect[];
  repName: string;
  viewMode: 'my' | 'all';
  onClose: () => void;
  salesReps?: SalesRep[];
  isAdminOrManager?: boolean;
}

export default function PrintProspectsView({
  prospects,
  repName,
  viewMode,
  onClose,
  salesReps = [],
  isAdminOrManager = false,
}: PrintProspectsViewProps) {
  const generatedAt = new Date().toLocaleString();
  const [selectedRepId, setSelectedRepId] = useState<string>('all');

  const displayedProspects = useMemo(() => {
    if (!isAdminOrManager || selectedRepId === 'all') return prospects;
    return prospects.filter(p => p.created_by === selectedRepId);
  }, [prospects, selectedRepId, isAdminOrManager]);

  const selectedRepName = useMemo(() => {
    if (selectedRepId === 'all') return viewMode === 'all' ? 'All Reps' : repName;
    return salesReps.find(r => r.id === selectedRepId)?.full_name || repName;
  }, [selectedRepId, salesReps, repName, viewMode]);

  const strengthLabel = (strength: string | undefined) => {
    if (!strength) return null;
    const map: Record<string, string> = {
      very_strong: 'Very Strong',
      strong: 'Strong',
      moderate: 'Moderate',
      weak: 'Weak',
      very_weak: 'Very Weak',
    };
    return map[strength] || strength.replace(/_/g, ' ');
  };

  const strengthColor = (strength: string | undefined) => {
    if (strength === 'very_strong' || strength === 'strong') return '#dc2626';
    if (strength === 'moderate') return '#d97706';
    return '#16a34a';
  };

  const typeLabel = (type: string) => {
    return type ? type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getDaysSince = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const diff = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return '1 day ago';
    return `${diff} days ago`;
  };

  const primaryName = (p: Prospect) =>
    p.contact_type === 'person'
      ? p.contact_name || p.company_name
      : p.company_name || p.contact_name;

  const secondaryName = (p: Prospect) =>
    p.contact_type === 'person'
      ? p.company_name
      : p.contact_name;

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #prospects-print-area, #prospects-print-area * { visibility: visible !important; }
          #prospects-print-area {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print { display: none !important; }
          @page { margin: 0.5in; size: letter; }
        }
      `}</style>

      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

          {/* Modal Header - no-print */}
          <div className="no-print flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-slate-700 to-slate-800 text-white rounded-t-xl flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold">Prospects Report</h2>
              <p className="text-sm text-slate-300">
                {displayedProspects.length} prospect{displayedProspects.length !== 1 ? 's' : ''} &mdash; {selectedRepName}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-800 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print / Save PDF
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Rep selector for admins/managers - no-print */}
          {isAdminOrManager && salesReps.length > 0 && (
            <div className="no-print px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Report for:</span>
              <div className="relative flex-1 max-w-xs">
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  value={selectedRepId}
                  onChange={e => setSelectedRepId(e.target.value)}
                  className="w-full appearance-none pl-3 pr-9 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                >
                  <option value="all">All Reps</option>
                  {salesReps.map(rep => (
                    <option key={rep.id} value={rep.id}>{rep.full_name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Scrollable print area */}
          <div className="overflow-y-auto flex-1" id="prospects-print-area">
            <div className="p-6">

              {/* Report Header */}
              <div className="mb-6 pb-4 border-b-2 border-gray-200">
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Prospects Report</h1>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-600">
                  <span><strong>Rep:</strong> {selectedRepName}</span>
                  <span><strong>View:</strong> {viewMode === 'my' ? 'My Pipeline' : 'All Pipeline'}</span>
                  <span><strong>Generated:</strong> {generatedAt}</span>
                  <span><strong>Total Prospects:</strong> {displayedProspects.length}</span>
                </div>
              </div>

              {displayedProspects.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="text-lg font-medium">No prospects to display</p>
                  <p className="text-sm mt-1">
                    {isAdminOrManager && selectedRepId !== 'all'
                      ? 'This rep has no prospects in the current view.'
                      : 'Adjust your filters and try again.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {displayedProspects.map((prospect, idx) => {
                    const currentSuppliers = prospect.prospect_competitor_relationships?.filter(
                      r => r.relationship_type === 'current_supplier'
                    ) || [];

                    return (
                      <div
                        key={prospect.id}
                        style={{ pageBreakInside: 'avoid' }}
                        className="border border-gray-200 rounded-lg p-4 bg-white"
                      >
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex-shrink-0 w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                              <span className="text-slate-700 text-sm font-bold">{idx + 1}</span>
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-bold text-gray-900 text-base leading-tight truncate">
                                {primaryName(prospect)}
                              </h3>
                              {secondaryName(prospect) && (
                                <p className="text-sm text-gray-600 truncate">{secondaryName(prospect)}</p>
                              )}
                              {prospect.title && (
                                <p className="text-xs text-gray-500 truncate">{prospect.title}</p>
                              )}
                            </div>
                          </div>
                          <span className="flex-shrink-0 px-2 py-0.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded">
                            Prospect
                          </span>
                        </div>

                        {/* Contact details */}
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm mb-3">
                          {prospect.email && (
                            <div className="flex items-center gap-1.5 text-gray-700 min-w-0">
                              <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="truncate">{prospect.email}</span>
                            </div>
                          )}
                          {prospect.phone && (
                            <div className="flex items-center gap-1.5 text-gray-700">
                              <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span>{prospect.phone}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span>Added {formatDate(prospect.created_at)}</span>
                          </div>
                        </div>

                        {/* Competitor / Current Supplier */}
                        {currentSuppliers.length > 0 && (
                          <div className="mb-2 p-2.5 bg-orange-50 border border-orange-200 rounded-lg">
                            <div className="flex items-start gap-2">
                              <Building2 className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-orange-900 mb-1">Current Supplier</p>
                                <div className="flex flex-wrap gap-2">
                                  {currentSuppliers.map(rel => (
                                    <div key={rel.id} className="flex items-center gap-1.5">
                                      <span className="text-sm font-medium text-orange-800">
                                        {rel.competitors?.name}
                                      </span>
                                      {rel.relationship_strength && (
                                        <span
                                          className="px-1.5 py-0.5 rounded text-xs font-medium text-white"
                                          style={{ backgroundColor: strengthColor(rel.relationship_strength) }}
                                        >
                                          {strengthLabel(rel.relationship_strength)}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Last Contact & Next Scheduled - side by side */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {prospect.last_connection ? (
                            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                              <div className="flex items-start gap-2">
                                <Clock className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <div>
                                  <p className="text-xs font-semibold text-blue-900 mb-0.5">Last Contact</p>
                                  <p className="text-sm text-blue-800">
                                    {getDaysSince(prospect.last_connection.connection_date)}
                                    <span className="text-blue-600 ml-1.5 text-xs">
                                      {typeLabel(prospect.last_connection.connection_type)}
                                    </span>
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                              <p className="text-xs font-semibold text-gray-500 mb-0.5">Last Contact</p>
                              <p className="text-sm text-gray-400 italic">No contact logged</p>
                            </div>
                          )}

                          {prospect.next_scheduled_connection ? (
                            <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg">
                              <div className="flex items-start gap-2">
                                <CalendarClock className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                <div>
                                  <p className="text-xs font-semibold text-green-900 mb-0.5">Next Scheduled</p>
                                  <p className="text-sm text-green-800">
                                    {formatDate(prospect.next_scheduled_connection.scheduled_date)}
                                    <span className="text-green-600 ml-1.5 text-xs">
                                      {typeLabel(prospect.next_scheduled_connection.connection_type)}
                                    </span>
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                              <p className="text-xs font-semibold text-gray-500 mb-0.5">Next Scheduled</p>
                              <p className="text-sm text-gray-400 italic">None scheduled</p>
                            </div>
                          )}
                        </div>

                        {prospect.notes && (
                          <div className="mt-2 pt-2 border-t border-gray-100 flex items-start gap-2 text-sm text-gray-600">
                            <MessageSquare className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                            <span>{prospect.notes}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer */}
              <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
                Prospects Report &mdash; {selectedRepName} &mdash; {generatedAt}
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
