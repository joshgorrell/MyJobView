import {WorkOrderSettings} from '../../../src/components/Admin/WorkOrderSettings';
import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../../src/index.css';
import {CreateProjectWorkOrderModal} from '../../../src/components/Production/CreateProjectWorkOrderModal';
import WorkOrderTasksChecklist from '../../../src/components/Production/WorkOrderTasksChecklist';
const settings=new URLSearchParams(location.search).has('settings');
const checklist=new URLSearchParams(location.search).has('checklist');
createRoot(document.getElementById('root')!).render(settings?<div className="p-4"><WorkOrderSettings/></div>:checklist?<div className="p-4"><WorkOrderTasksChecklist workOrderId="wo" projectId="p" laborPhaseId="rough" currentUserId="tech" /></div>:<CreateProjectWorkOrderModal projectId="p" contactId="c" onClose={()=>{}} onSuccess={()=>{}} />);
