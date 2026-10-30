import { useEffect, useMemo, useState } from 'react';
import { Search, Mail, Phone, LayoutGrid, List, UserRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Colleague = { user_id:string; full_name:string; title:string; email:string; phone:string; photo_url:string|null; slug:string|null; office_name:string|null };
export function CompanyDirectory() {
  const [people,setPeople]=useState<Colleague[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  const [office,setOffice]=useState('');
  const [mode,setMode]=useState<'cards'|'list'>('cards');
  useEffect(()=>{ let live=true; (async()=>{
    const {data,error}=await supabase.rpc('get_company_directory');
    if(!live)return;
    if(error)setError('Unable to load directory.');
    else setPeople((data||[]) as Colleague[]);
    setLoading(false);
  })(); return()=>{live=false}; },[]);
  const offices=useMemo(()=>[...new Set(people.map(p=>p.office_name).filter((x):x is string=>!!x))].sort(),[people]);
  const filtered=useMemo(()=>people.filter(p=>(!office||p.office_name===office)&&
    [p.full_name,p.title,p.email,p.office_name].some(v=>v?.toLowerCase().includes(search.toLowerCase()))),[people,office,search]);
  return <main className="mx-auto max-w-7xl p-4 sm:p-6 text-slate-900 dark:text-white">
    <header className="mb-5"><h1 className="text-2xl font-bold">Company Directory</h1><p className="text-sm text-slate-500 dark:text-slate-400">Find and connect with your coworkers.</p></header>
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <label className="relative min-w-0 flex-1 basis-56"><Search className="absolute left-3 top-3 h-5 w-5 text-slate-400"/><input aria-label="Search coworkers" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search coworkers" className="w-full rounded-xl border bg-white p-3 pl-10 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"/></label>
      <select aria-label="Filter by office" value={office} onChange={e=>setOffice(e.target.value)} className="rounded-xl border bg-white p-3 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"><option value="">All offices</option>{offices.map(o=><option key={o}>{o}</option>)}</select>
      <div className="flex rounded-xl border dark:border-slate-700"><button aria-label="Card view" aria-pressed={mode==='cards'} onClick={()=>setMode('cards')} className="p-3 aria-pressed:bg-cyan-100 dark:aria-pressed:bg-slate-700"><LayoutGrid size={18}/></button><button aria-label="List view" aria-pressed={mode==='list'} onClick={()=>setMode('list')} className="p-3 aria-pressed:bg-cyan-100 dark:aria-pressed:bg-slate-700"><List size={18}/></button></div>
    </div>
    {loading?<p>Loading directory…</p>:error?<p role="alert">{error}</p>:filtered.length===0?<p className="rounded-xl border p-8 text-center dark:border-slate-700">No coworkers found. The directory may be disabled or no employees match your filters.</p>:
    <div className={mode==='cards'?'grid gap-4 sm:grid-cols-2 lg:grid-cols-3':'space-y-3'}>{filtered.map(p=><article key={p.user_id} className="flex min-w-0 items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {p.photo_url?<img src={p.photo_url} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover"/>:<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"><UserRound/></div>}
      <div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{p.full_name}</h2>{p.title&&<p className="truncate text-sm text-slate-500 dark:text-slate-400">{p.title}</p>}{p.office_name&&<p className="text-xs text-slate-500">{p.office_name}</p>}
        <div className="mt-2 flex flex-wrap gap-3 text-sm">{p.email&&<a className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-300" href={`mailto:${p.email}`}><Mail size={15}/> Email</a>}{p.phone&&<a className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-300" href={`tel:${p.phone}`}><Phone size={15}/> Call</a>}{p.slug&&<a className="text-cyan-700 underline dark:text-cyan-300" href={`/card/${encodeURIComponent(p.slug)}`}>Business card</a>}</div>
      </div></article>)}</div>}
  </main>;
}
