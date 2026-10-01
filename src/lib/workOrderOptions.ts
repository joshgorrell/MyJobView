import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "../contexts/AuthContext";
export interface WorkOrderOption {
  id: string;
  organization_id: string;
  kind: "type" | "status";
  label: string;
  behavior: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  system_key: string | null;
}
export function useWorkOrderOptions() {
  const { profile } = useAuth();
  const [options, setOptions] = useState<WorkOrderOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    setOptions([]);
    if (profile?.organization_id)
      supabase
        .from("work_order_options")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("sort_order")
        .then(({ data }) => {
          if (!cancelled) setOptions(data || []);
        });
    return () => {
      cancelled = true;
    };
  }, [profile?.organization_id]);
  return options;
}
export function workOrderOptionLabel(
  options: WorkOrderOption[],
  kind: "type" | "status",
  behavior: string,
  id?: string | null,
) {
  return (
    options.find((o) => o.id === id && o.kind === kind)?.label ||
    options.find((o) => o.kind === kind && o.system_key === behavior)?.label ||
    behavior?.replace(/_/g, " ") ||
    ""
  );
}

export function workOrderOptionStyle(
  options: WorkOrderOption[],
  kind: "type" | "status",
  behavior: string,
  id?: string | null,
) {
  const option =
    options.find((o) => o.id === id && o.kind === kind) ||
    options.find((o) => o.kind === kind && o.system_key === behavior);
  return option
    ? {
        color: option.color,
        backgroundColor: option.color + "18",
        borderColor: option.color + "60",
      }
    : undefined;
}
