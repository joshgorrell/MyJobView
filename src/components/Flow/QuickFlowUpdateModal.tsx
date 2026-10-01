import { useEffect, useState } from 'react';
import { FlowWaveIcon } from './FlowWaveIcon';
import { QuickActionModal } from '../Shared/QuickActionModal';
import { PostFlowUpdate } from './PostFlowUpdate';
import './flow.css';

export function QuickFlowUpdateModal({ onClose }: { onClose: () => void }) {
  const [posted, setPosted] = useState(false);

  useEffect(() => {
    if (!posted) return;
    const timer = window.setTimeout(onClose, 1100);
    return () => window.clearTimeout(timer);
  }, [posted, onClose]);

  return <QuickActionModal
    title="Flow Update"
    subtitle="Share a quick note without leaving this page"
    icon={<FlowWaveIcon className="text-2xl" />}
    accentColor="from-cyan-600 to-blue-700"
    onClose={onClose}
    showSuccess={posted}
    successMessage="Added to Flow"
  >
    <div className="flow flow-quick-composer">
      <PostFlowUpdate scope={{}} compact onClose={onClose} onPosted={() => setPosted(true)} />
    </div>
  </QuickActionModal>;
}
