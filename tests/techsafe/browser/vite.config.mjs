import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const mock = fileURLToPath(new URL('./mock.ts', import.meta.url));
export default defineConfig({plugins:[{name:'techsafe-exclusion-fixture',enforce:'pre',resolveId(source){if(source.endsWith('/lib/supabase'))return mock;}},react()],server:{host:'127.0.0.1'}});
