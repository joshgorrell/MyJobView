import {useWorkOrderOptions} from '../../lib/workOrderOptions';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { X, Search, Plus, User, Briefcase, MapPin, AlertTriangle, Bell, Mail, MessageSquare, Link, PhoneCall, ExternalLink, Package, ChevronDown, ChevronUp, ClipboardList, Phone, Repeat } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import ProjectScope from '../Projects/ProjectScope';
import { AddressAutocomplete } from '../Shared/AddressAutocomplete';
import { WorkOrderSchedulePicker } from './WorkOrderSchedulePicker';
import { schedulingError } from '../../lib/workOrderScheduling';
import { notifyTechJobAssigned } from '../../lib/dispatchNotifications';
import { RecurrenceSelector, RecurrenceRule } from '../Shared/RecurrenceSelector';

export interface ServiceRequestContext {
  earliest_date?: string | null;
  customer_contact_instruction?: string;
  warranty_type?: string | null;
  warranty_reference?: string | null;
  warranty_notes?: string | null;
  estimated_duration?: string | null;

  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  job_location_address: string;
  job_location_city: string | null;
  job_location_state: string | null;
  job_location_zip: string | null;
  job_description: string;
  billable_type: string;
  priority: string;
  notes: string | null;
  contact_id: string | null;
  customer_location_id?: string | null;
  requested_tech_ids: string[] | null;
  requested_date: string | null;
  requested_time: string | null;
  source_type: string;
  request_type: 'service' | 'project' | null;
  project_id: string | null;
}

interface CreateWorkOrderModalProps {
  onClose: () => void;
  onSuccess: () => void;
  projectId?: string;
  contactId?: string;
  initialTechnicianIds?: string[];
  emergency?: boolean;
  serviceRequest?: ServiceRequestContext;
}

interface Task {
  id: string;
  title: string;
  description: string;
  estimated_hours: number;
  project_task_id?: string;
  visit_instructions?: string;
}

interface LaborPhase {
  id: string;
  name: string;
  description: string | null;
}

interface ProjectTask {
  id: string;
  title: string;
  description: string | null;
  estimated_hours: number;
  labor_phase_id: string | null;
  status: string;
}

interface Contact {
  id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  company_name: string;
  phone: string;
  email: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
}

interface Project {
  id: string;
  name: string;
  project_number: string;
  status: string;
  sales_order_id: string | null;
  sales_order_number?: string;
  sales_order_total?: number;
}

interface Technician {
  id: string;
  full_name: string;
}

interface WarrantyWorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  type: string;
}

interface PartEntry {
  id: string;
  product_id: string | null;
  part_name: string;
  part_sku: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
}

interface ProductResult {
  id: string;
  name: string;
  sku: string | null;
  cost_price: number | null;
  unit_price: number | null;
}

export function CreateWorkOrderModal({ onClose, onSuccess, projectId, contactId, initialTechnicianIds = [], serviceRequest, emergency = false }: CreateWorkOrderModalProps) {
  const { profile } = useAuth();
  const workOrderOptions = useWorkOrderOptions();
  const [workOrderTypeId,setWorkOrderTypeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [customerProjects, setCustomerProjects] = useState<Project[]>([]);
  const [warrantyWorkOrders, setWarrantyWorkOrders] = useState<WarrantyWorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechnicians, setSelectedTechnicians] = useState<string[]>(
    initialTechnicianIds
  );

  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [technicianVisitNotes, setTechnicianVisitNotes] = useState<Record<string, string>>({});
  const [allProjects, setAllProjects] = useState<Array<{id:string;name:string;project_number:string}>>([]);
  const [activeTaskIds, setActiveTaskIds] = useState<string[]>([]);
  const [technicianTaskIds, setTechnicianTaskIds] = useState<Record<string, string[]>>({});
  const creationKey = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const [projectContextError, setProjectContextError] = useState('');
  const projectContextRequest = useRef(0);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskHours, setNewTaskHours] = useState('0');

  // Labor phase and project tasks
  const [laborPhases, setLaborPhases] = useState<LaborPhase[]>([]);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>('');
  const [taskLoadError,setTaskLoadError] = useState('');
  const [taskLoading,setTaskLoading] = useState(false);
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);
  const [showAllProjectPhases, setShowAllProjectPhases] = useState(false);
  const [selectedProjectTasks, setSelectedProjectTasks] = useState<Set<string>>(new Set());

  // Labor categories for Test & Tune tracking
  const [laborCategories, setLaborCategories] = useState<Array<{ id: string; name: string; description: string; display_color: string }>>([]);
  const [salesOrderInTestTune, setSalesOrderInTestTune] = useState(false);

  // Parts
  const [parts, setParts] = useState<PartEntry[]>([]);
  const [showPartsSection, setShowPartsSection] = useState(false);
  const [partSearch, setPartSearch] = useState('');
  const [partSearchResults, setPartSearchResults] = useState<ProductResult[]>([]);
  const [, setPartSearching] = useState(false);

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Recurrence
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(null);

  const [formData, setFormData] = useState({
    // Customer info (for new customer)
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    customer_address: serviceRequest?.job_location_address || '',
    customer_city: serviceRequest?.job_location_city || '',
    customer_state: serviceRequest?.job_location_state || '',
    customer_zip: serviceRequest?.job_location_zip || '',

    // Work order details
    project_id: projectId || serviceRequest?.project_id || '',
    type: (projectId || serviceRequest?.project_id ? 'project' : 'service') as 'project' | 'service' | 'site_survey' | 'warranty',
    billable_type: (projectId || serviceRequest?.project_id ? 'project' : serviceRequest?.billable_type === 'warranty' ? 'warranty' : 'billable') as 'billable' | 'warranty' | 'project',
    warranty_reference_type: 'service' as 'project' | 'service',
    warranty_reference_id: '',
    title: serviceRequest ? `${serviceRequest.request_type === 'project' ? 'Project' : 'Service'}: ${serviceRequest.job_description.substring(0, 60)}` : '',
    description: serviceRequest?.job_description || '',
    priority: emergency ? 'urgent' : serviceRequest?.priority === 'emergency' ? 'urgent' : serviceRequest?.priority === 'urgent' ? 'high' : 'medium',
    start_date: '',
    start_time: serviceRequest?.requested_time || '',
    end_time: '',
    target_completion_date: serviceRequest?.requested_date?.split('T')[0] || '',
    estimated_hours: '',
    notes: serviceRequest?.notes || '',
    internal_notes: serviceRequest ? [serviceRequest.notes, serviceRequest.earliest_date && `Do not schedule before: ${serviceRequest.earliest_date}`, serviceRequest.requested_date && `Need by: ${serviceRequest.requested_date}`, `Customer contact: ${serviceRequest.customer_contact_instruction || 'dispatch'}`, serviceRequest.estimated_duration && `Estimated duration: ${serviceRequest.estimated_duration}`, serviceRequest.warranty_type && `Warranty: ${serviceRequest.warranty_type}; ${serviceRequest.warranty_reference || ''}; ${serviceRequest.warranty_notes || ''}`].filter(Boolean).join('\n') : '',

    // Appointment reminders
    send_appointment_reminder: false,
    reminder_email: true,
    reminder_sms: false,

    // Billing
    is_billable: !serviceRequest || serviceRequest.billable_type !== 'warranty',

    // Labor category for Test & Tune tracking
    labor_category_id: '',

    // Customer contact confirmation
    customer_contacted: serviceRequest?.customer_contact_instruction === 'already_contacted' ? 'yes' : ''
  });

  useEffect(() => {
    loadTechnicians();
    supabase.from('projects').select('id,name,project_number').order('created_at', {ascending:false}).then(({data})=>setAllProjects(data || []));
    if (contactId) {
      loadContact(contactId);
    } else if (serviceRequest?.contact_id) {
      loadContact(serviceRequest.contact_id);
    }
  }, [contactId]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.length >= 2) {
        searchContacts();
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  useEffect(() => {
    if (selectedContact) {
      loadCustomerProjects(selectedContact.id);
      loadWarrantyWorkOrders(selectedContact.id);
    }
  }, [selectedContact]);

  // Auto-set billable_type based on work order type
  useEffect(() => {
    if (formData.type === 'project') {
      setFormData(prev => ({ ...prev, billable_type: 'project' }));
    } else if (formData.type === 'warranty') {
      setFormData(prev => ({ ...prev, billable_type: 'warranty' }));
    } else if (formData.type === 'site_survey') {
      setFormData(prev => ({ ...prev, billable_type: 'warranty' })); // Non-billable
    } else if (formData.type === 'service') {
      setFormData(prev => ({ ...prev, billable_type: 'billable' }));
    }
  }, [formData.type]);

  // Load labor phases when component mounts
  useEffect(() => {
    loadLaborPhases();
    loadLaborCategories();
  }, []);

  // Check if project's sales order is in Test & Tune period
  useEffect(() => {
    if (formData.project_id) {
      checkTestTuneStatus(formData.project_id);
    } else {
      setSalesOrderInTestTune(false);
    }
  }, [formData.project_id]);

  const previousProjectId = useRef(formData.project_id);
  useEffect(() => {
    if (previousProjectId.current !== formData.project_id) {
      previousProjectId.current = formData.project_id;
      setTasks(previous => previous.filter(task => !task.project_task_id));
      setSelectedProjectTasks(new Set());
      setSelectedPhaseId('');
      setProjectTasks([]);
    }
  }, [formData.project_id]);

  useEffect(() => {
    const request = ++projectContextRequest.current;
    setProjectContextError('');
    if (!formData.project_id) return;
    supabase.from('projects').select('contact_id, job_site_address, customer_location_id').eq('id', formData.project_id).maybeSingle().then(async ({ data, error }) => {
      if (request !== projectContextRequest.current) return;
      if (error || !data) { setProjectContextError('Project context could not be loaded. Reselect the project to retry.'); return; }
      if (data.contact_id) {
        const { data: customer, error: customerError } = await supabase.from('contacts').select('*').eq('id', data.contact_id).maybeSingle();
        if (request !== projectContextRequest.current) return;
        if (customerError || !customer) { setProjectContextError('Project customer could not be loaded.'); return; }
        setSelectedContact(customer);
      }
      const site = data.job_site_address;
      setFormData(previous => ({ ...previous,
        customer_address: typeof site === 'string' ? site : site?.street || site?.address || '',
        customer_city: typeof site === 'object' ? site?.city || '' : '',
        customer_state: typeof site === 'object' ? site?.state || '' : '',
        customer_zip: typeof site === 'object' ? site?.zip || site?.zip_code || '' : '',
      }));
    });
  }, [formData.project_id]);

  // Load project tasks when project or phase is selected
  useEffect(() => {
    if (formData.project_id) {
      loadProjectTasks(formData.project_id, showAllProjectPhases ? undefined : selectedPhaseId);
    } else {
      projectTaskRequest.current++;
      setProjectTasks([]);
      setSelectedProjectTasks(new Set());
    }
  }, [formData.project_id, selectedPhaseId, showAllProjectPhases]);

  async function loadTechnicians() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_technician', true)
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      setTechnicians(data || []);
    } catch (error) {
      console.error('Error loading technicians:', error);
    }
  }

  async function searchProducts(query: string) {
    if (!query.trim() || query.length < 2) {
      setPartSearchResults([]);
      return;
    }
    setPartSearching(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, cost_price, unit_price')
        .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
        .eq('is_active', true)
        .limit(15);

      if (error) throw error;
      setPartSearchResults(data || []);
    } catch (error) {
      console.error('Error searching products:', error);
    } finally {
      setPartSearching(false);
    }
  }

  function addPartFromCatalog(product: ProductResult) {
    const newPart: PartEntry = {
      id: crypto.randomUUID(),
      product_id: product.id,
      part_name: product.name,
      part_sku: product.sku || '',
      quantity: 1,
      unit_cost: product.cost_price || 0,
      unit_price: product.unit_price || 0
    };
    setParts(prev => [...prev, newPart]);
    setPartSearch('');
    setPartSearchResults([]);
  }

  function addCustomPart() {
    const newPart: PartEntry = {
      id: crypto.randomUUID(),
      product_id: null,
      part_name: '',
      part_sku: '',
      quantity: 1,
      unit_cost: 0,
      unit_price: 0
    };
    setParts(prev => [...prev, newPart]);
  }

  function updatePart(id: string, field: keyof PartEntry, value: string | number) {
    setParts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }

  function removePart(id: string) {
    setParts(prev => prev.filter(p => p.id !== id));
  }

  async function loadContact(id: string) {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setSelectedContact(data);
    } catch (error) {
      console.error('Error loading contact:', error);
    }
  }

  async function searchContacts() {
    setSearching(true);
    try {
      const q = searchQuery.trim();
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, company_name, phone, email, street_address, city, state, zip_code')
        .or(`full_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,company_name.ilike.%${q}%,phone.ilike.%${q}%`)
        .order('full_name', { ascending: true })
        .limit(15);

      if (error) throw error;

      setSearchResults(data || []);
    } catch (error: any) {
      console.error('Error searching contacts:', error);
      alert(`Error searching contacts: ${error?.message || 'Please try again.'}`);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function loadCustomerProjects(contactId: string) {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id, name, project_number, status, sales_order_id,
          sales_orders(order_number, contract_total)
        `)
        .eq('contact_id', contactId)
        .in('status', ['planning', 'active', 'completed'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      const projects = (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        project_number: p.project_number,
        status: p.status,
        sales_order_id: p.sales_order_id,
        sales_order_number: p.sales_orders?.order_number || null,
        sales_order_total: p.sales_orders?.contract_total || null,
      }));
      setCustomerProjects(projects);
    } catch (error) {
      console.error('Error loading customer projects:', error);
    }
  }

  async function loadWarrantyWorkOrders(contactId: string) {
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select('id, work_order_number, title, type')
        .eq('contact_id', contactId)
        .in('type', ['project', 'service'])
        .in('status', ['completed'])
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setWarrantyWorkOrders(data || []);
    } catch (error) {
      console.error('Error loading warranty work orders:', error);
    }
  }

  async function loadLaborPhases() {
    try {
      const { data, error } = await supabase
        .from('labor_phases')
        .select('id, name, description')
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      setLaborPhases(data || []);
    } catch (error) {
      console.error('Error loading labor phases:', error);
    }
  }

  async function loadLaborCategories() {
    try {
      const { data, error } = await supabase
        .from('labor_categories')
        .select('id, name, description, display_color')
        .eq('active', true)
        .order('sort_order');

      if (error) throw error;
      setLaborCategories(data || []);
    } catch (error) {
      console.error('Error loading labor categories:', error);
    }
  }

  async function checkTestTuneStatus(projectId: string) {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('sales_order_id, sales_orders!inner(test_tune_status)')
        .eq('id', projectId)
        .single();

      if (error) throw error;

      if (data && data.sales_orders) {
        const status = (data.sales_orders as any).test_tune_status;
        setSalesOrderInTestTune(status === 'active');
      } else {
        setSalesOrderInTestTune(false);
      }
    } catch (error) {
      console.error('Error checking test & tune status:', error);
      setSalesOrderInTestTune(false);
    }
  }

  const projectTaskRequest = useRef(0);
  async function loadProjectTasks(projectId: string, phaseId?: string) {
    const request = ++projectTaskRequest.current;
    setTaskLoading(true); setTaskLoadError('');
    setProjectTasks([]);
    setSelectedProjectTasks(new Set());
    try {
      let query = supabase
        .from('project_tasks')
        .select('id, title, description, estimated_hours, labor_phase_id, status')
        .eq('project_id', projectId)
        .eq('status', 'open')
        .order('sort_order');

      // Filter by phase if selected
      if (phaseId) {
        query = query.eq('labor_phase_id', phaseId);
      }

      const { data, error } = await query;

      if (error) throw error;
      if (request === projectTaskRequest.current) setProjectTasks(data || []);
      const { data: active } = await supabase.from('work_order_tasks').select('project_task_id, work_orders!inner(project_id,status)').eq('work_orders.project_id', projectId).not('work_orders.status','in','(completed,cancelled)').not('status','in','(completed,cancelled)');
      if (request === projectTaskRequest.current) setActiveTaskIds((active || []).map(task => task.project_task_id).filter(Boolean));
    } catch (error) {
      console.error('Error loading project tasks:', error);
      if (request === projectTaskRequest.current) {setProjectTasks([]);setTaskLoadError('Project tasks could not be loaded. Retry before saving.');}
    } finally { if(request === projectTaskRequest.current) setTaskLoading(false); }
  }

  function handleToggleProjectTask(taskId: string) {
    const newSelected = new Set(selectedProjectTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedProjectTasks(newSelected);
  }

  function handleAddSelectedProjectTasks() {
    const tasksToAdd = projectTasks
      .filter(pt => selectedProjectTasks.has(pt.id) && !tasks.some(task => task.project_task_id === pt.id))
      .map(pt => ({
        id: crypto.randomUUID(),
        title: pt.title,
        description: pt.description || '',
        estimated_hours: pt.estimated_hours,
        project_task_id: pt.id // Link to project task for auto-completion
      }));

    setTasks([...tasks, ...tasksToAdd]);
    setSelectedProjectTasks(new Set()); // Clear selections
  }

  function selectContact(contact: Contact) {
    setSelectedContact(contact);
    setSearchQuery('');
    setSearchResults([]);
    // Linked projects resolve their own site rather than a billing address.
    if (formData.project_id) return;
    setFormData(prev => ({
      ...prev,
      customer_address: contact.street_address || '',
      customer_city: contact.city || '',
      customer_state: contact.state || '',
      customer_zip: contact.zip_code || ''
    }));
  }

  function getFullAddress(): string {
    const addr = serviceRequest
      ? [formData.customer_address, formData.customer_city, formData.customer_state, formData.customer_zip].filter(Boolean).join(', ')
      : selectedContact
      ? [selectedContact.street_address, selectedContact.city, selectedContact.state, selectedContact.zip_code].filter(Boolean).join(', ')
      : [formData.customer_address, formData.customer_city, formData.customer_state, formData.customer_zip].filter(Boolean).join(', ');
    return addr;
  }

  function openGoogleMaps() {
    const addr = getFullAddress();
    if (addr) {
      window.open(`https://maps.google.com/?q=${encodeURIComponent(addr)}`, '_blank');
    }
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (serviceRequest?.earliest_date && formData.start_date && formData.start_date < serviceRequest.earliest_date) {
      errors.start_date = 'Schedule on or after the customer’s earliest available date';
    }
    if (!selectedContact && !showNewCustomer) {
      errors.customer = 'Please select or create a customer';
    }
    if (showNewCustomer && !formData.customer_name.trim()) {
      errors.customer_name = 'Customer name is required';
    }
    if (!formData.title.trim()) {
      errors.title = 'Title is required';
    }
    if (selectedTechnicians.length === 0) {
      errors.technicians = 'At least one technician must be assigned';
    }
    if (!formData.start_date) {
      errors.start_date = 'Start date is required';
    }
    if (!formData.start_time) {
      errors.start_time = 'Start time is required';
    }
    if (!formData.end_time) {
      errors.end_time = 'End time is required';
    }
    const timeError = schedulingError({ date: formData.start_date, start: formData.start_time, end: formData.end_time });
    if (timeError || scheduleError) errors.schedule = timeError || scheduleError || '';
    if (!formData.customer_contacted) {
      errors.customer_contacted = 'Please indicate if the customer has been contacted';
    }
    if (formData.type === 'project' && !formData.project_id) {
      errors.project_id = 'A project must be selected for project work orders';
    }
    if (formData.type === 'warranty' && !formData.warranty_reference_id) {
      errors.warranty_reference_id = 'An original work order must be referenced';
    }
    if (salesOrderInTestTune && !formData.labor_category_id) {
      errors.labor_category_id = 'Labor category is required during Test & Tune period';
    }
    if (projectContextError) errors.project_id = projectContextError;
    if(formData.project_id && (taskLoading || taskLoadError)) errors.project_id = taskLoadError || 'Project tasks are still loading.';

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function addTask() {
    if (!newTaskTitle.trim()) {
      alert('Please enter a task title');
      return;
    }

    const task: Task = {
      id: crypto.randomUUID(),
      title: newTaskTitle.trim(),
      description: newTaskDescription.trim(),
      estimated_hours: parseFloat(newTaskHours) || 0
    };

    setTasks(prev => [...prev, task]);
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskHours('0');
  }

  function removeTask(taskId: string) {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || submitting.current) return;

    if (!validate()) return;

    submitting.current = true;
    setLoading(true);

    try {
      let finalContactId = selectedContact?.id;

      // Create new contact if needed
      if (!finalContactId && showNewCustomer) {
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            full_name: formData.customer_name,
            phone: formData.customer_phone || null,
            email: formData.customer_email || null,
            street_address: formData.customer_address || null,
            city: formData.customer_city || null,
            state: formData.customer_state || null,
            zip_code: formData.customer_zip || null,
            created_by: profile.id
          })
          .select()
          .single();

        if (contactError) throw contactError;
        finalContactId = newContact.id;
      }

      let vipSubscriptionId: string | null = null;
      if ((formData.type as string) === 'vip_program') {
        const {data:subscription,error:subscriptionError}=await supabase.from('recurring_subscriptions').select('id,plan:recurring_plans!inner(plan_type)').eq('plan.plan_type','vip_plan').eq('contact_id',finalContactId).eq('organization_id',profile.organization_id).eq('status','active').order('start_date',{ascending:false}).limit(1).maybeSingle();
        if(subscriptionError || !subscription) throw new Error('VIP maintenance requires an active subscription. Review the customer’s plan first.');
        vipSubscriptionId=subscription.id;
      }
      // Generate a unique group ID for linked work orders
      const groupId = crypto.randomUUID();

      // Create work orders for each technician
      const workOrdersToCreate = selectedTechnicians.map((techId, index) => ({
        work_order_type_id: workOrderTypeId || workOrderOptions.find(option => option.kind === 'type' && option.system_key === formData.type)?.id || null,
        recurring_subscription_id: vipSubscriptionId,
        company_id: profile.organization_id,
        contact_id: finalContactId,
        customer_location_id: selectedContact?.id === serviceRequest?.contact_id ? serviceRequest?.customer_location_id || null : null,
        project_id: formData.project_id || null,
        service_location_address: formData.customer_address || null,
        service_location_city: formData.customer_city || null,
        service_location_state: formData.customer_state || null,
        service_location_zip: formData.customer_zip || null,
        address: [formData.customer_address, formData.customer_city, formData.customer_state, formData.customer_zip].filter(Boolean).join(', '),
        labor_phase_id: selectedPhaseId || null, // Store selected labor phase
        labor_category_id: formData.labor_category_id || null, // Store labor category for Test & Tune tracking
        work_order_group_id: selectedTechnicians.length > 1 ? groupId : null,
        title: formData.title,
        description: formData.description,
        type: formData.type,
        is_billable: formData.type === 'service' ? formData.is_billable : false,
        billable_type: formData.billable_type,
        warranty_reference_type: formData.type === 'warranty' ? formData.warranty_reference_type : null,
        warranty_reference_id: formData.type === 'warranty' ? formData.warranty_reference_id : null,
        priority: formData.priority,
        status: 'assigned',
        assigned_to: techId,
        start_date: formData.start_date || null,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
        target_completion_date: formData.target_completion_date || null,
        estimated_hours: parseFloat(formData.estimated_hours) || 0,
        notes: formData.notes,
        internal_notes: [formData.internal_notes, technicianVisitNotes[techId]].filter(Boolean).join('\n'),
        send_appointment_reminder: formData.send_appointment_reminder,
        reminder_email: formData.reminder_email,
        reminder_sms: formData.reminder_sms,
        customer_contacted: formData.customer_contacted === 'yes',
        created_by: profile.id,
        office_id: profile.primary_office_id || profile.default_office_id || null,
        // Recurrence only on the first work order (when single tech, or first tech in group)
        is_recurring_parent: index === 0 && recurrenceRule !== null,
        recurrence_rule: index === 0 && recurrenceRule !== null ? recurrenceRule : null,
      }));

      const assignments = workOrdersToCreate.map((workOrder, index) => ({
        work_order: workOrder,
        tasks: tasks.filter(task => selectedTechnicians.length === 1 || (technicianTaskIds[selectedTechnicians[index]] || []).includes(task.id)).map(task => ({
          title: task.title, description: task.description, estimated_hours: task.estimated_hours,
          project_task_id: task.project_task_id || null, visit_instructions: task.visit_instructions || null,
        })),
        parts: parts.map(({ id, ...part }) => ({ ...part, warranty_item: false })),
      }));
      const { data: createdWorkOrders, error } = await supabase.rpc('create_work_order_assignments', {
        p_request_id: creationKey.current, p_assignments: assignments,
        p_service_request_id: serviceRequest?.id || null,
      });
      if (error) throw error;

      // If converting from a service request, update it and send tech notifications
      if (serviceRequest && createdWorkOrders && createdWorkOrders.length > 0) {
        const contactName = selectedContact?.full_name || selectedContact?.company_name || serviceRequest?.customer_name || formData.customer_name;
        const address = serviceRequest?.job_location_address || formData.customer_address || selectedContact?.street_address;
        for (let i = 0; i < selectedTechnicians.length; i++) {
          const wo = createdWorkOrders[i] || createdWorkOrders[0];
          await notifyTechJobAssigned(selectedTechnicians[i], {
            work_order_number: (wo as any).work_order_number || '',
            title: formData.title,
            customer_name: contactName,
            scheduled_date: formData.start_date,
            address
          });
        }
      }


      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error creating work order:', error);
      alert(`Failed to create work order: ${error?.message || 'Unknown error'}`);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div role="dialog" aria-modal="true" aria-label="Create work order" className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-10">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">
            {emergency ? 'Create Emergency Work Order' : serviceRequest ? 'Convert to Work Order' : 'Create Work Order'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Service Request Banner - shown when converting from a service request */}
          {serviceRequest && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <ClipboardList className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-amber-900 text-sm mb-1">Converting Service Request</p>
                  <p className="font-medium text-gray-900">{serviceRequest.customer_name}</p>
                  <p className="text-sm text-gray-700 mt-0.5">{serviceRequest.job_location_address}
                    {serviceRequest.job_location_city && `, ${serviceRequest.job_location_city}`}
                    {serviceRequest.job_location_state && `, ${serviceRequest.job_location_state}`}
                  </p>
                  {serviceRequest.customer_phone && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-600 mt-1">
                      <Phone className="w-3.5 h-3.5" />
                      {serviceRequest.customer_phone}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      serviceRequest.priority === 'emergency' ? 'bg-red-100 text-red-700' :
                      serviceRequest.priority === 'urgent' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {serviceRequest.priority.charAt(0).toUpperCase() + serviceRequest.priority.slice(1)} Priority
                    </span>
                    <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full capitalize">
                      {serviceRequest.source_type.replace('_', ' ')}
                    </span>
                    {serviceRequest.billable_type === 'warranty' && (
                      <span className="text-xs bg-gray-100 text-gray-600 font-medium px-2 py-0.5 rounded-full">No Charge</span>
                    )}
                  </div>
                  <p className="text-xs text-amber-700 mt-2">Fields below have been pre-filled from the request. Review and adjust as needed.</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block font-medium text-gray-900">Work Order Type</label>
            <select className="w-full p-3 border rounded-lg" value={workOrderTypeId || workOrderOptions.find(option=>option.kind==='type'&&option.system_key===formData.type)?.id || ''}
              onChange={e=>{const option=workOrderOptions.find(o=>o.id===e.target.value);if(option){setWorkOrderTypeId(option.id);setFormData({...formData,type:option.behavior as typeof formData.type});}}}>
              {!workOrderOptions.length && <option value="">{formData.type.replace(/_/g,' ')}</option>}
              {workOrderOptions.filter(o=>o.kind==='type'&&o.is_active).map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </div>

          {serviceRequest && <div className="rounded-lg border border-subtle bg-surface p-3 text-sm text-secondary space-y-1">
            <p className="font-semibold text-primary">Request scheduling instructions</p>
            <p>{serviceRequest.customer_contact_instruction === 'requester' ? 'Requester will coordinate with customer.' : serviceRequest.customer_contact_instruction === 'already_contacted' ? 'Customer already contacted — schedule as requested.' : 'Dispatch should contact customer.'}</p>
            {serviceRequest.earliest_date && <p>Earliest date: {serviceRequest.earliest_date}</p>}
            {serviceRequest.requested_date && <p>Need by: {serviceRequest.requested_date} (deadline, not an appointment)</p>}
            {!!serviceRequest.requested_tech_ids?.length && <p>Preferred tech: {serviceRequest.requested_tech_ids.map(id => technicians.find(t => t.id === id)?.full_name || 'Requested technician').join(', ')} — Dispatch makes final assignment.</p>}
            {serviceRequest.estimated_duration && <p>Estimated duration: {serviceRequest.estimated_duration}</p>}
            {serviceRequest.warranty_type && <p>Warranty: {serviceRequest.warranty_type} · {serviceRequest.warranty_reference} · {serviceRequest.warranty_notes}</p>}
          </div>}
          {/* Customer Selection */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <User className="w-5 h-5" />
              Customer *
            </h3>

            {!selectedContact && !showNewCustomer && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, company, or phone..."
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoFocus
                  />
                </div>

                {searching && (
                  <div className="text-center py-4 text-gray-500">
                    <div className="animate-spin inline-block w-6 h-6 border-3 border-blue-500 border-t-transparent rounded-full"></div>
                    <p className="mt-2">Searching...</p>
                  </div>
                )}

                {!searching && searchResults.length > 0 && (
                  <div className="border-2 border-blue-200 rounded-lg max-h-48 overflow-y-auto bg-blue-50">
                    {searchResults.map(contact => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => selectContact(contact)}
                        className="w-full text-left p-3 hover:bg-blue-100 border-b border-blue-100 last:border-b-0 transition-colors"
                      >
                        <p className="font-medium text-gray-900">
                          {contact.full_name || contact.company_name || 'Unnamed Contact'}
                        </p>
                        {contact.company_name && contact.full_name && (
                          <p className="text-sm text-gray-600">{contact.company_name}</p>
                        )}
                        <p className="text-sm text-gray-600">{contact.phone || 'No phone'}</p>
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowNewCustomer(true)}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Create New Customer
                </button>
              </>
            )}

            {selectedContact && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-green-700 font-medium">Customer Selected</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedContact(null);
                      setCustomerProjects([]);
                      setWarrantyWorkOrders([]);
                      setFormData(prev => ({ ...prev, project_id: '', warranty_reference_id: '', customer_address: '', customer_city: '', customer_state: '', customer_zip: '' }));
                    }}
                    className="text-sm text-green-600 hover:text-green-800 underline"
                  >
                    Change
                  </button>
                </div>
                <p className="font-medium text-gray-900">{selectedContact.full_name || selectedContact.company_name}</p>
                {selectedContact.phone && <p className="text-sm text-gray-600">{selectedContact.phone}</p>}
                {selectedContact.email && <p className="text-sm text-gray-600">{selectedContact.email}</p>}
                {getFullAddress() && (
                  <div className="flex items-center gap-2 mt-2">
                    <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <p className="text-sm text-gray-700 flex-1">{getFullAddress()}</p>
                    <button
                      type="button"
                      onClick={openGoogleMaps}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors"
                      title="Open in Google Maps"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Map
                    </button>
                  </div>
                )}
              </div>
            )}

            {showNewCustomer && !selectedContact && (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-blue-700 font-medium">Creating New Customer</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewCustomer(false);
                      setFormData(prev => ({
                        ...prev,
                        customer_name: '',
                        customer_phone: '',
                        customer_email: '',
                        customer_address: '',
                        customer_city: '',
                        customer_state: '',
                        customer_zip: ''
                      }));
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    Cancel
                  </button>
                </div>

                <input
                  type="text"
                  value={formData.customer_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, customer_name: e.target.value }))}
                  placeholder="Customer Name *"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="tel"
                    value={formData.customer_phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, customer_phone: e.target.value }))}
                    placeholder="Phone"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="email"
                    value={formData.customer_email}
                    onChange={(e) => setFormData(prev => ({ ...prev, customer_email: e.target.value }))}
                    placeholder="Email"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    <MapPin className="w-4 h-4 inline mr-1" />
                    Address (Optional)
                  </label>
                  <AddressAutocomplete
                    value={formData.customer_address}
                    onChange={(address, components) => {
                      setFormData(prev => ({
                        ...prev,
                        customer_address: address,
                        customer_city: components?.city || '',
                        customer_state: components?.state || '',
                        customer_zip: components?.zip || ''
                      }));
                    }}
                    placeholder="Street Address"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={formData.customer_city}
                      onChange={(e) => setFormData(prev => ({ ...prev, customer_city: e.target.value }))}
                      placeholder="City"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={formData.customer_state}
                      onChange={(e) => setFormData(prev => ({ ...prev, customer_state: e.target.value }))}
                      placeholder="State"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={formData.customer_zip}
                      onChange={(e) => setFormData(prev => ({ ...prev, customer_zip: e.target.value }))}
                      placeholder="ZIP"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Project Selection - Required for Project type */}
          {selectedContact && formData.type === 'project' && (
            <div className="space-y-3 bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-blue-600" />
                Select Related Project (Sales Order) *
              </h3>

              <div className="bg-blue-100 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600" />
                <div>
                  <strong>All time, parts, and notes for this work order will be tracked against the selected project.</strong>
                  {' '}This ties labor hours and materials directly to the sales order for project cost tracking.
                </div>
              </div>

              {customerProjects.length > 0 ? (
                <div className="space-y-2">
                  {customerProjects.map(project => {
                    const isSelected = formData.project_id === project.id;
                    return (
                      <label
                        key={project.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-blue-100 border-blue-500'
                            : 'bg-white border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="project_id"
                          value={project.id}
                          checked={isSelected}
                          onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                          required
                          className="mt-1 w-4 h-4 text-blue-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900">{project.name}</span>
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">{project.project_number}</span>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                            }`}>{project.status}</span>
                          </div>
                          {project.sales_order_number && (
                            <div className="flex items-center gap-1 mt-1">
                              <Link className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              <span className="text-xs text-gray-500">
                                Sales Order #{project.sales_order_number}
                                {project.sales_order_total != null && (
                                  <span className="ml-1 font-medium text-gray-700">
                                    — ${project.sales_order_total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                          {!project.sales_order_id && (
                            <p className="text-xs text-amber-600 mt-0.5">No linked sales order</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  <strong>No active projects found for this customer.</strong> Create a project/sales order first, or choose a different work order type.
                </div>
              )}

              {formData.project_id && (() => {
                const selected = customerProjects.find(p => p.id === formData.project_id);
                if (!selected) return null;
                return (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 flex items-center gap-2">
                    <Briefcase className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Time entries, parts used, and notes will be logged under <strong>{selected.name}</strong>
                      {selected.sales_order_number && <> (SO #{selected.sales_order_number})</>}.
                    </span>
                  </div>
                );
              })()}
            </div>
          )}

          {allProjects.length > 0 && <label className="block text-sm text-primary">Choose project (loads its customer and job site)
            <select value={formData.project_id} onChange={event=>setFormData(previous=>({...previous,project_id:event.target.value}))} className="block w-full bg-surface text-primary border border-subtle rounded-lg p-2 mt-1">
              <option value="">No project / standalone service</option>{allProjects.map(project=><option key={project.id} value={project.id}>{project.project_number} · {project.name}</option>)}
            </select>
          </label>}
          {formData.project_id && <details className="border border-subtle rounded-lg p-3"><summary className="min-h-11 text-info cursor-pointer text-sm">Open full project scope</summary><ProjectScope project={{id:formData.project_id}} /></details>}
          {taskLoadError && <p role="alert" className="text-red-600 text-sm">{taskLoadError}<button type="button" onClick={()=>loadProjectTasks(formData.project_id,showAllProjectPhases?undefined:selectedPhaseId)} className="min-h-11 ml-2 underline">Retry</button></p>}
          {projectContextError && <p role="alert" className="text-red-600 text-sm">{projectContextError}</p>}
          {/* Project Link - Optional for non-project types */}
          {selectedContact && formData.type !== 'project' && customerProjects.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Link to Project (Optional)
              </label>
              <select
                value={formData.project_id}
                onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">No Project (Standalone Work Order)</option>
                {customerProjects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.project_number} - {project.name}
                    {project.sales_order_number ? ` (SO #${project.sales_order_number})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Warranty Reference (Required for Warranty type) */}
          {selectedContact && formData.type === 'warranty' && (
            <div className="space-y-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Link className="w-5 h-5 text-red-600" />
                Original Work Order *
              </h3>
              <p className="text-sm text-gray-700">Select the completed work order this warranty covers:</p>

              <div className="grid grid-cols-2 gap-3 mb-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="warranty_reference_type"
                    value="service"
                    checked={formData.warranty_reference_type === 'service'}
                    onChange={(e) => setFormData({ ...formData, warranty_reference_type: e.target.value as any, warranty_reference_id: '' })}
                  />
                  <span className="text-sm">Service Work</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="warranty_reference_type"
                    value="project"
                    checked={formData.warranty_reference_type === 'project'}
                    onChange={(e) => setFormData({ ...formData, warranty_reference_type: e.target.value as any, warranty_reference_id: '' })}
                  />
                  <span className="text-sm">Project Work</span>
                </label>
              </div>

              <select
                required
                value={formData.warranty_reference_id}
                onChange={(e) => setFormData({ ...formData, warranty_reference_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select work order...</option>
                {warrantyWorkOrders
                  .filter(wo => wo.type === formData.warranty_reference_type)
                  .map(wo => (
                    <option key={wo.id} value={wo.id}>
                      {wo.work_order_number} - {wo.title}
                    </option>
                  ))}
              </select>
              {warrantyWorkOrders.filter(wo => wo.type === formData.warranty_reference_type).length === 0 && (
                <p className="text-sm text-red-700">No completed {formData.warranty_reference_type} work orders found for this customer.</p>
              )}
            </div>
          )}

          {/* Billing Type (for Service work orders) */}
          {formData.type === 'service' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Billing Type *
              </label>
              <p className="text-xs text-gray-600 mb-2">
                Billable work orders will appear in the Service Billing queue for invoicing.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer ${
                  formData.billable_type === 'billable'
                    ? 'bg-green-50 border-green-500'
                    : 'bg-white border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="billable_type"
                    value="billable"
                    checked={formData.billable_type === 'billable'}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        billable_type: e.target.value as any,
                        is_billable: true
                      });
                    }}
                    className="mt-1 w-4 h-4 text-green-600"
                  />
                  <div>
                    <span className="text-sm font-semibold text-gray-900 block">Billable T&M</span>
                    <span className="text-xs text-gray-600">Time & materials - invoice customer</span>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer ${
                  formData.billable_type === 'warranty'
                    ? 'bg-gray-50 border-gray-500'
                    : 'bg-white border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="billable_type"
                    value="warranty"
                    checked={formData.billable_type === 'warranty'}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        billable_type: e.target.value as any,
                        is_billable: false
                      });
                    }}
                    className="mt-1 w-4 h-4 text-gray-600"
                  />
                  <div>
                    <span className="text-sm font-semibold text-gray-900 block">No Charge</span>
                    <span className="text-xs text-gray-600">Non-billable service work</span>
                  </div>
                </label>
              </div>
            </div>
          )}

          <WorkOrderSchedulePicker
            organizationId={profile?.organization_id || undefined}
            technicians={technicians}
            technicianIds={selectedTechnicians}
            onTechniciansChange={(ids) => {
              setSelectedTechnicians(ids);
              setValidationErrors(previous => ({ ...previous, technicians: '', schedule: '' }));
            }}
            value={{ date: formData.start_date, start: formData.start_time, end: formData.end_time }}
            onChange={(slot) => {
              setFormData(previous => ({ ...previous, start_date: slot.date, start_time: slot.start, end_time: slot.end }));
              setValidationErrors(previous => ({ ...previous, start_date: '', start_time: '', end_time: '', schedule: '' }));
            }}
            onValidationChange={setScheduleError}
            earliestDate={serviceRequest?.earliest_date}
            errors={validationErrors}
          />
          {validationErrors.schedule && <p role="alert" className="text-sm text-red-600">{validationErrors.schedule}</p>}

          {/* Work Order Details */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Work Order Details</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => {
                  setFormData({ ...formData, title: e.target.value });
                  if (validationErrors.title) setValidationErrors(prev => ({ ...prev, title: '' }));
                }}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${validationErrors.title ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                placeholder="e.g., Install HVAC system, Repair unit, Warranty service call"
              />
              {validationErrors.title && <p className="text-sm text-red-600 mt-1">{validationErrors.title}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Detailed description of work to be performed"
              />
            </div>

            {/* Labor Category - hidden when in project context, required for Test & Tune */}
            {(
              <div className={salesOrderInTestTune ? 'p-4 bg-purple-50 border-2 border-purple-300 rounded-lg' : ''}>
                {salesOrderInTestTune && (
                  <div className="flex items-start gap-2 mb-3 text-sm text-purple-800">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <p>
                      <strong>Test & Tune Active:</strong> This project is in the 90-day performance tracking period.
                      Labor category selection is required to track against field labor targets.
                    </p>
                  </div>
                )}
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Labor Category {salesOrderInTestTune && <span className="text-red-600">*</span>}
                </label>
                <select
                  value={formData.labor_category_id}
                  onChange={(e) => setFormData({ ...formData, labor_category_id: e.target.value })}
                  required={salesOrderInTestTune}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="">Select labor category...</option>
                  {laborCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name} - {category.description}
                    </option>
                  ))}
                </select>
                {!salesOrderInTestTune && (
                  <p className="text-xs text-gray-500 mt-1">
                    Optional: Helps track labor efficiency and post-completion work
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority *
                </label>
                <select
                  required
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estimated Hours
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={formData.estimated_hours}
                  onChange={(e) => setFormData({ ...formData, estimated_hours: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0"
                />
              </div>
            </div>

            <details className="border border-gray-200 rounded-lg p-3">
              <summary className="min-h-11 flex items-center text-sm font-medium text-gray-700 cursor-pointer">Repeat or set a completion target</summary>
              <label className="block text-sm text-gray-700 my-3">Target completion
                <input type="date" value={formData.target_completion_date}
                  onChange={e => setFormData({ ...formData, target_completion_date: e.target.value })}
                  className="block w-full min-h-11 px-3 py-2 border border-gray-300 rounded-lg mt-1" />
              </label>
            {/* Recurrence */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                <Repeat className="w-4 h-4 text-gray-500" />
                Schedule Recurrence
              </label>
              <RecurrenceSelector
                value={recurrenceRule}
                onChange={setRecurrenceRule}
                startDate={formData.start_date || undefined}
              />
              {recurrenceRule && selectedTechnicians.length > 1 && (
                <p className="mt-1.5 text-xs text-amber-600 flex items-start gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  Recurrence is applied to the first technician's work order only. Other technicians' work orders will be single instances.
                </p>
              )}
            </div>

            </details>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (Customer Visible)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Description visible to customer"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Internal Notes
              </label>
              <textarea
                value={formData.internal_notes}
                onChange={(e) => setFormData({ ...formData, internal_notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Internal team notes (not visible to customer)"
              />
            </div>
          </div>

          {selectedTechnicians.length > 1 && <section className="space-y-3 border border-subtle rounded-lg p-4">
            <h3 className="font-semibold text-primary">Work for each technician</h3>
            <p className="text-sm text-secondary">Add tasks below, then select each technician's visit work. Shared work can be selected for more than one technician.</p>
            {selectedTechnicians.map(techId => <div key={techId} className="space-y-2 border border-subtle rounded-lg p-3">
              <h4 className="font-medium text-primary">{technicians.find(tech => tech.id === techId)?.full_name || 'Technician'}</h4>
              <select aria-label="Copy task selection from technician" value="" onChange={event => setTechnicianTaskIds(previous => ({ ...previous, [techId]: [...(previous[event.target.value] || [])] }))} className="bg-surface text-primary border border-subtle rounded-lg p-2">
                <option value="">Copy selection from...</option>
                {selectedTechnicians.filter(id => id !== techId).map(id => <option key={id} value={id}>{technicians.find(tech => tech.id === id)?.full_name}</option>)}
              </select>
              {tasks.map(task => <label key={task.id} className="flex items-center gap-2 min-h-11 text-primary text-sm">
                <input type="checkbox" checked={(technicianTaskIds[techId] || []).includes(task.id)} onChange={event => setTechnicianTaskIds(previous => ({ ...previous, [techId]: event.target.checked ? [...(previous[techId] || []), task.id] : (previous[techId] || []).filter(id => id !== task.id) }))} />{task.title}
              </label>)}
              <label className="block text-sm text-secondary">Technician visit instructions<textarea value={technicianVisitNotes[techId] || ''} onChange={event => setTechnicianVisitNotes(previous => ({ ...previous, [techId]: event.target.value }))} className="block w-full border border-subtle rounded-lg p-2 mt-1 bg-surface text-primary" /></label>
              {!tasks.length && <p className="text-sm text-muted">No tasks added yet.</p>}
            </div>)}
          </section>}
          {tasks.length > 0 && <details className="border border-subtle rounded-lg p-3"><summary className="text-sm font-medium text-primary cursor-pointer min-h-11">Task visit instructions</summary>
            {tasks.map(task => <label key={task.id} className="block text-sm text-primary my-2">{task.title}<textarea value={task.visit_instructions || ''} onChange={event => setTasks(previous => previous.map(value => value.id === task.id ? { ...value, visit_instructions: event.target.value } : value))} placeholder="Instructions for this visit; master instructions stay unchanged" className="block w-full bg-surface text-primary border border-subtle rounded-lg p-2 mt-1" /></label>)}
          </details>}

          {/* Labor Phase and Project Tasks Section - For project work orders */}
          {formData.project_id && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
                  <Briefcase className="w-5 h-5 text-blue-600" />
                  Labor Phase (Optional)
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Choose the phase for this visit to see its unfinished tasks. Select tasks to assign them to this work order.
                </p>
                <select
                  value={selectedPhaseId}
                  onChange={(e) => { setSelectedPhaseId(e.target.value); setShowAllProjectPhases(false); setSelectedProjectTasks(new Set()); }}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    validationErrors.labor_phase_id ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                >
                  <option value="">All phases</option>
                  {laborPhases.map(phase => (
                    <option key={phase.id} value={phase.id}>
                      {phase.name}
                    </option>
                  ))}
                </select>
                {validationErrors.labor_phase_id && (
                  <p className="text-xs text-red-600 mt-1">{validationErrors.labor_phase_id}</p>
                )}
              </div>

              <button type="button" onClick={() => { setShowAllProjectPhases(value => !value); setSelectedProjectTasks(new Set()); }} className="min-h-11 px-3 py-2 border border-blue-200 rounded-lg text-sm text-blue-700">{showAllProjectPhases ? 'Show this phase' : 'Browse all phases'}</button>
              {activeTaskIds.length > 0 && <p className="text-sm text-amber-700">{activeTaskIds.length} task assignments are already on active visits. Selecting them again creates deliberate shared work.</p>}
              {projectTasks.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-gray-900">
                      Unfinished project tasks ({projectTasks.length})
                    </h4>
                    <button
                      type="button"
                      onClick={handleAddSelectedProjectTasks}
                      disabled={selectedProjectTasks.size === 0}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add Selected ({selectedProjectTasks.size})
                    </button>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-2">
                    <p className="text-xs text-blue-800">
                      Choose only what needs to be done on this visit. Other project tasks remain available for reference.
                    </p>
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-2 border border-gray-200 rounded-lg p-2 bg-white">
                    {projectTasks.map(task => {
                      const isSelected = selectedProjectTasks.has(task.id);
                      const isAlreadyAdded = tasks.some(t => t.project_task_id === task.id);

                      return (
                        <label
                          key={task.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                            isAlreadyAdded
                              ? 'bg-green-50 border-green-300 opacity-60 cursor-not-allowed'
                              : isSelected
                              ? 'bg-blue-100 border-blue-500'
                              : 'bg-white border-gray-200 hover:border-blue-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isAlreadyAdded}
                            onChange={() => handleToggleProjectTask(task.id)}
                            className="mt-1 w-4 h-4 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h5 className="font-medium text-gray-900">
                                {task.title}
                              </h5>
                              {isAlreadyAdded && (
                                <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded">
                                  Added
                                </span>
                              )}
                            </div>
                            {task.description && (
                              <p className="text-sm text-gray-600 mt-1">
                                {task.description}
                              </p>
                            )}
                            {task.estimated_hours > 0 && (
                              <p className="text-xs text-gray-500 mt-1">
                                Est: {task.estimated_hours} hrs
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <p className="text-xs text-gray-600 italic">
                    Tip: Select multiple tasks and click "Add Selected" to bulk-add them to this work order
                  </p>
                </div>
              )}

              {projectTasks.length === 0 && selectedPhaseId && (
                <div className="text-center py-4 text-gray-500 text-sm">
                  <p>No open tasks found for this phase</p>
                  <p className="text-xs mt-1 text-gray-400">Only unfinished items with labor hours and an assigned labor phase are shown</p>
                </div>
              )}

              {projectTasks.length === 0 && !selectedPhaseId && (
                <div className="text-center py-4 text-gray-500 text-sm">
                  <p>Select a phase to view available tasks, or leave empty to show all project tasks</p>
                  <p className="text-xs mt-1 text-gray-400">Only unfinished items with labor hours and an assigned labor phase are shown</p>
                </div>
              )}
            </div>
          )}

          {/* Display Added Tasks for Project Work Orders */}
          {formData.type === 'project' && tasks.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  Tasks for this work order ({tasks.length})
                </h3>
                <span className="text-sm text-gray-600">
                  Est: {tasks.reduce((sum, t) => sum + t.estimated_hours, 0).toFixed(1)} hrs total
                </span>
              </div>

              <div className="space-y-2">
                {tasks.map((task) => (
                  <div key={task.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-gray-900">{task.title}</h4>
                          {task.project_task_id && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded flex items-center gap-1">
                              <Briefcase className="w-3 h-3" />
                              Project Task
                            </span>
                          )}
                        </div>
                        {task.description && (
                          <p className="text-sm text-gray-600">{task.description}</p>
                        )}
                        {task.estimated_hours > 0 && (
                          <p className="text-xs text-gray-500 mt-1">Est: {task.estimated_hours} hrs</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTask(task.id)}
                        className="flex-shrink-0 p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Remove task"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {formData.type !== 'project' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Tasks (Optional)
              </h3>
              <p className="text-sm text-gray-600">Add specific tasks that need to be completed during this work order</p>

            {tasks.length > 0 && (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div key={task.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 truncate">{task.title}</h4>
                        {task.description && (
                          <p className="text-sm text-gray-600 mt-1 break-words">{task.description}</p>
                        )}
                        {task.estimated_hours > 0 && (
                          <p className="text-xs text-gray-500 mt-1">Est: {task.estimated_hours} hrs</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTask(task.id)}
                        className="flex-shrink-0 p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Remove task"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg p-3 sm:p-4 space-y-3">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Task title *"
                className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <textarea
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="Task description (optional)"
                rows={2}
                className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={newTaskHours}
                  onChange={(e) => setNewTaskHours(e.target.value)}
                  placeholder="Est. hours"
                  className="w-full sm:w-32 px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={addTask}
                  className="w-full sm:flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                  <Plus className="w-4 h-4" />
                  Add Task
                </button>
              </div>
            </div>
            </div>
          )}

          {/* Appointment Reminders */}
          {formData.start_date && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Bell className="w-5 h-5 text-purple-600" />
                Appointment Reminders
              </h3>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.send_appointment_reminder}
                  onChange={(e) => setFormData({ ...formData, send_appointment_reminder: e.target.checked })}
                  className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm font-medium text-gray-900">Send appointment reminders to customer</span>
              </label>

              {formData.send_appointment_reminder && (
                <div className="ml-6 space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.reminder_email}
                      onChange={(e) => setFormData({ ...formData, reminder_email: e.target.checked })}
                      className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                    />
                    <Mail className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-700">Email reminder</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.reminder_sms}
                      onChange={(e) => setFormData({ ...formData, reminder_sms: e.target.checked })}
                      className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                    />
                    <MessageSquare className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-700">SMS reminder</span>
                  </label>

                  <p className="text-xs text-gray-600 mt-2">
                    Reminders will be sent 24 hours before the start date
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Parts Section */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowPartsSection(!showPartsSection)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-gray-600" />
                <span className="font-semibold text-gray-900 text-sm">Parts / Materials</span>
                {parts.length > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                    {parts.length}
                  </span>
                )}
              </div>
              {showPartsSection ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            </button>

            {showPartsSection && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-200 pt-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={partSearch}
                    onChange={(e) => {
                      setPartSearch(e.target.value);
                      searchProducts(e.target.value);
                    }}
                    placeholder="Search product catalog..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {partSearchResults.length > 0 && (
                    <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {partSearchResults.map(product => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            addPartFromCatalog(product);
                            setPartSearch('');
                            setPartSearchResults([]);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center justify-between gap-2 border-b border-gray-100 last:border-0"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">{product.name}</p>
                            {product.sku && <p className="text-xs text-gray-500">SKU: {product.sku}</p>}
                          </div>
                          {product.unit_price != null && (
                            <span className="text-sm text-gray-600 flex-shrink-0">{formatCurrency(product.unit_price)}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={addCustomPart}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add Custom Part
                </button>

                {parts.length > 0 && (
                  <div className="space-y-2">
                    {parts.map(part => (
                      <div key={part.id} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <input
                            type="text"
                            value={part.part_name}
                            onChange={(e) => updatePart(part.id, 'part_name', e.target.value)}
                            placeholder="Part name *"
                            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => removePart(part.id)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">SKU</label>
                            <input
                              type="text"
                              value={part.part_sku}
                              onChange={(e) => updatePart(part.id, 'part_sku', e.target.value)}
                              placeholder="Optional"
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Qty</label>
                            <input
                              type="number"
                              min="1"
                              value={part.quantity}
                              onChange={(e) => updatePart(part.id, 'quantity', Number(e.target.value))}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Unit Price</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={part.unit_price}
                              onChange={(e) => updatePart(part.id, 'unit_price', Number(e.target.value))}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between items-center text-sm font-medium text-gray-700 pt-1">
                      <span>{parts.length} part{parts.length !== 1 ? 's' : ''}</span>
                      <span>Total: ${parts.reduce((sum, p) => sum + (p.unit_price * p.quantity), 0).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Customer Contact Confirmation */}
          <div className={`rounded-lg p-4 border-2 transition-colors ${
            formData.customer_contacted === 'yes'
              ? 'bg-green-50 border-green-300'
              : formData.customer_contacted === 'no'
              ? 'bg-red-50 border-red-300'
              : 'bg-amber-50 border-amber-300'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <PhoneCall className={`w-4 h-4 ${
                formData.customer_contacted === 'yes' ? 'text-green-600' : formData.customer_contacted === 'no' ? 'text-red-600' : 'text-amber-600'
              }`} />
              <label className={`font-semibold text-sm ${
                formData.customer_contacted === 'yes' ? 'text-green-800' : formData.customer_contacted === 'no' ? 'text-red-800' : 'text-amber-800'
              }`}>
                Has the customer been contacted? <span className="text-red-500">*</span>
              </label>
            </div>
            <select
              value={formData.customer_contacted}
              onChange={(e) => setFormData({ ...formData, customer_contacted: e.target.value })}
              required
              className={`w-full px-3 py-2 border rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                formData.customer_contacted === 'yes'
                  ? 'border-green-300 bg-white text-green-800'
                  : formData.customer_contacted === 'no'
                  ? 'border-red-300 bg-white text-red-800'
                  : 'border-amber-300 bg-white text-amber-800'
              }`}
            >
              <option value="">-- Select --</option>
              <option value="yes">Yes — customer is aware of this visit</option>
              <option value="no">No — customer has not been contacted</option>
            </select>
            {formData.customer_contacted === 'no' && (
              <p className="text-xs text-red-600 mt-1.5 font-medium">
                This work order will be flagged as "Not Contacted" until updated.
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4 border-t sticky bottom-0 bg-white -mx-4 sm:-mx-6 px-4 sm:px-6 pb-4 sm:pb-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:flex-1 px-4 py-2.5 sm:py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm sm:text-base font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || selectedTechnicians.length === 0 || Boolean(scheduleError)}
              className="w-full sm:flex-1 px-4 py-2.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm sm:text-base font-medium"
            >
              {loading ? 'Creating...' : `Create ${selectedTechnicians.length > 1 ? `${selectedTechnicians.length} Work Orders` : 'Work Order'}`}
            </button>
          </div>
        </form>
      </div>


    </div>
  );
}
