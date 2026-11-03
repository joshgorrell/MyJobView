import { CreateWorkOrderModal } from './CreateWorkOrderModal';

// Compatibility adapter: every entry point renders the same form.
export function CreateProjectWorkOrderModal(props: {
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
  contactId: string | null;
}) {
  return <CreateWorkOrderModal {...props} contactId={props.contactId || undefined} />;
}

export default CreateProjectWorkOrderModal;
