import { useCompletion } from '../../hooks/useCompletion';
import { useState } from "react";
import { createPortal } from "react-dom";
import { Activity, ArrowLeft, Calendar, MessageSquare, Send, CheckCircle2 } from "lucide-react";
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
  const completion = useCompletion(onSaved);
  const { completed } = completion;
  const finish = completion.complete;
  const title = followup
    ? "Complete follow-up"
    : mode === "choose"
      ? "Create in Flow"
      : mode === "chat"
        ? "Message"
        : mode === "update"
          ? "Activity update"
          : "Log interaction";
  return createPortal(
    <QuickActionModal
      title={title}
      subtitle={mode === "chat" ? "Send a message to your team" : "Messages, customer interactions and follow-ups in one place"}
      icon={<FlowWaveIcon className="text-2xl" />}
      onClose={completed ? completion.finish : onClose}
      accentColor="from-cyan-600 to-blue-700"
      showSuccess={completed}
      successMessage={mode === 'chat' ? 'Message sent!' : mode === 'update' ? 'Added to Flow' : followup ? 'Follow-up completed!' : 'Interaction logged!'}
      successIcon={mode === 'chat' ? <Send className="h-20 w-20" strokeWidth={1.5} /> : <CheckCircle2 className="h-20 w-20" strokeWidth={1.5} />}
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
                <strong>Message</strong>
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
          <DiscussionPostForm onSuccess={finish} />
        ) : mode === "update" ? (
          <PostFlowUpdate
            scope={scope}
            compact
            onClose={onClose}
            onPosted={finish}
          />
        ) : (
          <FlowInteractionForm
            scope={scope}
            followup={followup}
            onSaved={finish}
          />
        )}
      </div>
    </QuickActionModal>,
    document.body,
  );
}
