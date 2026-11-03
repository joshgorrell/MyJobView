import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname);
export default defineConfig({root,plugins:[{name:'history-fixtures',enforce:'pre',resolveId(source){if(source.endsWith('/lib/supabase')||source.endsWith('/contexts/AuthContext'))return path.join(root,'mock.ts');}},react()],css:{postcss:path.resolve(root,'../../..')},server:{host:'127.0.0.1',port:5199,strictPort:true}});
