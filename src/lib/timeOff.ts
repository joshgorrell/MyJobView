import { supabase } from "./supabase";
export interface LeaveDay {
  date: string;
  hours: number;
  start: string;
  end: string;
}
export interface TeamLeave {
  request_id: string;
  employee_id: string;
  employee_name: string;
  leave_date: string;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  full_day: boolean;
}
export const canManageTimeOff = (role?: string | null) =>
  [
    "admin",
    "manager",
    "service_manager",
    "office_manager",
    "production_manager",
  ].includes(role || "");
export const localDate = (date: string) => new Date(date + "T12:00:00");
export const displayDate = (date: string) =>
  localDate(date).toLocaleDateString();
export const leaveLabel = (leave: TeamLeave) =>
  leave.full_day
    ? "Off all day"
    : `Off ${leave.start_time?.slice(0, 5)}–${leave.end_time?.slice(0, 5)}`;
export const minutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
export function overlapsLeave(leave: TeamLeave, start: string, end: string) {
  return (
    leave.full_day ||
    !leave.start_time ||
    !leave.end_time ||
    (minutes(start) < minutes(leave.end_time) &&
      minutes(end) > minutes(leave.start_time))
  );
}
export async function loadTeamLeave(
  from: string,
  to: string,
): Promise<TeamLeave[]> {
  const rows: TeamLeave[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .rpc("team_time_off", { p_from: from, p_to: to })
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}
export async function loadTeamWorkSchedule(from: string, to: string) {
  const rows: Array<{
    employee_id: string;
    employee_name: string;
    work_date: string;
    scheduled: boolean | null;
  }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .rpc("team_work_schedule", { p_from: from, p_to: to })
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}
