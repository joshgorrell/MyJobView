import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const root = path.dirname(new URL(import.meta.url).pathname);
const stubs = ['SinglePageProductForm','PackagesList','PackageForm','MonitoringServicesCatalog','ProductDetailModal','PackagesListView'];
export default defineConfig({root,plugins:[{name:'catalog-test-data',enforce:'pre',resolveId(source){
  if(source.endsWith('/lib/supabase') || source.endsWith('/contexts/AuthContext')) return path.join(root,'mock.ts');
  if(stubs.some(name=>source.endsWith('/'+name))) return path.join(root,'stub.tsx');
}},react()],css:{postcss:path.resolve(root,'../../..')},server:{host:'127.0.0.1',port:5198,strictPort:true}});
