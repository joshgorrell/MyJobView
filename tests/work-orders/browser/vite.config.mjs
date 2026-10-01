import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname);
export default defineConfig({root,plugins:[{name:'isolated-work-order-data',enforce:'pre',resolveId(source){if(source==='./supabase'||source.endsWith('/lib/supabase')||source.endsWith('/contexts/AuthContext')||source.endsWith('/Shared/AvailabilityBrowserModal'))return path.join(root,'mock.ts');}},react()],server:{host:'127.0.0.1',port:5187,strictPort:true}});
