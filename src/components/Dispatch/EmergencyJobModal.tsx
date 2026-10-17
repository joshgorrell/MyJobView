import { CreateWorkOrderModal } from '../Production/CreateWorkOrderModal';

// Emergency visits use the same complete customer, technician and booking flow.
export function EmergencyJobModal({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) {
  return <CreateWorkOrderModal emergency onClose={onClose} onSuccess={() => onSuccess?.()} />;
}
