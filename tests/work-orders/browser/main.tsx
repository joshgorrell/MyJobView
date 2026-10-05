import LaborRemovalChoice from "../../../src/components/Proposals/LaborRemovalChoice";
import ProjectTasksList from "../../../src/components/Projects/ProjectTasksList";
import { CreateWorkOrderModal } from "../../../src/components/Production/CreateWorkOrderModal";
import { WorkOrderSettings } from "../../../src/components/Admin/WorkOrderSettings";
import React from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import { CreateProjectWorkOrderModal } from "../../../src/components/Production/CreateProjectWorkOrderModal";
import WorkOrderTasksChecklist from "../../../src/components/Production/WorkOrderTasksChecklist";
document.documentElement.dataset.theme =
  new URLSearchParams(location.search).get("theme") || "light";
const settings = new URLSearchParams(location.search).has("settings");
const checklist = new URLSearchParams(location.search).has("checklist");
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).has("labor") ? (
    <LaborRemovalChoice onChoose={() => {}} onCancel={() => {}} />
  ) : new URLSearchParams(location.search).has("tasks") ? (
    <div className="p-3">
      <ProjectTasksList projectId="p" canEdit />
    </div>
  ) : new URLSearchParams(location.search).has("service") ? (
    <CreateWorkOrderModal
      contactId="c"
      onClose={() => {}}
      onSuccess={() => {}}
    />
  ) : settings ? (
    <div className="p-4">
      <WorkOrderSettings />
    </div>
  ) : checklist ? (
    <div className="p-4">
      <WorkOrderTasksChecklist
        workOrderId="wo"
        projectId="p"
        laborPhaseId="rough"
        currentUserId="tech"
      />
    </div>
  ) : (
    <CreateProjectWorkOrderModal
      projectId="p"
      contactId="c"
      onClose={() => {}}
      onSuccess={() => {}}
    />
  ),
);
