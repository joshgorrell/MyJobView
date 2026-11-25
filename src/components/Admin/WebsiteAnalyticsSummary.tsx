import {useEffect,useState} from 'react';
import {supabase} from '../../lib/supabase';
type Day={day:string;views:number};
export function WebsiteAnalyticsSummary({publicId,organizationId}:{publicId:string;organizationId:string}){
 const [sales,setSales]=useState<Record<string,number>|null>(null);
 const [totals,setTotals]=useState<Record<string,number>|null>(null);
 const [days,setDays]=useState<Day[]|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let active=true;setDays(null);setTotals(null);setSales(null);setError(false);async function load(){
 const [{data,error},intake,attribution]=await Promise.all([supabase.rpc('website_analytics_summary',{p_public_id:publicId,p_days:30}),supabase.rpc('website_analytics_intake_totals',{p_public_id:publicId}),supabase.rpc('website_analytics_sales',{p_public_id:publicId})]);
 if(active&&!attribution.error)setSales(attribution.data as Record<string,number>);
 if(active&&!intake.error)setTotals(intake.data as Record<string,number>);
 if(active){if(error)setError(true);else setDays((data??[]) as Day[]);}
 }void load();return()=>{active=false;};},[publicId,organizationId]);
 if(error)return <p role="alert">Website analytics unavailable.</p>;
 if(!days)return <p role="status">Loading analytics…</p>;
 const total=days.reduce((sum,d)=>sum+Number(d.views),0),max=Math.max(1,...days.map(d=>Number(d.views)));
 return <section className="border border-subtle rounded-lg p-3 space-y-2"><h5 className="font-semibold">Website activity · Last 30 days</h5><p className="text-2xl font-semibold">{total.toLocaleString()}</p><p className="text-sm text-secondary">Recorded page views (UTC)</p><div className="flex items-end gap-1 h-20" role="img" aria-label="Daily recorded page views">{days.map(d=><div key={d.day} className="flex-1 bg-blue-500 rounded-t" style={{height:Math.max(1,Number(d.views)/max*100)+'%'}} title={d.day+': '+d.views}/>)}</div>{totals?<div className="grid grid-cols-2 gap-2">{[['leads','Website leads'],['service','Service requests'],['feedback','Feedback responses'],['chat','Visitor chats']].map(([key,label])=><div key={key} className="border border-subtle rounded p-2"><strong>{Number(totals[key]??0).toLocaleString()}</strong><p className="text-xs">{label}</p></div>)}</div>:<p className="text-xs">Intake totals unavailable.</p>}<p className="text-xs text-secondary">Intake totals are dealer-wide over the last 30 days; page views are widget-specific. Not unique visitors.</p><h5 className="font-semibold">Website lead cohort · Last 30 days</h5>{sales?<div className="grid grid-cols-2 gap-2">{[['converted','Leads with proposals'],['orders','Sales orders'],['booked','Contract value'],['collected','Invoice payments']].map(([key,label])=><div key={key} className="border rounded p-2"><strong>{Number(sales[key]??0).toLocaleString(undefined,key==='booked'||key==='collected'?{style:'currency',currency:'USD'}:{})}</strong><p className="text-xs">{label}</p></div>)}</div>:<p>Sales attribution unavailable.</p>}<p className="text-xs text-secondary">Direct opportunity links only. Current contract values and recorded payments for leads created in the period; not accounting revenue.</p></section>;
}
