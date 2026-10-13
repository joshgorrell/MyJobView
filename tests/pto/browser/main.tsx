import React from 'react';import {createRoot} from 'react-dom/client';import '../../../src/index.css';
import {MyTimeOff} from '../../../src/components/Dispatch/MyTimeOff';
import {TimeClockManagement} from '../../../src/components/Admin/TimeClockManagement';
createRoot(document.getElementById('root')!).render(<main className="p-3 bg-canvas min-h-screen">{new URLSearchParams(location.search).get('surface')==='command'?<TimeClockManagement initialTab="timeoff"/>:<MyTimeOff/>}</main>);
