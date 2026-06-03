import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ChevronLeft, ChevronRight, Calendar, Clock, User, AlertTriangle } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

interface ScheduleViewerProps {
  selectedTechnicianIds: string[];
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  onTimeSlotClick?: (date: string, startTime: string, endTime: string) => void;
  browseMode?: boolean;
  onTechnicianClick?: (technicianId: string) => void;
  /** When true the viewer is inside the full-screen AvailabilityBrowserModal —
   *  default to day view and skip the bottom legend / empty-state gate. */
  fullScreenMode?: boolean;
}

interface ScheduleItem {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  type: 'work_order' | 'appointment';
  status: string;
  technician_id: string;
  technician_name: string;
  customer_name?: string;
  priority?: string;
}

interface Technician {
  id: string;
  full_name: string;
}

const TIME_SLOTS = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
];

// Convert 24-hour time to 12-hour format with AM/PM
function formatTime12Hour(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Color palette for multiple technicians
const TECH_COLORS = [
  { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-800', ring: 'ring-blue-300', name: 'blue' },
  { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-800', ring: 'ring-green-300', name: 'green' },
  { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-800', ring: 'ring-purple-300', name: 'purple' },
  { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-800', ring: 'ring-orange-300', name: 'orange' },
  { bg: 'bg-pink-100', border: 'border-pink-400', text: 'text-pink-800', ring: 'ring-pink-300', name: 'pink' },
  { bg: 'bg-teal-100', border: 'border-teal-400', text: 'text-teal-800', ring: 'ring-teal-300', name: 'teal' },
  { bg: 'bg-red-100', border: 'border-red-400', text: 'text-red-800', ring: 'ring-red-300', name: 'red' },
  { bg: 'bg-indigo-100', border: 'border-indigo-400', text: 'text-indigo-800', ring: 'ring-indigo-300', name: 'indigo' },
];

export function ScheduleViewer({ selectedTechnicianIds, selectedDate, onDateChange, onTimeSlotClick, browseMode = false, onTechnicianClick, fullScreenMode = false }: ScheduleViewerProps) {
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'grid'>(fullScreenMode ? 'day' : browseMode ? 'grid' : 'week');
  const [currentDate, setCurrentDate] = useState<Date>(
    selectedDate ? new Date(selectedDate) : new Date()
  );
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [techColorMap, setTechColorMap] = useState<Record<string, typeof TECH_COLORS[0]>>({});
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedSlot, setSelectedSlot] = useState<{
    date: string;
    startTime: string;
    endTime: string;
    techId?: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartSlot, setDragStartSlot] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  // Update current time every minute for the red line indicator
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedDate) {
      setCurrentDate(new Date(selectedDate));
    }
  }, [selectedDate]);

  useEffect(() => {
    loadTechnicians();
    loadSchedule();
  }, [selectedTechnicianIds, currentDate, viewMode]);

  // Keyboard shortcuts for quick view switching
  useEffect(() => {
    function handleKeyPress(e: KeyboardEvent) {
      // Only handle shortcuts when not typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setViewMode('day');
      } else if (e.key === 'w' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setViewMode('week');
      } else if (e.key === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setViewMode('month');
      } else if (e.key === 'l' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setViewMode('grid');
      } else if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setCurrentDate(new Date());
        if (onDateChange) {
          onDateChange(new Date().toISOString().split('T')[0]);
        }
      }
    }

    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, [onDateChange]);

  async function loadTechnicians() {
    if (selectedTechnicianIds.length === 0) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', selectedTechnicianIds);

      if (error) throw error;
      setTechnicians(data || []);

      // Assign colors to each technician (only if multiple selected)
      if (selectedTechnicianIds.length > 1) {
        const colorMap: Record<string, typeof TECH_COLORS[0]> = {};
        selectedTechnicianIds.forEach((techId, index) => {
          colorMap[techId] = TECH_COLORS[index % TECH_COLORS.length];
        });
        setTechColorMap(colorMap);
      } else {
        setTechColorMap({});
      }
    } catch (error) {
      console.error('Error loading technicians:', error);
    }
  }

  async function loadSchedule() {
    if (selectedTechnicianIds.length === 0) {
      setScheduleItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const startDate = getStartDate();
      const endDate = getEndDate();

      const [workOrders, appointments] = await Promise.all([
        loadWorkOrders(startDate, endDate),
        loadAppointments(startDate, endDate)
      ]);

      setScheduleItems([...workOrders, ...appointments]);
    } catch (error) {
      console.error('Error loading schedule:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkOrders(startDate: string, endDate: string): Promise<ScheduleItem[]> {
    const { data, error } = await supabase
      .from('work_orders')
      .select(`
        id,
        title,
        start_date,
        start_time,
        end_time,
        status,
        priority,
        assigned_to,
        contact_id,
        contacts (
          full_name,
          company_name
        ),
        profiles!work_orders_assigned_to_fkey (
          full_name
        )
      `)
      .in('assigned_to', selectedTechnicianIds)
      .gte('start_date', startDate)
      .lte('start_date', endDate)
      .not('status', 'in', '("completed","cancelled","archived")');

    if (error) throw error;

    return (data || []).map((wo: any) => ({
      id: wo.id,
      title: wo.title,
      date: wo.start_date,
      start_time: wo.start_time || '08:00',
      end_time: wo.end_time || '17:00',
      type: 'work_order' as const,
      status: wo.status,
      technician_id: wo.assigned_to,
      technician_name: wo.profiles?.full_name || 'Unknown',
      customer_name: wo.contacts?.full_name || wo.contacts?.company_name || 'Unknown',
      priority: wo.priority
    }));
  }

  async function loadAppointments(startDate: string, endDate: string): Promise<ScheduleItem[]> {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id,
        title,
        appointment_date,
        start_time,
        end_time,
        status,
        customer_name,
        technician_id,
        profiles!appointments_technician_id_fkey (
          full_name
        )
      `)
      .in('technician_id', selectedTechnicianIds)
      .gte('appointment_date', startDate)
      .lte('appointment_date', endDate)
      .not('status', 'eq', 'cancelled');

    if (error) throw error;

    return (data || []).map((apt: any) => ({
      id: apt.id,
      title: apt.title,
      date: apt.appointment_date,
      start_time: apt.start_time,
      end_time: apt.end_time,
      type: 'appointment' as const,
      status: apt.status,
      technician_id: apt.technician_id,
      technician_name: apt.profiles?.full_name || 'Unknown',
      customer_name: apt.customer_name
    }));
  }

  function getStartDate(): string {
    if (viewMode === 'day') {
      return currentDate.toISOString().split('T')[0];
    } else if (viewMode === 'month') {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      start.setDate(start.getDate() - start.getDay()); // Start from Sunday of first week
      return start.toISOString().split('T')[0];
    } else {
      const start = new Date(currentDate);
      start.setDate(start.getDate() - start.getDay());
      return start.toISOString().split('T')[0];
    }
  }

  function getEndDate(): string {
    if (viewMode === 'day') {
      return currentDate.toISOString().split('T')[0];
    } else if (viewMode === 'month') {
      const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const end = new Date(lastDay);
      end.setDate(end.getDate() + (6 - end.getDay())); // End on Saturday of last week
      return end.toISOString().split('T')[0];
    } else {
      const end = new Date(currentDate);
      end.setDate(end.getDate() - end.getDay() + 6);
      return end.toISOString().split('T')[0];
    }
  }

  function getDaysInView(): Date[] {
    if (viewMode === 'day') {
      return [currentDate];
    } else if (viewMode === 'month') {
      const days: Date[] = [];
      const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const startDate = new Date(firstDay);
      startDate.setDate(startDate.getDate() - startDate.getDay()); // Start from Sunday

      // Get 6 weeks (42 days) to cover the whole month view
      for (let i = 0; i < 42; i++) {
        const day = new Date(startDate);
        day.setDate(startDate.getDate() + i);
        days.push(day);
      }
      return days;
    } else {
      const days: Date[] = [];
      const start = new Date(currentDate);
      start.setDate(start.getDate() - start.getDay());

      for (let i = 0; i < 7; i++) {
        const day = new Date(start);
        day.setDate(start.getDate() + i);
        days.push(day);
      }
      return days;
    }
  }

  function navigateDate(direction: 'prev' | 'next') {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    } else if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    } else {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    }
    setCurrentDate(newDate);
    if (onDateChange) {
      onDateChange(newDate.toISOString().split('T')[0]);
    }
  }

  function getItemsForDateTechAndTime(techId: string, date: Date, timeSlot: string): ScheduleItem[] {
    const dateStr = date.toISOString().split('T')[0];
    return scheduleItems.filter(item => {
      if (item.technician_id !== techId) return false;
      if (item.date !== dateStr) return false;

      const itemStartTime = item.start_time.substring(0, 5);
      const itemEndTime = item.end_time.substring(0, 5);
      const slotTime = timeSlot;

      // Check if this time slot overlaps with the item's time range
      return itemStartTime <= slotTime && itemEndTime > slotTime;
    });
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'completed':
        return 'bg-green-100 border-green-400 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 border-blue-400 text-blue-800';
      case 'assigned':
        return 'bg-yellow-100 border-yellow-400 text-yellow-800';
      case 'pending':
        return 'bg-gray-100 border-gray-400 text-gray-800';
      default:
        return 'bg-gray-100 border-gray-400 text-gray-800';
    }
  }

  // Get color for an item - use technician color if multiple techs selected, otherwise use status color
  function getItemColor(item: ScheduleItem): string {
    if (selectedTechnicianIds.length > 1 && techColorMap[item.technician_id]) {
      const techColor = techColorMap[item.technician_id];
      return `${techColor.bg} ${techColor.border} ${techColor.text}`;
    }
    return getStatusColor(item.status);
  }

  function getPriorityColor(priority?: string): string {
    switch (priority) {
      case 'urgent':
        return 'text-red-600';
      case 'high':
        return 'text-orange-600';
      case 'medium':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  }

  // Check if a date is today
  function isToday(date: Date): boolean {
    const today = currentTime;
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  // Get current time as a string in HH:MM format
  function getCurrentTimeString(): string {
    return `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
  }

  // Calculate the position of the current time indicator (0-100%)
  function getCurrentTimePosition(): number {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    // Calendar starts at 6:00 (360 minutes) and goes to 20:00 (1200 minutes)
    const startMinutes = 6 * 60; // 6:00 AM
    const endMinutes = 20 * 60;   // 8:00 PM
    const rangeMinutes = endMinutes - startMinutes;

    if (totalMinutes < startMinutes || totalMinutes > endMinutes) {
      return -1; // Outside visible range
    }

    return ((totalMinutes - startMinutes) / rangeMinutes) * 100;
  }

  function handleDateClick(date: Date, shouldDrillDown: boolean = false) {
    setCurrentDate(date);
    if (onDateChange) {
      onDateChange(date.toISOString().split('T')[0]);
    }

    // If drill-down requested, switch to day view to see time slots
    if (shouldDrillDown && (viewMode === 'month' || viewMode === 'grid')) {
      setViewMode('day');
    }
  }

  function handleTimeSlotClick(date: Date, timeSlot: string, hasItems: boolean, techId?: string) {
    // Don't allow clicking on slots that already have items (unless in browse mode)
    if (hasItems && !browseMode) return;

    const dateStr = date.toISOString().split('T')[0];
    const startTime = timeSlot;

    // Calculate end time (default to 1 hour later)
    const [hours, minutes] = timeSlot.split(':').map(Number);
    const endHours = (hours + 1) % 24;
    const endTime = `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    // Check if this is in the past
    const now = new Date();
    const selectedDateTime = new Date(date);
    selectedDateTime.setHours(hours, minutes, 0, 0);

    const isPast = selectedDateTime < now;

    const proceedWithSlot = () => {
      setSelectedSlot({
        date: dateStr,
        startTime,
        endTime,
        techId
      });

      if (onTimeSlotClick) {
        onTimeSlotClick(dateStr, startTime, endTime);
      }

      setCurrentDate(date);
      if (onDateChange) {
        onDateChange(dateStr);
      }
    };

    if (isPast) {
      setConfirmModal({
        title: 'Past Time Slot',
        message:
          `⚠️ This time slot is in the past.\n\n` +
          `Selected: ${dateStr} at ${formatTime12Hour(startTime)}\n` +
          `Current time: ${now.toLocaleString()}\n\n` +
          `Do you want to create a work order for this past time?\n` +
          `(This is useful for record-keeping)`,
        onConfirm: proceedWithSlot
      });
      return;
    }

    proceedWithSlot();
  }

  function handleSlotMouseDown(date: Date, timeSlot: string, hasItems: boolean, techId?: string) {
    if (hasItems && !browseMode) return;

    setIsDragging(true);
    setDragStartSlot(timeSlot);
    handleTimeSlotClick(date, timeSlot, hasItems, techId);
  }

  function handleSlotMouseEnter(date: Date, timeSlot: string, hasItems: boolean, techId?: string) {
    if (!isDragging || hasItems || !selectedSlot || !dragStartSlot) return;

    const dateStr = date.toISOString().split('T')[0];
    if (dateStr !== selectedSlot.date) return;

    // Calculate new end time based on drag
    const startIdx = TIME_SLOTS.indexOf(dragStartSlot);
    const currentIdx = TIME_SLOTS.indexOf(timeSlot);

    if (currentIdx >= startIdx) {
      // Dragging down - extend end time
      const [hours, minutes] = timeSlot.split(':').map(Number);
      const endHours = (hours + 1) % 24;
      const endTime = `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

      setSelectedSlot({
        ...selectedSlot,
        endTime
      });

      if (onTimeSlotClick) {
        onTimeSlotClick(dateStr, selectedSlot.startTime, endTime);
      }
    }
  }

  function handleMouseUp() {
    setIsDragging(false);
    setDragStartSlot(null);
  }

  // Check if a slot is within the selected range
  function isSlotSelected(date: Date, timeSlot: string, techId?: string): boolean {
    if (!selectedSlot) return false;

    const dateStr = date.toISOString().split('T')[0];
    if (dateStr !== selectedSlot.date) return false;
    if (techId && selectedSlot.techId && techId !== selectedSlot.techId) return false;

    const slotTime = timeSlot;
    return slotTime >= selectedSlot.startTime && slotTime < selectedSlot.endTime;
  }

  const days = getDaysInView();

  return (
    <div className="space-y-4">
      {/* Enhanced Navigation Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-gradient-to-r from-blue-50 to-gray-50 p-4 rounded-lg border border-blue-100">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-blue-600" />
          <div>
            <h3 className="font-semibold text-gray-900">Schedule Calendar</h3>
            <p className="text-xs text-gray-600">
              {viewMode === 'day' && 'Viewing hourly time slots'}
              {viewMode === 'week' && 'Viewing full week layout'}
              {viewMode === 'month' && 'Viewing full month overview'}
              {viewMode === 'grid' && 'Viewing technician workload'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
            <button
              type="button"
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                viewMode === 'day'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              title="Day View - See detailed hourly time slots (Press D)"
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                viewMode === 'week'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              title="Week View - See full week to plan around existing jobs (Press W)"
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                viewMode === 'month'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              title="Month View - See full month to find the best dates (Press M)"
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                viewMode === 'grid'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              title="List View - See tech availability and workload summary (Press L)"
            >
              List
            </button>
          </div>

          {/* Date Navigation */}
          <div className="flex items-center gap-2 bg-white rounded-lg p-1 shadow-sm border border-gray-200">
            <button
              type="button"
              onClick={() => navigateDate('prev')}
              className="p-2 hover:bg-gray-100 rounded transition-colors"
              title={`Previous ${viewMode === 'day' ? 'day' : viewMode === 'week' ? 'week' : viewMode === 'month' ? 'month' : 'week'}`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="text-sm font-semibold text-gray-900 min-w-[160px] text-center px-2">
              {viewMode === 'day'
                ? currentDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                : viewMode === 'month'
                  ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  : `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              }
            </div>

            <button
              type="button"
              onClick={() => navigateDate('next')}
              className="p-2 hover:bg-gray-100 rounded transition-colors"
              title={`Next ${viewMode === 'day' ? 'day' : viewMode === 'week' ? 'week' : viewMode === 'month' ? 'month' : 'week'}`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Today Button */}
          <button
            type="button"
            onClick={() => {
              setCurrentDate(new Date());
              if (onDateChange) {
                onDateChange(new Date().toISOString().split('T')[0]);
              }
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
            title="Jump to today's date"
          >
            Today
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          <p className="mt-2 text-gray-600">Loading schedule...</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto">
            {viewMode === 'grid' ? (
              // Grid View: Technicians as rows, days as columns
              <table className="w-full border-collapse min-w-full">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="sticky left-0 z-10 bg-gray-50 px-3 py-3 text-left text-xs font-semibold text-gray-600 w-40 border-r">
                      Technician
                    </th>
                    {days.map((day, idx) => {
                      const isToday = day.toDateString() === new Date().toDateString();
                      return (
                        <th
                          key={idx}
                          className={`px-3 py-3 text-center text-xs font-semibold border-l min-w-[140px] cursor-pointer hover:bg-blue-100 transition-colors ${
                            isToday ? 'bg-blue-50 text-blue-900' : 'text-gray-900'
                          }`}
                          onClick={() => handleDateClick(day, true)}
                          title="Click to view day schedule with time slots"
                        >
                          <div className="space-y-1">
                            <div className="text-xs text-gray-500">{DAYS_OF_WEEK[day.getDay()]}</div>
                            <div className={`text-sm font-bold ${isToday ? 'text-blue-600' : ''}`}>
                              {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </div>
                            <div className="text-[10px] text-blue-600 font-normal">Click for times</div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {technicians.map(tech => {
                    const techItems = scheduleItems.filter(item => item.technician_id === tech.id);
                    return (
                      <tr
                        key={tech.id}
                        className={`border-b hover:bg-gray-50 transition-colors ${
                          browseMode && onTechnicianClick ? 'cursor-pointer' : ''
                        }`}
                        onClick={() => browseMode && onTechnicianClick && onTechnicianClick(tech.id)}
                      >
                        <td className="sticky left-0 z-10 bg-white px-3 py-3 border-r">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-600" />
                            <span className="text-sm font-medium text-gray-900">{tech.full_name}</span>
                            {browseMode && (
                              <span className="text-xs text-blue-600">(click)</span>
                            )}
                          </div>
                        </td>
                        {days.map((day, idx) => {
                          const dayStart = new Date(day);
                          dayStart.setHours(0, 0, 0, 0);
                          const dayEnd = new Date(day);
                          dayEnd.setHours(23, 59, 59, 999);

                          const dayItems = techItems.filter(item => {
                            const itemDate = new Date(item.start_date);
                            return itemDate >= dayStart && itemDate <= dayEnd;
                          });

                          const isToday = day.toDateString() === new Date().toDateString();
                          const completedCount = dayItems.filter(i => i.status === 'completed').length;
                          const inProgressCount = dayItems.filter(i => i.status === 'in_progress').length;
                          const assignedCount = dayItems.filter(i => i.status === 'assigned').length;
                          const totalHours = dayItems.reduce((sum, item) => sum + (item.estimated_hours || 0), 0);

                          return (
                            <td
                              key={idx}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDateClick(day, true);
                              }}
                              className={`px-3 py-3 border-l align-top cursor-pointer hover:bg-blue-50 transition-colors ${isToday ? 'bg-blue-50/30' : ''}`}
                              title="Click to view day schedule with time slots"
                            >
                              {dayItems.length > 0 ? (
                                <div className="space-y-2">
                                  <div className="flex flex-wrap gap-1">
                                    {completedCount > 0 && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium">
                                        ✓ {completedCount}
                                      </span>
                                    )}
                                    {inProgressCount > 0 && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                                        ▶ {inProgressCount}
                                      </span>
                                    )}
                                    {assignedCount > 0 && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
                                        ⏱ {assignedCount}
                                      </span>
                                    )}
                                  </div>
                                  {totalHours > 0 && (
                                    <div className="text-xs text-gray-600 font-medium">
                                      {totalHours}h scheduled
                                    </div>
                                  )}
                                  <div className="space-y-1">
                                    {dayItems.slice(0, 2).map(item => (
                                      <div
                                        key={item.id}
                                        className="text-xs text-gray-700 truncate"
                                        title={item.title}
                                      >
                                        • {item.title}
                                      </div>
                                    ))}
                                    {dayItems.length > 2 && (
                                      <div className="text-xs text-gray-500 italic">
                                        +{dayItems.length - 2} more
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-xs text-blue-400 italic text-center py-2 font-medium">
                                  Click to view times
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : viewMode === 'day' ? (
              // Day View: Google Calendar style with hours on left side
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                {/* Header with date and technicians */}
                <div className="grid gap-px bg-gray-200 border-b-2 border-gray-300" style={{ gridTemplateColumns: `100px repeat(${technicians.length}, 1fr)` }}>
                  <div className="bg-gradient-to-r from-gray-100 to-gray-50 px-4 py-4">
                    <div className="text-sm font-bold text-gray-800">
                      {currentDate.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div className="text-lg font-bold text-gray-900">
                      {currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  {technicians.map(tech => (
                    <div
                      key={tech.id}
                      className={`bg-gray-50 px-4 py-4 text-center border-l border-gray-200 ${
                        browseMode && onTechnicianClick ? 'cursor-pointer hover:bg-blue-100 transition-colors' : ''
                      }`}
                      onClick={() => browseMode && onTechnicianClick && onTechnicianClick(tech.id)}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <User className="w-4 h-4 text-gray-600" />
                        <span className="text-sm font-semibold text-gray-900 truncate">{tech.full_name}</span>
                        {browseMode && (
                          <span className="text-blue-600 text-xs">(click)</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Time grid - Hours displayed vertically like Google Calendar */}
                <div className="relative" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
                  {TIME_SLOTS.map((timeSlot, idx) => (
                    <div
                      key={timeSlot}
                      className="grid gap-px bg-gray-100"
                      style={{ gridTemplateColumns: `100px repeat(${technicians.length}, 1fr)` }}
                    >
                      {/* Hour label on the left */}
                      <div className="bg-white px-4 py-4 border-r border-t border-gray-200 sticky left-0 z-10">
                        <div className="text-sm font-semibold text-gray-700">
                          {formatTime12Hour(timeSlot)}
                        </div>
                      </div>

                      {/* Technician time slots */}
                      {technicians.map(tech => {
                        const items = getItemsForDateTechAndTime(tech.id, currentDate, timeSlot);
                        const hasItems = items.length > 0;
                        const isSelected = isSlotSelected(currentDate, timeSlot, tech.id);
                        return (
                          <div
                            key={`${timeSlot}-${tech.id}`}
                            onMouseDown={() => handleSlotMouseDown(currentDate, timeSlot, hasItems, tech.id)}
                            onMouseEnter={() => handleSlotMouseEnter(currentDate, timeSlot, hasItems, tech.id)}
                            className={`group relative px-3 py-4 min-h-[80px] border-t border-l border-gray-100 ${
                              isSelected
                                ? 'bg-blue-500 ring-4 ring-blue-300 ring-inset'
                                : hasItems
                                ? 'bg-white'
                                : 'bg-white cursor-pointer hover:bg-gradient-to-br hover:from-blue-50 hover:to-blue-100'
                            } transition-all duration-200 select-none`}
                          >
                            {hasItems ? (
                              <div className="space-y-2">
                                {items.map(item => (
                                  <div
                                    key={item.id}
                                    className={`p-2 rounded-lg border-l-4 ${getItemColor(item)} shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer`}
                                    title={`${item.title}\n${item.customer_name || ''}\n${item.start_time} - ${item.end_time}\n${item.technician_name}\nStatus: ${item.status}`}
                                  >
                                    <div className="font-semibold text-sm flex items-center gap-1 mb-1">
                                      {item.priority && (
                                        <AlertTriangle className={`w-3 h-3 flex-shrink-0 ${getPriorityColor(item.priority)}`} />
                                      )}
                                      <span className="line-clamp-1">{item.title}</span>
                                    </div>
                                    <div className="text-xs text-gray-700 line-clamp-1 mb-1">
                                      {item.customer_name}
                                    </div>
                                    <div className="text-xs text-gray-600 flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      <span className="font-medium">{formatTime12Hour(item.start_time)}</span>
                                      <span>-</span>
                                      <span className="font-medium">{formatTime12Hour(item.end_time)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className={`h-full flex flex-col items-center justify-center text-xs transition-colors ${
                                isSelected ? 'text-white' : 'text-gray-400 group-hover:text-blue-600'
                              }`}>
                                {isSelected ? (
                                  <>
                                    <Clock className="w-6 h-6 mb-2 text-white" />
                                    <span className="text-sm font-bold text-white">
                                      {formatTime12Hour(selectedSlot!.startTime)} - {formatTime12Hour(selectedSlot!.endTime)}
                                    </span>
                                    <span className="text-xs text-blue-100 mt-1">Selected</span>
                                  </>
                                ) : (
                                  <>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 mb-1">
                                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md">+</div>
                                    </div>
                                    <span className="text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">Click to schedule</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Current Time Indicator - Red Line */}
                  {isToday(currentDate) && getCurrentTimePosition() >= 0 && (
                    <div
                      className="absolute left-0 right-0 z-20 pointer-events-none"
                      style={{ top: `${getCurrentTimePosition()}%` }}
                    >
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-lg"></div>
                        <div className="flex-1 h-0.5 bg-red-500 shadow-md"></div>
                        <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded shadow-lg">
                          {formatTime12Hour(getCurrentTimeString())}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : viewMode === 'week' ? (
              // Week View: Google Calendar style with hours on left, days as columns
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                {/* Header with days of the week */}
                <div className="grid gap-px bg-gray-200 border-b-2 border-gray-300" style={{ gridTemplateColumns: '100px repeat(7, 1fr)' }}>
                  <div className="bg-gradient-to-r from-gray-100 to-gray-50 px-4 py-4 text-xs font-semibold text-gray-600">
                    Week
                  </div>
                  {days.map((day, idx) => {
                    const isToday = day.toDateString() === new Date().toDateString();
                    return (
                      <div
                        key={idx}
                        className={`bg-gray-50 px-3 py-4 text-center border-l border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors ${
                          isToday ? 'bg-blue-100' : ''
                        }`}
                        onClick={() => handleDateClick(day)}
                      >
                        <div className="text-xs text-gray-600 font-semibold mb-1">
                          {DAYS_OF_WEEK[day.getDay()]}
                        </div>
                        <div className={`text-xl font-bold ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                          {day.getDate()}
                        </div>
                        <div className="text-xs text-gray-500">
                          {day.toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Time grid - Hours displayed vertically */}
                <div className="relative" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
                  {TIME_SLOTS.map(timeSlot => (
                    <div
                      key={timeSlot}
                      className="grid gap-px bg-gray-100"
                      style={{ gridTemplateColumns: '100px repeat(7, 1fr)' }}
                    >
                      {/* Hour label on the left */}
                      <div className="bg-white px-4 py-4 border-r border-t border-gray-200 sticky left-0 z-10">
                        <div className="text-sm font-semibold text-gray-700">
                          {formatTime12Hour(timeSlot)}
                        </div>
                      </div>

                      {/* Day columns */}
                      {days.map((day, idx) => {
                        const allItems = technicians.flatMap(tech =>
                          getItemsForDateTechAndTime(tech.id, day, timeSlot)
                        );
                        const isTodayCell = day.toDateString() === new Date().toDateString();
                        const hasItems = allItems.length > 0;
                        const isSelected = isSlotSelected(day, timeSlot);

                        return (
                          <div
                            key={`${timeSlot}-${idx}`}
                            onMouseDown={() => handleSlotMouseDown(day, timeSlot, hasItems)}
                            onMouseEnter={() => handleSlotMouseEnter(day, timeSlot, hasItems)}
                            className={`group relative px-2 py-3 min-h-[70px] border-t border-l border-gray-100 ${
                              isSelected
                                ? 'bg-blue-500 ring-4 ring-blue-300 ring-inset'
                                : isTodayCell
                                ? 'bg-blue-50/20'
                                : 'bg-white'
                            } ${!hasItems && !isSelected ? 'cursor-pointer hover:bg-gradient-to-br hover:from-blue-50 hover:to-blue-100' : ''} transition-all duration-200 select-none`}
                          >
                            {hasItems ? (
                              <div className="space-y-1">
                                {allItems.slice(0, 2).map(item => (
                                  <div
                                    key={item.id}
                                    className={`p-1.5 rounded-lg border-l-4 ${getItemColor(item)} shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer`}
                                    title={`${item.title}\n${item.customer_name || ''}\n${item.technician_name}\n${formatTime12Hour(item.start_time)} - ${formatTime12Hour(item.end_time)}\nStatus: ${item.status}`}
                                  >
                                    <div className="font-semibold text-xs flex items-center gap-1">
                                      {item.priority && (
                                        <AlertTriangle className={`w-2.5 h-2.5 flex-shrink-0 ${getPriorityColor(item.priority)}`} />
                                      )}
                                      <span className="line-clamp-1">{item.title}</span>
                                    </div>
                                    <div className="text-[10px] text-gray-700 truncate">
                                      {item.technician_name}
                                    </div>
                                  </div>
                                ))}
                                {allItems.length > 2 && (
                                  <div className="text-[10px] text-gray-500 font-medium text-center py-1 hover:text-blue-600 cursor-pointer">
                                    +{allItems.length - 2} more
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className={`h-full flex flex-col items-center justify-center text-xs transition-colors ${
                                isSelected ? 'text-white' : 'text-gray-400 group-hover:text-blue-600'
                              }`}>
                                {isSelected ? (
                                  <>
                                    <Clock className="w-5 h-5 mb-1 text-white" />
                                    <span className="text-[11px] font-bold text-white text-center">
                                      {formatTime12Hour(selectedSlot!.startTime)}
                                    </span>
                                    <span className="text-[11px] font-bold text-white text-center">
                                      {formatTime12Hour(selectedSlot!.endTime)}
                                    </span>
                                    <span className="text-[9px] text-blue-100 mt-0.5">Selected</span>
                                  </>
                                ) : (
                                  <>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                      <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md">+</div>
                                    </div>
                                    <span className="text-[9px] mt-1 font-medium opacity-0 group-hover:opacity-100 transition-opacity">Add</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Current Time Indicator - Red Line for Week View */}
                  {days.some(day => isToday(day)) && getCurrentTimePosition() >= 0 && (
                    <div
                      className="absolute left-0 right-0 z-20 pointer-events-none"
                      style={{ top: `${getCurrentTimePosition()}%` }}
                    >
                      <div className="grid gap-px" style={{ gridTemplateColumns: '100px repeat(7, 1fr)' }}>
                        <div></div>
                        {days.map((day, idx) => (
                          <div key={idx}>
                            {isToday(day) && (
                              <div className="flex items-center">
                                <div className="w-2 h-2 bg-red-500 rounded-full border border-white shadow-md"></div>
                                <div className="flex-1 h-0.5 bg-red-500 shadow-md"></div>
                                {idx === days.findIndex(d => isToday(d)) && (
                                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap">
                                    {formatTime12Hour(getCurrentTimeString())}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : viewMode === 'month' ? (
              // Month View: Calendar grid like Google Calendar
              <div className="grid grid-cols-7 gap-px bg-gray-200">
                {/* Day headers */}
                {DAYS_OF_WEEK.map(day => (
                  <div key={day} className="bg-gray-50 px-2 py-3 text-center text-xs font-semibold text-gray-600">
                    {day}
                  </div>
                ))}

                {/* Calendar days */}
                {days.map((day, idx) => {
                  const isToday = day.toDateString() === new Date().toDateString();
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                  const dayItems = scheduleItems.filter(item => {
                    const itemDate = new Date(item.date);
                    return itemDate.toDateString() === day.toDateString();
                  });

                  return (
                    <div
                      key={idx}
                      onClick={() => handleDateClick(day, true)}
                      className={`group relative bg-white min-h-[120px] p-2 cursor-pointer hover:bg-gradient-to-br hover:from-blue-50 hover:to-blue-100 transition-all duration-200 ${
                        isToday ? 'ring-2 ring-blue-500 ring-inset' : ''
                      } ${!isCurrentMonth ? 'bg-gray-50/50' : ''}`}
                      title="Click to view full day schedule"
                    >
                      <div className={`text-sm font-medium mb-1 ${
                        isToday
                          ? 'bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center mx-auto'
                          : isCurrentMonth
                            ? 'text-gray-900'
                            : 'text-gray-400'
                      }`}>
                        {day.getDate()}
                      </div>

                      {dayItems.length > 0 ? (
                        <div className="space-y-1">
                          {dayItems.slice(0, 3).map(item => (
                            <div
                              key={item.id}
                              className={`text-xs p-1 rounded truncate ${getItemColor(item)} hover:shadow-md hover:scale-[1.02] transition-all duration-200 cursor-pointer`}
                              title={`${item.title}\n${item.technician_name}\n${item.start_time || ''} - ${item.end_time || ''}`}
                            >
                              <div className="flex items-center gap-1">
                                {item.priority && (
                                  <AlertTriangle className={`w-2.5 h-2.5 flex-shrink-0 ${getPriorityColor(item.priority)}`} />
                                )}
                                <span className="truncate font-medium">{item.title}</span>
                              </div>
                              <div className="text-xs opacity-75 truncate">
                                {item.technician_name}
                              </div>
                            </div>
                          ))}
                          {dayItems.length > 3 && (
                            <div className="text-xs text-gray-500 font-medium text-center hover:text-blue-600 cursor-pointer">
                              +{dayItems.length - 3} more
                            </div>
                          )}
                        </div>
                      ) : isCurrentMonth ? (
                        <div className="flex flex-col items-center justify-center mt-8 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mb-1">+</div>
                          <div className="text-[10px] text-blue-600 font-medium">Click to schedule</div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {!fullScreenMode && <div className="flex items-start gap-2 text-xs text-gray-600 bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-lg p-3 shadow-sm">
        <AlertTriangle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-blue-900 mb-2">Google Calendar-Style Interface:</p>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <p className="font-medium text-gray-700 mb-1">
                {selectedTechnicianIds.length > 1 ? 'Technician Colors:' : 'Visual Cues:'}
              </p>
              <ul className="space-y-1">
                {selectedTechnicianIds.length > 1 ? (
                  <>
                    {technicians.map(tech => {
                      const color = techColorMap[tech.id];
                      if (!color) return null;
                      return (
                        <li key={tech.id} className="flex items-center gap-2">
                          <span className={`inline-block w-3 h-3 ${color.bg} border ${color.border} rounded`}></span>
                          <span className="font-medium">{tech.full_name}</span>
                        </li>
                      );
                    })}
                    <li className="text-blue-700 font-medium mt-2">
                      Each tech's schedule shown in their own color
                    </li>
                  </>
                ) : (
                  <>
                    <li><span className="inline-block w-3 h-3 bg-green-100 border border-green-400 rounded mr-1"></span>Green = Completed</li>
                    <li><span className="inline-block w-3 h-3 bg-blue-100 border border-blue-400 rounded mr-1"></span>Blue = In Progress</li>
                    <li><span className="inline-block w-3 h-3 bg-yellow-100 border border-yellow-400 rounded mr-1"></span>Yellow = Assigned</li>
                    <li className="text-blue-700 font-medium mt-2">Hover over any slot to see the <span className="inline-block w-3 h-3 bg-blue-500 text-white rounded-full text-center">+</span> icon</li>
                  </>
                )}
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-700 mb-1">Quick Actions:</p>
              <ul className="space-y-1">
                {viewMode === 'day' && (
                  <>
                    <li className="text-blue-700 font-medium">Hover to see <span className="text-blue-500">+</span> button, click to schedule</li>
                    <li>Switch to Week/Month for broader context</li>
                  </>
                )}
                {viewMode === 'week' && (
                  <>
                    <li className="text-blue-700 font-medium">Hover any open slot to see <span className="text-blue-500">+</span> button</li>
                    <li>See the full week to find gaps and optimize</li>
                  </>
                )}
                {viewMode === 'month' && (
                  <>
                    <li className="text-blue-700 font-medium">Hover over empty days to see <span className="text-blue-500">+</span> button</li>
                    <li>Click any day to drill into hourly time slots</li>
                  </>
                )}
                {viewMode === 'grid' && (
                  <>
                    <li className="text-blue-700 font-medium">Click any day to see detailed schedule</li>
                    <li>Balance workload across your team</li>
                  </>
                )}
                <li className="text-green-700 font-semibold">Just like Google Calendar - hover and click!</li>
                {browseMode && <li className="text-purple-700 font-medium">Click a technician to assign them</li>}
              </ul>
              <p className="text-[10px] text-gray-500 mt-2 italic">
                Keyboard shortcuts: <kbd className="px-1 py-0.5 bg-gray-200 rounded text-gray-700 font-mono">D</kbd> Day,
                <kbd className="px-1 py-0.5 bg-gray-200 rounded text-gray-700 font-mono">W</kbd> Week,
                <kbd className="px-1 py-0.5 bg-gray-200 rounded text-gray-700 font-mono">M</kbd> Month,
                <kbd className="px-1 py-0.5 bg-gray-200 rounded text-gray-700 font-mono">L</kbd> List,
                <kbd className="px-1 py-0.5 bg-gray-200 rounded text-gray-700 font-mono">T</kbd> Today
              </p>
            </div>
          </div>
        </div>
      </div>}

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
