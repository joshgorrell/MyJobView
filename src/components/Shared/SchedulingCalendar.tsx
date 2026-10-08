import { WorkOrderSchedulePicker } from '../Production/WorkOrderSchedulePicker';
import { useAuth } from '../../contexts/AuthContext';
import { minutes, timeKey } from '../../lib/workOrderScheduling';

interface SchedulingCalendarProps {
  technicians: { id: string; full_name: string }[];
  technicianIds: string[];
  selectedDate: string;
  selectedTime?: string;
  onSlotSelect: (date: string, startTime: string) => void;
  onValidationChange: (error: string | null) => void;
  estimatedHours?: number;
  earliestDate?: string | null;
}

// Service-request scheduling uses the same availability loader and time grid.
// Date/time and technician fields remain in the surrounding service-request form.
export function SchedulingCalendar({ technicians, technicianIds, selectedDate, selectedTime = '', onSlotSelect, onValidationChange, estimatedHours = 2, earliestDate }: SchedulingCalendarProps) {
  const { profile } = useAuth();
  const duration = Number.isFinite(estimatedHours) && estimatedHours > 0 ? Math.round(estimatedHours * 60) : 120;
  return <WorkOrderSchedulePicker organizationId={profile?.organization_id || undefined}
    technicians={technicians.filter(tech => technicianIds.includes(tech.id))} technicianIds={technicianIds}
    onTechniciansChange={() => {}} value={{ date: selectedDate, start: selectedTime, end: selectedTime ? timeKey(minutes(selectedTime) + duration) : '' }}
    onChange={value => onSlotSelect(value.date, value.start)} onValidationChange={onValidationChange}
    earliestDate={earliestDate} showTechnicianSelection={false} showManualEntry={false} />;
}
