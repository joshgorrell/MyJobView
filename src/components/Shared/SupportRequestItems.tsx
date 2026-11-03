import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
export function SupportRequestItems({ requestId }: { requestId: string }) {
  const [items, setItems] = useState<
    Array<{ id: string; title: string; description: string | null }>
  >([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setItems([]);
    setError("");
    void (async () => {
      const { data, error: failure } = await supabase
        .from("project_punchlist_requests")
        .select("task:project_tasks(id,title,description)")
        .eq("request_id", requestId);
      if (!active) return;
      if (failure) setError("Requested punchlist items could not be loaded.");
      else
        setItems(
          (data || []).flatMap((row) =>
            row.task
              ? [
                  row.task as unknown as {
                    id: string;
                    title: string;
                    description: string | null;
                  },
                ]
              : [],
          ),
        );
    })();
    return () => {
      active = false;
    };
  }, [requestId]);
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!!items.length && (
        <div className="space-y-2">
          <h3 className="font-semibold text-primary">
            Requested project punchlist items
          </h3>
          {items.map((item) => (
            <div key={item.id} className="text-sm text-secondary">
              <p className="font-medium whitespace-pre-wrap">{item.title}</p>
              {item.description && (
                <p className="whitespace-pre-wrap">{item.description}</p>
              )}
            </div>
          ))}
          <p className="text-xs text-muted">
            These original project items are attached to the scheduled work
            order automatically. Technician notes stay internal.
          </p>
        </div>
      )}
    </>
  );
}
