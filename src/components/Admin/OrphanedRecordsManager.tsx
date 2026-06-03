import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { UserPlus, AlertCircle, Search, ChevronDown, ChevronRight } from 'lucide-react';

interface OrphanedRecord {
  id: string;
  type: string;
  title: string;
  description: string;
  original_user_name: string | null;
  field_name: string;
  created_at: string;
}

interface OrphanedRecordGroup {
  type: string;
  count: number;
  records: OrphanedRecord[];
  expanded: boolean;
}

export default function OrphanedRecordsManager() {
  const [groups, setGroups] = useState<OrphanedRecordGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeUsers, setActiveUsers] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [reassigning, setReassigning] = useState(false);

  useEffect(() => {
    loadOrphanedRecords();
    loadActiveUsers();
  }, []);

  const loadActiveUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name');

    if (data) {
      setActiveUsers(data);
    }
  };

  const loadOrphanedRecords = async () => {
    setLoading(true);
    const allRecords: OrphanedRecord[] = [];

    // Work Orders - assigned_to
    const { data: workOrders } = await supabase
      .from('work_orders')
      .select('id, work_order_number, title, assigned_to_name, created_at')
      .is('assigned_to', null)
      .order('created_at', { ascending: false });

    if (workOrders) {
      workOrders.forEach(wo => {
        allRecords.push({
          id: `work_orders_assigned_${wo.id}`,
          type: 'Work Orders (Unassigned)',
          title: `${wo.work_order_number} - ${wo.title}`,
          description: 'No technician assigned',
          original_user_name: wo.assigned_to_name,
          field_name: 'assigned_to',
          created_at: wo.created_at
        });
      });
    }

    // Work Orders - created_by
    const { data: workOrdersCreated } = await supabase
      .from('work_orders')
      .select('id, work_order_number, title, created_by_name, created_at')
      .is('created_by', null)
      .order('created_at', { ascending: false });

    if (workOrdersCreated) {
      workOrdersCreated.forEach(wo => {
        allRecords.push({
          id: `work_orders_created_${wo.id}`,
          type: 'Work Orders (No Creator)',
          title: `${wo.work_order_number} - ${wo.title}`,
          description: 'Creator deleted',
          original_user_name: wo.created_by_name,
          field_name: 'created_by',
          created_at: wo.created_at
        });
      });
    }

    // Proposals
    const { data: proposals } = await supabase
      .from('proposals')
      .select('id, proposal_number, title, created_by_name, created_at')
      .is('created_by', null)
      .order('created_at', { ascending: false });

    if (proposals) {
      proposals.forEach(p => {
        allRecords.push({
          id: `proposals_${p.id}`,
          type: 'Proposals',
          title: `${p.proposal_number}${p.title ? ' - ' + p.title : ''}`,
          description: 'Creator deleted',
          original_user_name: p.created_by_name,
          field_name: 'created_by',
          created_at: p.created_at
        });
      });
    }

    // Tasks
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, assigned_to_name, created_at')
      .is('user_id', null)
      .is('assigned_to', null)
      .order('created_at', { ascending: false });

    if (tasks) {
      tasks.forEach(t => {
        allRecords.push({
          id: `tasks_${t.id}`,
          type: 'Tasks',
          title: t.title,
          description: 'No assignee',
          original_user_name: t.assigned_to_name,
          field_name: 'assigned_to',
          created_at: t.created_at
        });
      });
    }

    // Leads - assigned
    const { data: leadsAssigned } = await supabase
      .from('leads')
      .select('id, company_name, assigned_to_name, created_at')
      .is('assigned_to', null)
      .order('created_at', { ascending: false });

    if (leadsAssigned) {
      leadsAssigned.forEach(l => {
        allRecords.push({
          id: `leads_assigned_${l.id}`,
          type: 'Leads (Unassigned)',
          title: l.company_name || 'Unnamed Lead',
          description: 'No sales rep assigned',
          original_user_name: l.assigned_to_name,
          field_name: 'assigned_to',
          created_at: l.created_at
        });
      });
    }

    // Leads - created
    const { data: leadsCreated } = await supabase
      .from('leads')
      .select('id, company_name, created_by_name, created_at')
      .is('created_by', null)
      .order('created_at', { ascending: false });

    if (leadsCreated) {
      leadsCreated.forEach(l => {
        allRecords.push({
          id: `leads_created_${l.id}`,
          type: 'Leads (No Creator)',
          title: l.company_name || 'Unnamed Lead',
          description: 'Creator deleted',
          original_user_name: l.created_by_name,
          field_name: 'created_by',
          created_at: l.created_at
        });
      });
    }

    // Contacts
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, full_name, assigned_to_name, created_at')
      .is('assigned_to', null)
      .order('created_at', { ascending: false });

    if (contacts) {
      contacts.forEach(c => {
        allRecords.push({
          id: `contacts_${c.id}`,
          type: 'Contacts',
          title: c.full_name || 'Unnamed Contact',
          description: 'No owner assigned',
          original_user_name: c.assigned_to_name,
          field_name: 'assigned_to',
          created_at: c.created_at
        });
      });
    }

    // Projects
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, created_by_name, created_at')
      .is('created_by', null)
      .order('created_at', { ascending: false });

    if (projects) {
      projects.forEach(p => {
        allRecords.push({
          id: `projects_${p.id}`,
          type: 'Projects',
          title: p.name,
          description: 'Creator deleted',
          original_user_name: p.created_by_name,
          field_name: 'created_by',
          created_at: p.created_at
        });
      });
    }

    // Invoices
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, created_by_name, created_at')
      .is('created_by', null)
      .order('created_at', { ascending: false });

    if (invoices) {
      invoices.forEach(i => {
        allRecords.push({
          id: `invoices_${i.id}`,
          type: 'Invoices',
          title: i.invoice_number,
          description: 'Creator deleted',
          original_user_name: i.created_by_name,
          field_name: 'created_by',
          created_at: i.created_at
        });
      });
    }

    // Group by type
    const groupedRecords = allRecords.reduce((acc, record) => {
      const existing = acc.find(g => g.type === record.type);
      if (existing) {
        existing.records.push(record);
        existing.count++;
      } else {
        acc.push({
          type: record.type,
          count: 1,
          records: [record],
          expanded: false
        });
      }
      return acc;
    }, [] as OrphanedRecordGroup[]);

    setGroups(groupedRecords);
    setLoading(false);
  };

  const toggleGroup = (type: string) => {
    setGroups(groups.map(g =>
      g.type === type ? { ...g, expanded: !g.expanded } : g
    ));
  };

  const toggleRecord = (recordId: string) => {
    const newSelected = new Set(selectedRecords);
    if (newSelected.has(recordId)) {
      newSelected.delete(recordId);
    } else {
      newSelected.add(recordId);
    }
    setSelectedRecords(newSelected);
  };

  const selectAllInGroup = (group: OrphanedRecordGroup) => {
    const newSelected = new Set(selectedRecords);
    group.records.forEach(r => newSelected.add(r.id));
    setSelectedRecords(newSelected);
  };

  const handleReassign = async () => {
    if (!selectedUser || selectedRecords.size === 0) return;

    setReassigning(true);

    try {
      // Group selected records by table and field
      const updates: Record<string, { table: string; field: string; ids: string[] }> = {};

      selectedRecords.forEach(recordId => {
        const [table, field, id] = recordId.split('_');
        const key = `${table}_${field}`;

        if (!updates[key]) {
          updates[key] = { table, field, ids: [] };
        }
        updates[key].ids.push(id);
      });

      // Execute updates
      for (const [_, update] of Object.entries(updates)) {
        await supabase
          .from(update.table)
          .update({ [update.field]: selectedUser })
          .in('id', update.ids);
      }

      // Refresh data
      await loadOrphanedRecords();
      setSelectedRecords(new Set());
      setSelectedUser('');
    } catch (error) {
      console.error('Error reassigning records:', error);
      alert('Error reassigning records. Please try again.');
    } finally {
      setReassigning(false);
    }
  };

  const totalOrphaned = groups.reduce((sum, g) => sum + g.count, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading orphaned records...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle className="h-6 w-6 text-orange-500" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Orphaned Records Manager</h2>
            <p className="text-sm text-gray-600 mt-1">
              Records with no assigned user (typically from deleted or deactivated users)
            </p>
          </div>
        </div>

        {totalOrphaned === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium">No orphaned records found</p>
            <p className="text-sm mt-1">All records have valid user assignments</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-700">Total orphaned records:</span>
            <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded font-semibold">
              {totalOrphaned}
            </span>
          </div>
        )}
      </div>

      {/* Reassignment Controls */}
      {totalOrphaned > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Bulk Reassignment</h3>

          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assign to User
              </label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a user...</option>
                {activeUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.full_name} ({user.email})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleReassign}
              disabled={!selectedUser || selectedRecords.size === 0 || reassigning}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <UserPlus className="h-4 w-4" />
              {reassigning ? 'Reassigning...' : `Reassign ${selectedRecords.size} Selected`}
            </button>
          </div>

          {selectedRecords.size > 0 && (
            <div className="mt-4 text-sm text-gray-600">
              <span className="font-medium">{selectedRecords.size}</span> record(s) selected for reassignment
            </div>
          )}
        </div>
      )}

      {/* Orphaned Records Groups */}
      <div className="space-y-4">
        {groups.map(group => (
          <div key={group.type} className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
              onClick={() => toggleGroup(group.type)}
            >
              <div className="flex items-center gap-3">
                {group.expanded ? (
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                )}
                <h3 className="text-lg font-semibold text-gray-900">{group.type}</h3>
                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-medium">
                  {group.count}
                </span>
              </div>

              {group.expanded && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    selectAllInGroup(group);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Select All
                </button>
              )}
            </div>

            {group.expanded && (
              <div className="border-t border-gray-200">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-12 px-4 py-2"></th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-gray-700">Record</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-gray-700">Description</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-gray-700">Original User</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-gray-700">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {group.records.map(record => (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedRecords.has(record.id)}
                            onChange={() => toggleRecord(record.id)}
                            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {record.title}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {record.description}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {record.original_user_name || (
                            <span className="text-gray-400 italic">Unknown</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(record.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
