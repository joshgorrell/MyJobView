import React, { useState, useMemo } from 'react';
import { X, Printer, User, Mail, Phone, Clock, AlertCircle, Tag, Calendar, ChevronDown } from 'lucide-react';

interface Lead {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  status: string;
  priority: string;
  estimated_value: string;
  created_at: string;
  last_contact_date: string;
  assigned_to: string;
  assigned_to_name?: string;
  is_fishbowl: boolean;
  notes?: string;
  lead_source?: string;
  assigned_rep?: { id: string; full_name: string };
  opportunity_description?: string;
}

interface SalesRep {
  id: string;
  full_name: string;
  role: string;
}

interface PrintLeadsViewProps {
  leads: Lead[];
  repName: string;
  viewMode: 'my' | 'all';
  onClose: () => void;
  salesReps?: SalesRep[];
  isAdminOrManager?: boolean;
}

export default function PrintLeadsView({
  leads,
  repName,
  viewMode,
  onClose,
  salesReps = [],
  isAdminOrManager = false,
}: PrintLeadsViewProps) {
  const generatedAt = new Date().toLocaleString();
  const [selectedRepId, setSelectedRepId] = useState<string>('all');

  const displayedLeads = useMemo(() => {
    if (!isAdminOrManager || selectedRepId === 'all') return leads;
    return leads.filter(l => l.assigned_to === selectedRepId || l.assigned_rep?.id === selectedRepId);
  }, [leads, selectedRepId, isAdminOrManager]);

  const selectedRepName = useMemo(() => {
    if (selectedRepId === 'all') return viewMode === 'all' ? 'All Reps' : repName;
    return salesReps.find(r => r.id === selectedRepId)?.full_name || repName;
  }, [selectedRepId, salesReps, repName, viewMode]);

  const getDaysOpen = (createdAt: string) => {
    const date = new Date(createdAt);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - date.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const priorityLabel = (priority: string) => {
    const map: Record<string, string> = {
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    };
    return map[priority] || priority || '—';
  };

  const priorityColor = (priority: string) => {
    if (priority === 'critical') return '#dc2626';
    if (priority === 'high') return '#ea580c';
    if (priority === 'medium') return '#ca8a04';
    return '#6b7280';
  };

  const statusLabel = (status: string) => {
    return status ? status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—';
  };

  const sourceLabel = (source: string) => {
    if (!source) return '—';
    return source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #leads-print-area, #leads-print-area * { visibility: visible !important; }
          #leads-print-area {
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
          <div className="no-print flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-green-700 to-green-800 text-white rounded-t-xl flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold">Leads Report</h2>
              <p className="text-sm text-green-100">
                {displayedLeads.length} lead{displayedLeads.length !== 1 ? 's' : ''} &mdash; {selectedRepName}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 bg-white text-green-800 rounded-lg text-sm font-semibold hover:bg-green-50 transition-colors"
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
                  className="w-full appearance-none pl-3 pr-9 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
          <div className="overflow-y-auto flex-1" id="leads-print-area">
            <div className="p-6">

              {/* Report Header */}
              <div className="mb-6 pb-4 border-b-2 border-gray-200">
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Leads Report</h1>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-600">
                  <span><strong>Rep:</strong> {selectedRepName}</span>
                  <span><strong>View:</strong> {viewMode === 'my' ? 'My Pipeline' : 'All Pipeline'}</span>
                  <span><strong>Generated:</strong> {generatedAt}</span>
                  <span><strong>Total Leads:</strong> {displayedLeads.length}</span>
                </div>
              </div>

              {displayedLeads.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="text-lg font-medium">No leads to display</p>
                  <p className="text-sm mt-1">
                    {isAdminOrManager && selectedRepId !== 'all'
                      ? 'This rep has no leads in the current view.'
                      : 'Adjust your filters and try again.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {displayedLeads.map((lead, idx) => {
                    const daysOpen = getDaysOpen(lead.created_at);
                    const assignedName = lead.assigned_rep?.full_name || lead.assigned_to_name || null;

                    return (
                      <div
                        key={lead.id}
                        style={{ pageBreakInside: 'avoid' }}
                        className="border border-gray-200 rounded-lg p-4 bg-white"
                      >
                        {/* Lead row header */}
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                              <span className="text-green-800 text-sm font-bold">{idx + 1}</span>
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-bold text-gray-900 text-base leading-tight truncate">
                                {lead.contact_name || '—'}
                              </h3>
                              {lead.company_name && lead.company_name.toLowerCase() !== 'unknown' && (
                                <p className="text-sm text-gray-600 truncate">{lead.company_name}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span
                              className="px-2 py-0.5 rounded text-xs font-bold text-white"
                              style={{ backgroundColor: priorityColor(lead.priority) }}
                            >
                              {priorityLabel(lead.priority)}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-medium">
                              {statusLabel(lead.status)}
                            </span>
                          </div>
                        </div>

                        {/* Info grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
                          {lead.email && (
                            <div className="flex items-center gap-1.5 text-gray-700 min-w-0">
                              <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="truncate">{lead.email}</span>
                            </div>
                          )}
                          {lead.phone && (
                            <div className="flex items-center gap-1.5 text-gray-700">
                              <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span>{lead.phone}</span>
                            </div>
                          )}
                          {assignedName && (
                            <div className="flex items-center gap-1.5 text-gray-700 min-w-0">
                              <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="truncate">{assignedName}</span>
                            </div>
                          )}
                          {lead.lead_source && (
                            <div className="flex items-center gap-1.5 text-gray-700">
                              <Tag className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span>{sourceLabel(lead.lead_source)}</span>
                            </div>
                          )}
                          {lead.last_contact_date && (
                            <div className="flex items-center gap-1.5 text-gray-700">
                              <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span>Last contact: {new Date(lead.last_contact_date).toLocaleDateString()}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 text-gray-700">
                            <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span>{daysOpen} day{daysOpen !== 1 ? 's' : ''} open</span>
                          </div>
                        </div>

                        {lead.opportunity_description && (
                          <div className="mt-2 pt-2 border-t border-gray-100 text-sm text-gray-600">
                            <span className="font-medium text-gray-700">Opportunity: </span>
                            {lead.opportunity_description}
                          </div>
                        )}
                        {lead.notes && (
                          <div className="mt-1.5 text-sm text-gray-600">
                            <span className="font-medium text-gray-700">Notes: </span>
                            {lead.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer */}
              <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
                Leads Report &mdash; {selectedRepName} &mdash; {generatedAt}
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
