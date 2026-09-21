import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, AlertTriangle, Circle, Map, Shield, Clock, TrendingUp, ArrowRight } from 'lucide-react';

interface StateIndexRow {
  state_code: string;
  state_name: string;
  library_status: 'verified' | 'needs_review' | 'not_researched';
}

interface NexusRow {
  state: string;
  nexus_status: string;
}

export default function SalesTaxOverview({ onNavigate }: { onNavigate: (tab: 'overview' | 'states' | 'exemptions' | 'history') => void }) {
  const [states, setStates] = useState<StateIndexRow[]>([]);
  const [nexusStates, setNexusStates] = useState<NexusRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [statesRes, nexusRes] = await Promise.all([
        supabase.from('state_library_index').select('state_code, state_name, library_status').order('state_code'),
        supabase.from('dealer_nexus_states').select('state, nexus_status').eq('is_current', true),
      ]);

      if (statesRes.error) throw statesRes.error;
      if (nexusRes.error) throw nexusRes.error;

      setStates(statesRes.data || []);
      setNexusStates(nexusRes.data || []);
    } catch (error) {
      console.error('Error loading overview data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const verified = states.filter(s => s.library_status === 'verified');
  const needsReview = states.filter(s => s.library_status === 'needs_review');
  const notResearched = states.filter(s => s.library_status === 'not_researched');
  const collecting = nexusStates.filter(n => n.nexus_status === 'yes');

  const stats = [
    {
      label: 'Verified States',
      value: verified.length,
      icon: CheckCircle,
      color: 'green',
      description: 'MJV rules published and reviewed',
    },
    {
      label: 'Needs Review',
      value: needsReview.length,
      icon: AlertTriangle,
      color: 'amber',
      description: 'Rules exist but require review',
    },
    {
      label: 'Not Researched',
      value: notResearched.length,
      icon: Circle,
      color: 'gray',
      description: 'MJV has not yet published rules',
    },
    {
      label: 'Collecting States',
      value: collecting.length,
      icon: Map,
      color: 'blue',
      description: 'States where you collect sales tax',
    },
  ];

  const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
    green: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    gray: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const c = colorClasses[stat.color];
          return (
            <div key={stat.label} className={`rounded-lg border ${c.border} ${c.bg} p-5`}>
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-5 h-5 ${c.text}`} />
                <span className={`text-3xl font-bold ${c.text}`}>{stat.value}</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">{stat.label}</p>
              <p className="text-xs text-gray-500 mt-1">{stat.description}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Map className="w-5 h-5 text-blue-600" />
              State Library Status
            </h3>
            <button
              onClick={() => onNavigate('states')}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-3">
            {verified.length > 0 && (
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm text-gray-700">
                  <strong>{verified.length}</strong> verified: {verified.map(s => s.state_code).join(', ')}
                </span>
              </div>
            )}
            {needsReview.length > 0 && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-gray-700">
                  <strong>{needsReview.length}</strong> needs review: {needsReview.map(s => s.state_code).join(', ')}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Circle className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-700">
                <strong>{notResearched.length}</strong> not yet researched
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-600" />
              Collection Status
            </h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-gray-700">
                Collecting in <strong>{collecting.length}</strong> state{collecting.length !== 1 ? 's' : ''}
              </span>
            </div>
            {collecting.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {collecting.map(n => (
                  <span key={n.state} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    {n.state}
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500">
              Configure which states you collect in from the States tab.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-blue-600" />
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => onNavigate('states')}
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
          >
            <Map className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-gray-900">Browse States</p>
              <p className="text-xs text-gray-500">View all 50 states and their status</p>
            </div>
          </button>
          <button
            onClick={() => onNavigate('exemptions')}
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
          >
            <Shield className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-sm font-medium text-gray-900">Manage Exemptions</p>
              <p className="text-xs text-gray-500">Upload and review certificates</p>
            </div>
          </button>
          <button
            onClick={() => onNavigate('history')}
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
          >
            <History className="w-5 h-5 text-gray-600" />
            <div>
              <p className="text-sm font-medium text-gray-900">Tax History</p>
              <p className="text-xs text-gray-500">Review recent tax calculations</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
