import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname);
export default defineConfig({root,plugins:[{name:'isolated-pto-data',enforce:'pre',resolveId(source,importer){if((source==='./supabase'&&importer?.includes('/src/lib/'))||['/lib/supabase','/contexts/AuthContext','/lib/timezoneUtils','/Shared/Toast'].some(s=>source.endsWith(s)))return path.join(root,'mock.tsx');}},react()],server:{host:'127.0.0.1',port:5196,strictPort:true}});
