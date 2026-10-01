import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../../src/index.css';
import {CreateProjectWorkOrderModal} from '../../../src/components/Production/CreateProjectWorkOrderModal';
import WorkOrderTasksChecklist from '../../../src/components/Production/WorkOrderTasksChecklist';
const checklist=new URLSearchParams(location.search).has('checklist');
createRoot(document.getElementById('root')!).render(checklist?<div className="p-4"><WorkOrderTasksChecklist workOrderId="wo" projectId="p" laborPhaseId="rough" currentUserId="tech" /></div>:<CreateProjectWorkOrderModal projectId="p" contactId="c" onClose={()=>{}} onSuccess={()=>{}} />);
