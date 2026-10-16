import {FeedbackHost} from '../../../src/components/Shared/FeedbackHost';
import React from 'react';import {createRoot} from 'react-dom/client';import '../../../src/index.css';
import {MyTimeOff} from '../../../src/components/Dispatch/MyTimeOff';
import {TechStatusDashboard} from '../../../src/components/Dispatch/TechStatusDashboard';
import {TimeClockManagement} from '../../../src/components/Admin/TimeClockManagement';
createRoot(document.getElementById('root')!).render(<><FeedbackHost/><main className="p-3 bg-canvas min-h-screen">{new URLSearchParams(location.search).get('surface')==='status'?<TechStatusDashboard/>:new URLSearchParams(location.search).get('surface')==='command'?<TimeClockManagement initialTab="timeoff"/>:<MyTimeOff/>}</main></>);
