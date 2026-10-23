import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname);
export default defineConfig({root,plugins:[{name:'isolated-time-data',enforce:'pre',resolveId(source,importer){if((['./supabase','./gpsTracking'].includes(source)&&importer?.includes('/src/lib/'))||['/lib/supabase','/contexts/AuthContext','/hooks/useEmployeeTimePolicy','/lib/timezoneUtils','/Technician/ManualJobTimeRequestModal','/Technician/RequestInternalTimeModal','/Technician/CustomerTimeTimer','/Technician/MyTimeView','/Technician/MyJobTimeView','/Appointments/AppointmentsCalendar','/Dispatch/MyTimeOff','/Shared/TeamTimeOffPanel','/Production/WorkOrderTimeControl','../../lib/gpsTracking','/Shared/Toast'].some(s=>source.endsWith(s)))return path.join(root,'mock.tsx');}},react()],server:{host:'127.0.0.1',port:5191,strictPort:true}});
