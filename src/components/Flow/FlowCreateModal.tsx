import { useState } from "react";
import { createPortal } from "react-dom";
import { Activity, ArrowLeft, Calendar, MessageSquare } from "lucide-react";
import { QuickActionModal } from "../Shared/QuickActionModal";
import { DiscussionPostForm } from "../Feed/DiscussionPostForm";
import { PostFlowUpdate } from "./PostFlowUpdate";
import { FlowInteractionForm } from "./FlowInteractionForm";
import { FlowScope } from "../../lib/flow/types";
import { FlowWaveIcon } from "./FlowWaveIcon";

export function FlowCreateModal({
  scope,
  initial = "choose",
  followup,
  canInteract,
  onClose,
  onSaved,
}: {
  scope: FlowScope;
  initial?: "choose" | "chat" | "update" | "interaction";
  followup?: {
    id: string;
    kind: "reminder" | "schedule";
    contactId: string;
    label: string;
  };
  canInteract: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState(initial);
  const title = followup
    ? "Complete follow-up"
    : mode === "choose"
      ? "Create in Flow"
      : mode === "chat"
        ? "Internal chat"
        : mode === "update"
          ? "Activity update"
          : "Log interaction";
  return createPortal(
    <QuickActionModal
      title={title}
      subtitle="Messages, customer interactions and follow-ups in one place"
      icon={<FlowWaveIcon className="text-2xl" />}
      onClose={onClose}
    >
      <div className="flow flow-quick-composer flow-create-modal">
        {mode !== "choose" && !followup && (
          <button
            className="flow-create-back"
            onClick={() => setMode("choose")}
          >
            <ArrowLeft size={16} />
            All create options
          </button>
        )}
        {mode === "choose" ? (
          <div className="flow-create-grid">
            <button onClick={() => setMode("chat")}>
              <MessageSquare />
              <span>
                <strong>Internal chat</strong>
                <small>Teammates, departments or everyone</small>
              </span>
            </button>

            <button onClick={() => setMode("update")}>
              <Activity />
              <span>
                <strong>Activity update</strong>
                <small>Customer or job progress</small>
              </span>
            </button>
            {canInteract && (
              <button onClick={() => setMode("interaction")}>
                <Calendar />
                <span>
                  <strong>Log interaction</strong>
                  <small>Calls, meetings, notes and follow-up reminders</small>
                </span>
              </button>
            )}
          </div>
        ) : mode === "chat" ? (
          <DiscussionPostForm onSuccess={onSaved} />
        ) : mode === "update" ? (
          <PostFlowUpdate
            scope={scope}
            compact
            onClose={onClose}
            onPosted={onSaved}
          />
        ) : (
          <FlowInteractionForm
            scope={scope}
            followup={followup}
            onSaved={onSaved}
          />
        )}
      </div>
    </QuickActionModal>,
    document.body,
  );
}
