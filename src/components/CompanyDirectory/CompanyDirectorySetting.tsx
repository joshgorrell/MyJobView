import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
export function CompanyDirectorySetting() {
 const [enabled,setEnabled]=useState(false);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{let active=true;void supabase.rpc('company_directory_enabled').then(({data,error})=>{if(!active)return;if(error)setError(error.message);else setEnabled(Boolean(data));setLoading(false);});return()=>{active=false};},[]);
 async function toggle() {setSaving(true);setError('');const next=!enabled;const {error}=await supabase.rpc('set_company_directory_enabled',{p_enabled:next});if(error)setError(error.message);else{setEnabled(next);window.dispatchEvent(new Event('company-directory-changed'));}setSaving(false);}
 return <section className="rounded-xl border border-slate-200 bg-white p-5 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
  <h3 className="text-lg font-semibold">Company Directory</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Allow coworkers to find active employees and their shared business-card contact information. Only signed-in employees of your company can view this directory.</p>
  <label className="mt-4 flex items-center gap-3"><input type="checkbox" checked={enabled} disabled={loading||saving} onChange={toggle} className="h-5 w-5 accent-cyan-600"/><span>{enabled?'Enabled':'Disabled'}</span></label>
  {error&&<p role="alert" className="mt-2 text-sm text-red-500">{error}</p>}
 </section>;
}
