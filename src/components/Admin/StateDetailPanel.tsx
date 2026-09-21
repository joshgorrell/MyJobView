import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ArrowLeft, BookOpen, Settings, CheckCircle, AlertTriangle, Circle,
  Plus, RotateCcw, Save, X, Info, Layers,
} from 'lucide-react';

interface Props {
  stateCode: string;
  stateName: string;
  libraryStatus: 'verified' | 'needs_review' | 'not_researched';
  nexusStatus?: string;
  onBack: () => void;
}

interface MasterRule {
  id: string;
  classification_code: string;
  classification_label: string;
  qualifier_environment: string | null;
  qualifier_project_type: string | null;
  taxability_status: string;
  explanation: string | null;
}

interface DealerRule {
  id: string;
  classification_code: string;
  classification_label: string;
  environment: string | null;
  project_type: string | null;
  taxability_status: string;
  explanation: string | null;
  is_active: boolean;
}

interface Classification {
  id: string;
  code: string;
  label: string;
}

const ENVIRONMENTS = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'both', label: 'Both' },
];

const PROJECT_TYPES = [
  { value: 'original_construction', label: 'Original Construction' },
  { value: 'remodel', label: 'Remodel / Renovation' },
  { value: 'general_installation_repair', label: 'General Repair / Service' },
  { value: 'maintenance_agreement', label: 'Maintenance Agreement' },
  { value: 'retail', label: 'Retail Sale' },
  { value: 'design_service', label: 'Design Service' },
  { value: 'security_monitoring', label: 'Security Monitoring' },
  { value: 'membership', label: 'Membership' },
  { value: 'exempt_project', label: 'Exempt Project' },
];

const TAXABILITY_STATUSES = [
  { value: 'taxable', label: 'Taxable' },
  { value: 'non_taxable', label: 'Non-Taxable' },
  { value: 'needs_review', label: 'Needs Review' },
];

const SCOPE_OPTIONS = [
  { value: 'classification', label: 'Classification Only' },
  { value: 'env_classification', label: 'Environment + Classification' },
  { value: 'proj_classification', label: 'Project Type + Classification' },
  { value: 'env_proj_classification', label: 'Environment + Project Type + Classification' },
];

function normalizeEnv(env: string | null): string | null {
  if (!env || env === 'both') return null;
  return env;
}

function isSemanticallyMatching(master: MasterRule[], dealer: DealerRule): boolean {
  const match = master.find(m => {
    if (m.classification_code !== dealer.classification_code) return false;
    if (normalizeEnv(m.qualifier_environment) !== normalizeEnv(dealer.environment)) return false;
    if (m.qualifier_project_type !== dealer.project_type) return false;
    return m.taxability_status === dealer.taxability_status;
  });
  return !!match;
}

export default function StateDetailPanel({ stateCode, stateName, libraryStatus, nexusStatus, onBack }: Props) {
  const [masterRules, setMasterRules] = useState<MasterRule[]>([]);
  const [dealerRules, setDealerRules] = useState<DealerRule[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, [stateCode]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [masterRes, dealerRes, classRes] = await Promise.all([
        supabase
          .from('master_state_tax_rules')
          .select(`
            id,
            qualifier_environment,
            qualifier_project_type,
            taxability_status,
            explanation,
            classification_id,
            master_classifications!inner (code, label)
          `)
          .eq('state', stateCode)
          .eq('is_active', true)
          .order('master_classifications.sort_order'),
        supabase
          .from('state_tax_rules_matrix')
          .select(`
            id,
            environment,
            project_type,
            taxability_status,
            explanation,
            is_active,
            tax_classification_id,
            tax_classifications!inner (code, label)
          `)
          .eq('state', stateCode)
          .order('tax_classifications.sort_order'),
        supabase
          .from('master_classifications')
          .select('id, code, label, sort_order')
          .order('sort_order'),
      ]);

      if (masterRes.error) throw masterRes.error;
      if (dealerRes.error) throw dealerRes.error;
      if (classRes.error) throw classRes.error;

      const masterData: MasterRule[] = (masterRes.data || []).map((r: any) => ({
        id: r.id,
        classification_code: r.master_classifications?.code || '',
        classification_label: r.master_classifications?.label || '',
        qualifier_environment: r.qualifier_environment,
        qualifier_project_type: r.qualifier_project_type,
        taxability_status: r.taxability_status,
        explanation: r.explanation,
      }));

      const dealerData: DealerRule[] = (dealerRes.data || []).map((r: any) => ({
        id: r.id,
        classification_code: r.tax_classifications?.code || '',
        classification_label: r.tax_classifications?.label || '',
        environment: r.environment,
        project_type: r.project_type,
        taxability_status: r.taxability_status,
        explanation: r.explanation,
        is_active: r.is_active,
      }));

      setMasterRules(masterData);
      setDealerRules(dealerData);
      setClassifications(classRes.data || []);
    } catch (error) {
      console.error('Error loading state detail:', error);
    } finally {
      setLoading(false);
    }
  }, [stateCode]);

  const activeDealerRules = dealerRules.filter(r => r.is_active);
  const genuineOverrides = activeDealerRules.filter(r => {
    if (masterRules.length === 0) return true;
    return !isSemanticallyMatching(masterRules, r);
  });
  const legacyMatching = activeDealerRules.filter(r => {
    if (masterRules.length === 0) return false;
    return isSemanticallyMatching(masterRules, r);
  });

  const usedEnvs = new Set<string>();
  const usedProjTypes = new Set<string>();
  [...masterRules, ...activeDealerRules].forEach(r => {
    const env = 'qualifier_environment' in r ? r.qualifier_environment : r.environment;
    const pt = 'qualifier_project_type' in r ? r.qualifier_project_type : r.project_type;
    if (env && env !== 'both') usedEnvs.add(env);
    if (pt) usedProjTypes.add(pt);
  });
  const showEnvDimension = usedEnvs.size > 0;
  const showProjDimension = usedProjTypes.size > 0;

  async function handleReset(ruleId: string) {
    setResettingId(ruleId);
    try {
      const { error } = await supabase
        .from('state_tax_rules_matrix')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', ruleId);
      if (error) throw error;
      await loadAll();
    } catch (error) {
      console.error('Error resetting dealer rule:', error);
      alert('Failed to reset override.');
    } finally {
      setResettingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to States
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-12 h-8 rounded text-sm font-bold bg-gray-100 text-gray-700">
              {stateCode}
            </span>
            {stateName}
          </h2>
          <div className="flex items-center gap-3 mt-2">
            <LibraryBadge status={libraryStatus} />
            <CollectionBadge status={nexusStatus} />
          </div>
        </div>
      </div>

      {/* MJV Rule Library Section */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="p-5 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            MJV Rule Library
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Master tax rules published and maintained by MJV
          </p>
        </div>
        <div className="p-5">
          {libraryStatus === 'not_researched' ? (
            <div className="flex items-center gap-3 text-gray-500 py-4">
              <Circle className="w-5 h-5 text-gray-400" />
              <div>
                <p className="font-medium text-gray-700">Not Researched</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  MJV has not yet published tax rules for {stateName}. No master rules are available.
                  You can still configure dealer-specific overrides below based on your tax professional's guidance.
                </p>
              </div>
            </div>
          ) : masterRules.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No master rules found for this state.</p>
          ) : (
            <RuleTable
              rules={masterRules.map(r => ({
                classification: r.classification_label,
                environment: r.qualifier_environment,
                projectType: r.qualifier_project_type,
                taxability: r.taxability_status,
                explanation: r.explanation,
              }))}
              showEnv={showEnvDimension}
              showProj={showProjDimension}
            />
          )}
          {libraryStatus === 'needs_review' && masterRules.length > 0 && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                These rules exist but have not been fully reviewed. Verify with your tax advisor before relying on them.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Dealer Setting / Override Section */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-600" />
              Dealer Settings
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Organization-specific overrides. A true override differs from the MJV default or covers a case where no MJV rule exists.
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showAddForm ? 'Cancel' : 'Add Override'}
          </button>
        </div>
        <div className="p-5 space-y-4">
          {showAddForm && (
            <AddOverrideForm
              classifications={classifications}
              showEnv={showEnvDimension || libraryStatus === 'not_researched'}
              showProj={showProjDimension || libraryStatus === 'not_researched'}
              allowScopeSelect={libraryStatus === 'not_researched' && activeDealerRules.length === 0}
              onSubmit={async (data) => {
                setSaving(true);
                try {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) throw new Error('Not authenticated');
                  const { data: profileData } = await supabase
                    .from('profiles')
                    .select('organization_id')
                    .eq('id', user.id)
                    .maybeSingle();

                  const classId = classifications.find(c => c.code === data.classification)?.id;
                  if (!classId) throw new Error('Invalid classification');

                  const { error } = await supabase.from('state_tax_rules_matrix').insert({
                    state: stateCode,
                    tax_classification_id: classId,
                    environment: data.environment || 'both',
                    project_type: data.projectType || null,
                    taxability_status: data.taxability,
                    explanation: data.explanation || null,
                    is_active: true,
                    organization_id: profileData?.organization_id,
                  });
                  if (error) throw error;
                  setShowAddForm(false);
                  await loadAll();
                } catch (error) {
                  console.error('Error saving override:', error);
                  alert('Failed to save override.');
                } finally {
                  setSaving(false);
                }
              }}
              saving={saving}
            />
          )}

          {genuineOverrides.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Active Overrides ({genuineOverrides.length})</p>
              <RuleTable
                rules={genuineOverrides.map(r => ({
                  id: r.id,
                  classification: r.classification_label,
                  environment: r.environment,
                  projectType: r.project_type,
                  taxability: r.taxability_status,
                  explanation: r.explanation,
                }))}
                showEnv={showEnvDimension}
                showProj={showProjDimension}
                onReset={handleReset}
                resettingId={resettingId}
              />
            </div>
          )}

          {legacyMatching.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-600">
                Legacy matching dealer records exist ({legacyMatching.length}). These match the MJV default and are not shown as overrides.
                They can be safely normalized in a future cleanup.
              </p>
            </div>
          )}

          {genuineOverrides.length === 0 && legacyMatching.length === 0 && (
            <div className="flex items-center gap-3 text-gray-500 py-4">
              <Settings className="w-5 h-5 text-gray-400" />
              <p className="text-sm">
                No dealer overrides configured. This organization uses the MJV master rules
                {libraryStatus === 'not_researched' ? ' or no rules (not researched).' : '.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LibraryBadge({ status }: { status: string }) {
  switch (status) {
    case 'verified':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3" /> Verified
        </span>
      );
    case 'needs_review':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
          <AlertTriangle className="w-3 h-3" /> Needs Review
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
          <Circle className="w-3 h-3" /> Not Researched
        </span>
      );
  }
}

function CollectionBadge({ status }: { status?: string }) {
  if (!status) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        Not Configured
      </span>
    );
  }
  if (status === 'yes') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        Collecting
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      Not Collecting
    </span>
  );
}

function TaxabilityBadge({ status }: { status: string }) {
  switch (status) {
    case 'taxable':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Taxable</span>;
    case 'non_taxable':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Non-Taxable</span>;
    case 'needs_review':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Needs Review</span>;
    default:
      return <span className="text-xs text-gray-500">{status}</span>;
  }
}

interface RuleRowData {
  id?: string;
  classification: string;
  environment?: string | null;
  projectType?: string | null;
  taxability: string;
  explanation?: string | null;
}

function RuleTable({
  rules,
  showEnv,
  showProj,
  onReset,
  resettingId,
}: {
  rules: RuleRowData[];
  showEnv: boolean;
  showProj: boolean;
  onReset?: (id: string) => void;
  resettingId?: string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Classification</th>
            {showEnv && <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Environment</th>}
            {showProj && <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Project Type</th>}
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Taxability</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Explanation</th>
            {onReset && <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase"></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rules.map((r, i) => (
            <tr key={r.id || i} className="hover:bg-gray-50">
              <td className="px-4 py-2 text-sm text-gray-900">{r.classification}</td>
              {showEnv && (
                <td className="px-4 py-2 text-sm text-gray-600 capitalize">
                  {r.environment || 'All'}
                </td>
              )}
              {showProj && (
                <td className="px-4 py-2 text-sm text-gray-600">
                  {r.projectType ? r.projectType.replace(/_/g, ' ') : 'All'}
                </td>
              )}
              <td className="px-4 py-2"><TaxabilityBadge status={r.taxability} /></td>
              <td className="px-4 py-2 text-xs text-gray-500 max-w-xs">{r.explanation || '-'}</td>
              {onReset && r.id && (
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => onReset(r.id!)}
                    disabled={resettingId === r.id}
                    className="text-gray-500 hover:text-red-600 disabled:opacity-50 transition-colors"
                    title="Reset to MJV Default"
                  >
                    {resettingId === r.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600 mx-auto" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddOverrideForm({
  classifications,
  showEnv,
  showProj,
  allowScopeSelect,
  onSubmit,
  saving,
}: {
  classifications: Classification[];
  showEnv: boolean;
  showProj: boolean;
  allowScopeSelect: boolean;
  onSubmit: (data: { classification: string; environment: string; projectType: string; taxability: string; explanation: string }) => void;
  saving: boolean;
}) {
  const [scope, setScope] = useState('classification');
  const [classification, setClassification] = useState('');
  const [environment, setEnvironment] = useState('both');
  const [projectType, setProjectType] = useState('');
  const [taxability, setTaxability] = useState('taxable');
  const [explanation, setExplanation] = useState('');

  const showEnvField = allowScopeSelect
    ? scope === 'env_classification' || scope === 'env_proj_classification'
    : showEnv;
  const showProjField = allowScopeSelect
    ? scope === 'proj_classification' || scope === 'env_proj_classification'
    : showProj;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!classification) {
      alert('Please select a classification.');
      return;
    }
    onSubmit({ classification, environment, projectType, taxability, explanation });
  }

  return (
    <form onSubmit={handleSubmit} className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
      {allowScopeSelect && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" />
            Rule Scope
          </label>
          <select
            value={scope}
            onChange={e => setScope(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
          >
            {SCOPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Choose the scope that matches your tax professional's guidance for this state.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Classification *</label>
          <select
            value={classification}
            onChange={e => setClassification(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="">Select...</option>
            {classifications.map(c => <option key={c.id} value={c.code}>{c.label}</option>)}
          </select>
        </div>

        {showEnvField && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Environment</label>
            <select
              value={environment}
              onChange={e => setEnvironment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            >
              {ENVIRONMENTS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
        )}

        {showProjField && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Type</label>
            <select
              value={projectType}
              onChange={e => setProjectType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">All Project Types</option>
              {PROJECT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Taxability *</label>
          <select
            value={taxability}
            onChange={e => setTaxability(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
          >
            {TAXABILITY_STATUSES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Explanation</label>
        <input
          type="text"
          value={explanation}
          onChange={e => setExplanation(e.target.value)}
          placeholder="Reason for this override (e.g., per accountant guidance)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {saving ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Save className="w-4 h-4" />}
          Save Override
        </button>
      </div>
    </form>
  );
}
