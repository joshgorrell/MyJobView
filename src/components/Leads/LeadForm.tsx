import { useState, useEffect } from 'react';
import { X, AtSign, Users } from 'lucide-react';
import { QuickActionModal } from '../Shared/QuickActionModal';
import { supabase } from '../../lib/supabase';
import { Profile, CompanyOffice } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import { useAutoSave } from '../../hooks/useAutoSave';
import { generateUsername, generateUniqueUsername } from '../../lib/username';
import { offlineSupabaseInsert } from '../../lib/offlineSupport';

interface LeadFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function LeadForm({ onClose, onSuccess }: LeadFormProps) {
  const { profile } = useAuth();
  const [salesReps, setSalesReps] = useState<Profile[]>([]);
  const [offices, setOffices] = useState<CompanyOffice[]>([]);
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    username: '',
    email: '',
    phone: '',
    opportunity_description: '',
    tags: '',
    priority: 'medium',
    office_id: '',
    assignment: 'fishbowl' as 'fishbowl' | string,
  });
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Auto-save hook
  const { restoreSavedData, clearSavedData } = useAutoSave({
    key: 'lead_new',
    data: formData,
    enabled: true
  });

  useEffect(() => {
    loadSalesReps();
    loadOffices();

    // Auto-restore saved data on mount
    const savedData = restoreSavedData();
    if (savedData) {
      setFormData(savedData);
    }
  }, []);

  async function loadSalesReps() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['sales', 'admin'])
      .eq('is_active', true)
      .order('full_name');

    if (data) setSalesReps(data);
  }

  async function loadOffices() {
    const { data } = await supabase
      .from('company_offices')
      .select('*')
      .order('display_order');

    if (data) setOffices(data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const isFishbowl = formData.assignment === 'fishbowl';
      const assignedTo = isFishbowl ? null : formData.assignment;

      let username = formData.username;
      if (username) {
        const { data: existingLead } = await supabase
          .from('leads')
          .select('username')
          .eq('username', username)
          .maybeSingle();

        if (existingLead) {
          alert(`Username "@${username}" is already taken. Please choose a different username or leave it blank to auto-generate.`);
          setLoading(false);
          return;
        }
      } else {
        username = await generateUniqueUsername(formData.contact_name, supabase);
      }

      const leadData = {
        company_name: formData.company_name || null,
        contact_name: formData.contact_name,
        username: username,
        email: formData.email || null,
        phone: formData.phone || null,
        opportunity_description: formData.opportunity_description || null,
        priority: formData.priority,
        office_id: formData.office_id || null,
        status: isFishbowl ? 'unclaimed' : 'claimed',
        assigned_to: assignedTo,
        created_by: profile?.id,
        is_fishbowl: isFishbowl,
        claimed_at: isFishbowl ? null : new Date().toISOString(),
      };

      const leadResult = await offlineSupabaseInsert('leads', leadData);
      if (leadResult.error) throw leadResult.error;
      const lead = Array.isArray(leadResult.data) ? leadResult.data[0] : leadResult.data;

      if (formData.tags && lead) {
        const tags = formData.tags
          .split(/[\s,]+/)
          .filter((tag) => tag.startsWith('#'))
          .map((tag) => tag.substring(1).toLowerCase());

        if (tags.length > 0) {
          const tagInserts = tags.map((tag) => ({
            lead_id: lead.id,
            tag,
          }));

          await offlineSupabaseInsert('lead_tags', tagInserts);
        }
      }

      if (lead) {
        await offlineSupabaseInsert('feed_events', {
          event_type: 'lead_created',
          lead_id: lead.id,
          user_id: profile?.id,
          metadata: {
            company_name: formData.company_name,
            contact_name: formData.contact_name,
            is_fishbowl: isFishbowl,
          },
        });
      }

      if (isFishbowl) {
        let allSalesReps: any[] = [];

        if (formData.office_id) {
          const { data: officeUsers } = await supabase
            .from('user_offices')
            .select('user_id')
            .eq('office_id', formData.office_id);

          if (officeUsers && officeUsers.length > 0) {
            const userIds = officeUsers.map(ou => ou.user_id);
            const { data } = await supabase
              .from('profiles')
              .select('id, email, email_leads, notify_on_fishbowl')
              .in('id', userIds)
              .eq('role', 'sales')
              .eq('is_active', true);
            allSalesReps = data || [];
          }

          const { data: unassignedReps } = await supabase
            .from('profiles')
            .select('id, email, email_leads, notify_on_fishbowl')
            .eq('role', 'sales')
            .eq('is_active', true)
            .not('id', 'in', `(SELECT user_id FROM user_offices)`);

          if (unassignedReps) {
            allSalesReps = [...allSalesReps, ...unassignedReps];
          }
        } else {
          const { data } = await supabase
            .from('profiles')
            .select('id, email, email_leads, notify_on_fishbowl')
            .eq('role', 'sales')
            .eq('is_active', true);
          allSalesReps = data || [];
        }

        if (allSalesReps && allSalesReps.length > 0) {
          const repsToNotify = allSalesReps.filter(rep => rep.notify_on_fishbowl !== false);

          if (repsToNotify.length > 0) {
            const notifications = repsToNotify.map((rep) => ({
              user_id: rep.id,
              type: 'fishbowl_lead',
              lead_id: lead.id,
              title: 'New Lead in Fishbowl',
              body: `${formData.contact_name}${formData.company_name ? ` from ${formData.company_name}` : ''} is available to claim`,
            }));

            await offlineSupabaseInsert('notifications', notifications);
          }

          const emailReps = allSalesReps.filter(rep => rep.email_leads && rep.email);
          if (emailReps.length > 0) {
            const emails = emailReps.map(rep => rep.email);
            try {
              const { data: { session } } = await supabase.auth.getSession();
              await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-lead-notification`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session?.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  to: emails,
                  leadId: lead.id,
                  leadName: formData.contact_name,
                  companyName: formData.company_name || undefined,
                  isFishbowl: true,
                }),
              });
            } catch (emailError) {
              console.error('Error sending email notifications:', emailError);
            }
          }
        }
      } else if (assignedTo) {
        const { data: assignedUser } = await supabase
          .from('profiles')
          .select('notify_on_lead_assigned')
          .eq('id', assignedTo)
          .single();

        if (assignedUser?.notify_on_lead_assigned !== false) {
          await offlineSupabaseInsert('notifications', {
            user_id: assignedTo,
            type: 'lead_assigned',
            lead_id: lead.id,
            title: 'New Lead Assigned',
            body: `You've been assigned ${formData.contact_name}${formData.company_name ? ` from ${formData.company_name}` : ''}`,
          });
        }

        const { data: assignedRep } = await supabase
          .from('profiles')
          .select('email, email_leads')
          .eq('id', assignedTo)
          .single();

        if (assignedRep?.email && assignedRep.email_leads) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-lead-notification`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session?.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: [assignedRep.email],
                leadId: lead.id,
                leadName: formData.contact_name,
                companyName: formData.company_name || undefined,
                isFishbowl: false,
              }),
            });
          } catch (emailError) {
            console.error('Error sending email notification:', emailError);
          }
        }
      }

      clearSavedData();
      setShowSuccess(true);
      await new Promise(resolve => setTimeout(resolve, 900));
      onSuccess();
      onClose();

      // Navigate to the lead detail page
      if (lead?.id) {
        window.location.hash = `#lead/${lead.id}`;
      }
    } catch (error) {
      console.error('Error creating lead:', error);
      alert('Failed to create lead. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    // Clear saved data when user explicitly closes the form
    clearSavedData();
    onClose();
  }

  return (
    <QuickActionModal
      title="New Lead"
      subtitle="Add a new sales opportunity"
      icon={<Users className="w-5 h-5 text-white" />}
      accentColor="from-emerald-600 to-teal-700"
      onClose={handleClose}
      showSuccess={showSuccess}
      successMessage="Lead Created!"
    >
        <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Contact Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="John Doe"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Company Name
              </label>
              <input
                type="text"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="Acme Corp"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Username <span className="text-gray-500 font-normal">(@ mention name)</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <AtSign className="w-4 h-4 text-gray-500" />
              </div>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder={formData.contact_name ? generateUsername(formData.contact_name) : 'johndoe'}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Leave blank to auto-generate. Used for @mentions.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="john@acme.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="+1 (555) 123-4567"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Opportunity / Description</label>
            <textarea
              value={formData.opportunity_description}
              onChange={(e) => setFormData({ ...formData, opportunity_description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
              placeholder="Interested in our enterprise plan..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Tags</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder="#enterprise #referral"
            />
            <p className="text-xs text-gray-500 mt-1">Separate tags with spaces. Use # prefix.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Follow-up Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="urgent">Urgent — within hours</option>
                <option value="high">High — within 1 day</option>
                <option value="medium">Medium — within 3 days</option>
                <option value="low">Low — within 1 week</option>
              </select>
            </div>

            {offices.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Sales Office</label>
                <select
                  value={formData.office_id}
                  onChange={(e) => setFormData({ ...formData, office_id: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="">No specific office</option>
                  {offices.map((office) => (
                    <option key={office.id} value={office.id}>{office.office_name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Assignment</label>
            <select
              value={formData.assignment}
              onChange={(e) => setFormData({ ...formData, assignment: e.target.value })}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="fishbowl">Send to Fishbowl (All reps notified)</option>
              {salesReps.map((rep) => (
                <option key={rep.id} value={rep.id}>Assign to {rep.full_name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2 pb-2 border-t border-gray-700/60">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-700 text-gray-300 rounded-xl hover:bg-gray-800 transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl hover:shadow-lg hover:shadow-emerald-500/30 transition-all font-medium text-sm disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </form>
    </QuickActionModal>
  );
}
