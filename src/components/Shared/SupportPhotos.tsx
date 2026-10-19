import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
export function SupportPhotos({
  paths,
  taskId,
  requestId,
  workOrderId,
}: {
  paths?: string[];
  taskId?: string;
  requestId?: string;
  workOrderId?: string;
}) {
  const [urls, setUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const pathsKey = paths?.join("|") || "";
  useEffect(() => {
    let active = true;
    setUrls([]);
    setError("");
    async function load() {
      let values = paths;
      if (!values && (taskId || requestId || workOrderId)) {
        if (workOrderId) {
          const {data,error:failure}=await supabase.rpc('get_work_order_support_photo_paths',{p_work_order_id:workOrderId});
          if(failure)throw failure;
          values=data || [];
        } else if (requestId) {
          const {data,error:failure}=await supabase.rpc('get_service_request_photo_paths',{p_request_id:requestId});
          if(failure)throw failure;
          values=data || [];
        } else {
          const {data,error:failure}=await supabase.from('portal_support_photos').select('storage_path').eq('task_id',taskId!);
          if(failure)throw failure;
          values=(data || []).map(row=>row.storage_path);
        }
      }
      if (!values?.length) return;
      const { data, error: failure } = await supabase.storage
        .from("portal-support")
        .createSignedUrls(values, 300);
      if (failure || data?.some((photo) => photo.error))
        throw failure || new Error("A photo could not be loaded.");
      if (active) setUrls((data || []).map((photo) => photo.signedUrl));
    }
    const refresh = () => {
      if (document.visibilityState === "visible")
        void load().catch(() => {
          if (active)
            setError("Photos could not be loaded. Refresh to try again.");
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 240000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [pathsKey, taskId, requestId, workOrderId]);
  return (
    <>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {!!urls.length && (
        <div className="flex flex-wrap gap-2">
          {urls.map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              <img
                src={url}
                alt={`Customer photo ${index + 1}`}
                className="w-20 h-20 rounded-lg border object-cover"
              />
            </a>
          ))}
        </div>
      )}
    </>
  );
}
