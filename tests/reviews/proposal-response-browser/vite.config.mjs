import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname);
export default defineConfig({root,plugins:[{name:'isolated-proposal-responses',enforce:'pre',resolveId(source){if(source.endsWith('/lib/supabase'))return path.join(root,'mock.ts')}},react()],server:{host:'127.0.0.1',port:5197,strictPort:true}});
