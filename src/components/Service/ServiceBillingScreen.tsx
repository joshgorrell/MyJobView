import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { CreateInvoiceFromWorkOrderModal } from "../Invoices/CreateInvoiceFromWorkOrderModal";

interface ServiceBillingScreenProps {
  billingQueueItemId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

// All service invoices use the same tax calculation, editable line items and
// explicit commission origin as the main Work Order -> Invoice flow.
export function ServiceBillingScreen({
  billingQueueItemId,
  onClose,
  onSuccess,
}: ServiceBillingScreenProps) {
  const [workOrderId, setWorkOrderId] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let canceled = false;
    supabase
      .from("service_billing_queue")
      .select("work_order_id")
      .eq("id", billingQueueItemId)
      .single()
      .then(({ data, error }) => {
        if (!canceled) {
          if (error) setError(error.message);
          else setWorkOrderId(data.work_order_id);
        }
      });
    return () => {
      canceled = true;
    };
  }, [billingQueueItemId]);
  if (workOrderId)
    return (
      <CreateInvoiceFromWorkOrderModal
        initialWorkOrderId={workOrderId}
        onClose={onClose}
        onSuccess={() => {
          onSuccess?.();
          onClose();
        }}
      />
    );
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-white text-gray-900 rounded-xl p-6">
        <p role={error ? "alert" : undefined}>
          {error || "Loading service billing…"}
        </p>
        <button className="mt-4 text-blue-700" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
