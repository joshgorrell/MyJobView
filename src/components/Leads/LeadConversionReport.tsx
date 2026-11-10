import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type LeadRow = { id: string; created_at: string; lead_source: string | null; assigned_to: string | null };
type ProposalRow = { lead_id: string | null; status: string; created_at: string };

/** Read-only lead-to-proposal conversion snapshot. A proposal ends lead intake;
 * approved Sales Orders are a later milestone, not the initial conversion. */
export function LeadConversionReport() {
  const { profile } = useAuth();
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<{ source: string; leads: number; proposals: number; salesOrders: number }[]>([]);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (!profile?.organization_id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const { data: leads, error: leadsError } = await supabase.from('leads')
          .select('id,created_at,lead_source,assigned_to')
          .eq('organization_id', profile!.organization_id!)
          .gte('created_at', since).order('created_at', { ascending: false }).limit(1001);
        if (leadsError) throw leadsError;
        if ((leads || []).length > 1000) {
          if (!cancelled) { setTruncated(true); setRows([]); }
          return;
        }
        const sourceLeads = (leads || []) as LeadRow[];
        const ids = sourceLeads.map(lead => lead.id);
        const proposals: ProposalRow[] = [];
        for (let offset = 0; offset < ids.length; offset += 100) {
          const { data, error: proposalError } = await supabase.from('proposals')
            .select('lead_id,status,created_at').in('lead_id', ids.slice(offset, offset + 100));
          if (proposalError) throw proposalError;
          proposals.push(...(data || []));
        }
        const byLead = new Map<string, ProposalRow[]>();
        for (const proposal of proposals) {
          if (!proposal.lead_id) continue;
          byLead.set(proposal.lead_id, [...(byLead.get(proposal.lead_id) || []), proposal]);
        }
        const totals = new Map<string, { source: string; leads: number; proposals: number; salesOrders: number }>();
        for (const lead of sourceLeads) {
          const source = lead.lead_source || 'Unknown';
          const entry = totals.get(source) || { source, leads: 0, proposals: 0, salesOrders: 0 };
          entry.leads++;
          const linked = byLead.get(lead.id) || [];
          if (linked.length) entry.proposals++;
          // Approved proposals are Sales Orders. Confirm approval-status taxonomy before enabling this metric.
          if (linked.some(proposal => ['approved', 'accepted'].includes(proposal.status))) entry.salesOrders++;
          totals.set(source, entry);
        }
        if (!cancelled) { setTruncated(false); setRows([...totals.values()].sort((a,b) => b.leads-a.leads)); }
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'Unable to load report'); setRows([]); }
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [days, profile?.organization_id]);

  return <section className="p-4 sm:p-6 space-y-4">
    <div className="flex flex-wrap justify-between gap-3 items-center"><div><h3 className="font-semibold text-gray-800">Lead Conversion by Source</h3><p className="text-xs text-gray-500">Cohort: leads created in the selected period. A linked proposal counts as conversion.</p></div>
      <label className="text-sm">Period <select className="border rounded p-1 ml-2" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>365 days</option></select></label></div>
    {loading ? <p>Loading…</p> : error ? <p role="alert" className="text-red-700">{error}</p> : truncated ? <p role="alert">More than 1,000 leads match. Narrow the period to see a complete report.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Source</th><th className="p-2">Leads</th><th className="p-2">With proposal</th><th className="p-2">Conversion</th></tr></thead><tbody>{rows.map(row=><tr key={row.source} className="border-b"><td className="p-2">{row.source}</td><td className="p-2">{row.leads}</td><td className="p-2">{row.proposals}</td><td className="p-2">{row.leads ? (row.proposals / row.leads * 100).toFixed(1) : '0'}%</td></tr>)}</tbody></table>{rows.length===0 && <p className="p-4 text-gray-500">No leads in this period.</p>}</div>}
    <p className="text-xs text-gray-500">Proposal conversion is available now. Sales Order conversion and revenue attribution will follow after approval-state and invoice mapping are verified.</p>
  </section>;
}
