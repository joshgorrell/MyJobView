import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface PortalGuardState {
  isOpen: boolean;
  pendingAction: (() => void) | null;
}

/**
 * Guards any action that modifies a live-portal proposal.
 *
 * Usage:
 *   const { PortalGuardModal, guardAction } = usePortalGuard(proposalId, portalVisible, setPortalVisible);
 *   // In your handler:
 *   guardAction(() => doTheActualSave());
 *   // Render <PortalGuardModal /> somewhere in the JSX.
 *
 * When the portal is NOT live, guardAction calls the action immediately with no prompt.
 * When the portal IS live, it shows a confirmation modal. On confirm it sets
 * is_portal_visible = false, updates local state, then calls the action.
 */
export function usePortalGuard(
  proposalId: string | null | undefined,
  portalVisible: boolean,
  setPortalVisible: (val: boolean) => void
) {
  const [guardState, setGuardState] = useState<PortalGuardState>({ isOpen: false, pendingAction: null });

  const guardAction = useCallback(
    (action: () => void) => {
      if (!portalVisible) {
        action();
        return;
      }
      // Portal is live — ask first
      setGuardState({ isOpen: true, pendingAction: action });
    },
    [portalVisible]
  );

  async function handleConfirm() {
    const action = guardState.pendingAction;
    setGuardState({ isOpen: false, pendingAction: null });

    if (proposalId) {
      await supabase
        .from('proposals')
        .update({ is_portal_visible: false })
        .eq('id', proposalId);
      setPortalVisible(false);
    }

    if (action) action();
  }

  function handleCancel() {
    setGuardState({ isOpen: false, pendingAction: null });
  }

  return {
    guardModalOpen: guardState.isOpen,
    handleGuardConfirm: handleConfirm,
    handleGuardCancel: handleCancel,
    guardAction,
  };
}
