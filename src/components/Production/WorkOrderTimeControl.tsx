import { saveClockEventGps } from '../../lib/clockEventGps';
import {offlineStorage} from '../../lib/offlineStorage';
import {syncManager} from '../../lib/syncManager';
import { useEffect, useState } from 'react';
import { Clock, Play, Square } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { ClockOutModal } from '../Shared/ClockOutModal';
import { gpsTrackingService } from '../../lib/gpsTracking';

/** The normal technician timer is part of the existing Work Order, never a second WO layout. */
export function WorkOrderTimeControl({workOrderId,assignedTo,onChanged}:{workOrderId:string;assignedTo:string|null;onChanged:()=>void}) {
  const {profile}=useAuth();
  const [active,setActive]=useState<{id:string;work_order_id:string|null;clock_in:string}|null>(null);
  const [pendingStop,setPendingStop]=useState(false);
  const [verified,setVerified]=useState(false);
  const [online,setOnline]=useState(navigator.onLine);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [showStop,setShowStop]=useState(false);
  const [now,setNow]=useState(Date.now());
  async function load() {
    if(!profile) return;
    try {
      const queued=await offlineStorage.getSyncQueue().catch(error=>{if(!navigator.onLine)throw error;return [];});
      const ownStops=queued.filter(q=>q.ownerId===profile.id && q.table==='time_entries' && q.type==='update' && q.data.clock_out);
      setPendingStop(ownStops.length>0);
      const cached=await offlineStorage.getCachedData('time_entries').catch(error=>{if(!navigator.onLine)throw error;return [];});
      let records:any[];
      if(!navigator.onLine) records=cached.filter(e=>e.technician_id===profile.id && !e.clock_out && ['draft','submitted'].includes(e.status));
      else {
        const {data,error}=await supabase.from('time_entries').select('id,work_order_id,clock_in,clock_out,status,technician_id')
          .eq('technician_id',profile.id).is('clock_out',null).in('status',['draft','submitted']).order('clock_in',{ascending:false}).limit(1).maybeSingle();
        if(error) throw error;records=data?[data]:[];
      }
      const updated=records.map(record=>({...record,...ownStops.find(q=>q.data.id===record.id)?.data}));
      if(navigator.onLine) await offlineStorage.cacheData('time_entries',[...cached.filter(e=>(e.technician_id!==profile.id || e.clock_out) && !updated.some(record=>record.id===e.id)),...updated]).catch(()=>{});
      setActive(updated.find(e=>!e.clock_out)||null);setVerified(true);setError('');
    } catch(error:any){setVerified(false);setError(error.message||'Unable to check your active time.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{
    void load();const timer=setInterval(()=>setNow(Date.now()),1000);
    const channel=supabase.channel(`work-order-time-${workOrderId}`).on('postgres_changes',{event:'*',schema:'public',table:'time_entries',filter:`technician_id=eq.${profile?.id}`},load).subscribe();
    const connection=()=>{setOnline(navigator.onLine);void load();};
    window.addEventListener('online',connection);window.addEventListener('offline',connection);
    const removeSyncListener=syncManager.addListener(()=>{void load();});
    return ()=>{clearInterval(timer);void channel.unsubscribe();removeSyncListener();window.removeEventListener('online',connection);window.removeEventListener('offline',connection);};
  },[profile?.id,workOrderId]);
  async function start() {
    if(!profile || busy || !verified || pendingStop) return;
    if(!navigator.onLine){setError('Reconnect to start Work Order time. Offline starts are not yet supported.');return;}
    setBusy(true);setError('');
    try {
      const {data,error}=await supabase.rpc('start_work_order_time',{p_work_order_id:workOrderId});
      if(error) throw error;
      void saveClockEventGps(data, 'time_entries').catch(error => console.error('Job clock-in GPS could not be saved:', error));
      await gpsTrackingService.startTracking(profile.id,undefined,workOrderId).catch(()=>{});
      // Payroll time is saved first. GPS evidence can refine in the background.
      await load();onChanged();
    } catch(error:any){setError(error.message||'Unable to start job time.');}
    finally{setBusy(false);}
  }
  const runningHere=active?.work_order_id===workOrderId;
  if(profile?.id!==assignedTo && !runningHere) return null;
  const elapsed=active?Math.max(0,Math.floor((now-Date.parse(active.clock_in))/60000)):0;
  return <div className="rounded-xl border border-subtle bg-elevated p-3 space-y-2">
    <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-primary flex items-center gap-2"><Clock className="w-4 h-4" />{runningHere ? `Job time running · ${Math.floor(elapsed/60)}h ${elapsed%60}m`:'Work Order Job Time'}</p>
      {runningHere?<button onClick={()=>setShowStop(true)} className="flex items-center gap-2 rounded-lg bg-red-600 text-white px-3 py-2 text-sm"><Square className="w-4 h-4" />Stop Time</button>:<button onClick={start} disabled={loading||busy||!!active||pendingStop||!verified||!online} className="flex items-center gap-2 rounded-lg bg-blue-600 text-white px-3 py-2 text-sm disabled:opacity-50"><Play className="w-4 h-4" />{busy?'Starting…':'Start Job Time'}</button>}
    </div>
    {active && !runningHere && <p className="text-sm text-secondary">You have time running on another activity. Stop that activity before starting this Work Order.</p>}
    {pendingStop && <p className="text-sm text-amber-700">Your time stop is saved on this device and waiting to sync. Reconnect before starting another activity.</p>}
    {!online && !runningHere && !pendingStop && <p className="text-sm text-secondary">Reconnect to start Work Order time.</p>}
    {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
    {showStop && active && profile && <ClockOutModal type="job" entryId={active.id} technicianId={profile.id} workOrderId={workOrderId} allowCompletion={false} onClose={()=>setShowStop(false)} onSuccess={()=>{setShowStop(false);void load();onChanged();}} />}
  </div>;
}
