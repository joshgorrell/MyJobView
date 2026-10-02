import { useEffect, useState } from 'react';
import { Clock, Play, Square } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { ClockOutModal } from '../Shared/ClockOutModal';
import { gpsTrackingService } from '../../lib/gpsTracking';
import { updateClockEntryAddress } from '../../lib/reverseGeocode';

/** The normal technician timer is part of the existing Work Order, never a second WO layout. */
export function WorkOrderTimeControl({workOrderId,assignedTo,onChanged}:{workOrderId:string;assignedTo:string|null;onChanged:()=>void}) {
  const {profile}=useAuth();
  const [active,setActive]=useState<{id:string;work_order_id:string|null;clock_in:string}|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [showStop,setShowStop]=useState(false);
  const [now,setNow]=useState(Date.now());
  async function load() {
    if(!profile) return;
    try {
      const {data,error}=await supabase.from('time_entries').select('id,work_order_id,clock_in')
        .eq('technician_id',profile.id).is('clock_out',null).in('status',['draft','submitted']).order('clock_in',{ascending:false}).limit(1).maybeSingle();
      if(error) throw error;setActive(data);
    } catch(error:any){setError(error.message||'Unable to check your active time.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{
    void load();const timer=setInterval(()=>setNow(Date.now()),1000);
    const channel=supabase.channel(`work-order-time-${workOrderId}`).on('postgres_changes',{event:'*',schema:'public',table:'time_entries',filter:`technician_id=eq.${profile?.id}`},load).subscribe();
    return ()=>{clearInterval(timer);void channel.unsubscribe();};
  },[profile?.id,workOrderId]);
  async function start() {
    if(!profile || busy) return;
    setBusy(true);setError('');
    try {
      const {data,error}=await supabase.rpc('start_work_order_time',{p_work_order_id:workOrderId});
      if(error) throw error;
      await gpsTrackingService.startTracking(profile.id,undefined,workOrderId).catch(()=>{});
      // Payroll time is saved first. GPS evidence can refine in the background.
      void gpsTrackingService.captureLocationForClockEvent(false).then(async gps=>{
        const {error}=await supabase.from('time_entries').update({clock_in_latitude:gps.latitude,clock_in_longitude:gps.longitude,
          clock_in_gps_accuracy:gps.accuracy,clock_in_gps_capture_method:gps.method,clock_in_gps_captured_at:gps.captured_at,
          clock_in_gps_attempted_at:gps.attempted_at,clock_in_gps_duration_ms:gps.duration_ms}).eq('id',data);
        if(!error && gps.latitude && gps.longitude) await updateClockEntryAddress(data,gps.latitude,gps.longitude,false,'time_entries');
      }).catch(()=>{});
      await load();onChanged();
    } catch(error:any){setError(error.message||'Unable to start job time.');}
    finally{setBusy(false);}
  }
  if(profile?.id!==assignedTo) return null;
  const runningHere=active?.work_order_id===workOrderId;
  const elapsed=active?Math.max(0,Math.floor((now-Date.parse(active.clock_in))/60000)):0;
  return <div className="rounded-xl border border-subtle bg-elevated p-3 space-y-2">
    <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-primary flex items-center gap-2"><Clock className="w-4 h-4" />{runningHere ? `Job time running · ${Math.floor(elapsed/60)}h ${elapsed%60}m`:'Work Order Job Time'}</p>
      {runningHere?<button onClick={()=>setShowStop(true)} className="flex items-center gap-2 rounded-lg bg-red-600 text-white px-3 py-2 text-sm"><Square className="w-4 h-4" />Stop Time</button>:<button onClick={start} disabled={loading||busy||!!active} className="flex items-center gap-2 rounded-lg bg-blue-600 text-white px-3 py-2 text-sm disabled:opacity-50"><Play className="w-4 h-4" />{busy?'Starting…':'Start Job Time'}</button>}
    </div>
    {active && !runningHere && <p className="text-sm text-secondary">You have time running on another activity. Stop that activity before starting this Work Order.</p>}
    {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
    {showStop && active && profile && <ClockOutModal type="job" entryId={active.id} technicianId={profile.id} workOrderId={workOrderId} onClose={()=>setShowStop(false)} onSuccess={()=>{setShowStop(false);void load();onChanged();}} />}
  </div>;
}
