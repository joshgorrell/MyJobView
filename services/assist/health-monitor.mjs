/** Sanitized Assist runtime health monitor; never returns secrets or raw errors. */
export function createHealthMonitor({store,plane,requeue,now=Date.now,intervalMs=15*60*1000,logger=()=>{}}){
 if(!store||!plane||typeof requeue!=='function')throw new Error('invalid_health_monitor');
 let running=false,timer=null,lastRunAt=null,lastRunStatus='never_run',lastErrorCode=null;
 const dealers=new Map();
 async function runOnce(){
  if(running)return {status:'already_running'};
  running=true;lastRunAt=new Date(now()).toISOString();let failed=0;
  try{
   const states=await store.list();
   for(const state of states){
    if(!state.desired_enabled)continue;
    try{
     const result=await plane.checkHealth(state.organization_id);
     if(result&&!result.healthy){
      failed++;let recovery='queued';
      try{await requeue(result.organization_id,result.generation);}catch{recovery='queue_failed';}
      dealers.set(state.organization_id,{generation:state.generation,status:'unhealthy',lastCheckedAt:lastRunAt,recovery});
      logger({event:'assist_health_unhealthy',generation:state.generation,recovery});
     }else{
      dealers.set(state.organization_id,{generation:state.generation,status:result?'healthy':'inactive',lastCheckedAt:lastRunAt,recovery:'not_needed'});
     }
    }catch{
     failed++;dealers.set(state.organization_id,{generation:state.generation,status:'check_failed',lastCheckedAt:lastRunAt,recovery:'not_attempted'});
     logger({event:'assist_health_check_failed',generation:state.generation});
    }
   }
   lastRunStatus=failed?'degraded':'healthy';lastErrorCode=null;
   return {status:lastRunStatus,checked:states.filter(s=>s.desired_enabled).length,failed};
  }catch{
   lastRunStatus='monitor_failed';lastErrorCode='state_list_failed';
   logger({event:'assist_health_inventory_failed'});
   return {status:lastRunStatus,checked:0,failed:1};
  }finally{running=false;}
 }
 function snapshot(){
  const entries=[...dealers.values()];
  return {status:lastRunStatus,lastRunAt,activeDealers:entries.length,unhealthyDealers:entries.filter(x=>x.status!=='healthy').length,
   dealers:entries.map(x=>({...x})),lastErrorCode};
 }
 function start(){if(timer)return;timer=setInterval(()=>{void runOnce();},intervalMs);timer.unref?.();}
 function stop(){if(timer){clearInterval(timer);timer=null;}}
 return {runOnce,snapshot,start,stop};
}
