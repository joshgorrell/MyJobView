export const useAuth=()=>({profile:{id:'tech',organization_id:'org'}});
export const AvailabilityBrowserModal=()=>null;
const fixtures:Record<string,any[]>={
 labor_phases:[{id:'rough',name:'Rough-in',is_active:true},{id:'trim',name:'Trim',is_active:true}],
 profiles:[{id:'tech',full_name:'Test Technician',role:'tech',is_active:true}],
 project_tasks:[{id:'assigned',title:'Assigned install',project_id:'p',labor_phase_id:'rough',status:'open',estimated_hours:2,labor_phase:{name:'Rough-in'}},{id:'reference',title:'Other rough work',project_id:'p',labor_phase_id:'rough',status:'open',estimated_hours:1,labor_phase:{name:'Rough-in'}},{id:'trim-task',title:'Trim work',project_id:'p',labor_phase_id:'trim',status:'open',estimated_hours:1,labor_phase:{name:'Trim'}},{id:'finished',title:'Finished work',project_id:'p',labor_phase_id:'rough',status:'completed',estimated_hours:1}],
 work_order_tasks:[{id:'wo-task',work_order_id:'wo',project_task_id:'assigned',title:'Assigned install',description:'Do this today',estimated_hours:2}],
};
export const supabase={from(table:string){const predicates:Array<(r:any)=>boolean>=[];let insert:any;const query:any={select(){return query;},order(){return query;},eq(k:string,v:any){predicates.push(r=>r[k]===v);return query;},in(k:string,vs:any[]){predicates.push(r=>vs.includes(r[k]));return query;},insert(value:any){insert=value;return query;},then(resolve:any){if(insert){(window as any).__inserts||=[];(window as any).__inserts.push({table,value:insert});}return Promise.resolve({data:insert&&table==='work_orders'?[{id:'new-wo'}]:(fixtures[table]||[]).filter(r=>predicates.every(p=>p(r))),error:null}).then(resolve);}};return query;},channel(){const channel:any={on(){return channel;},subscribe(){return channel;},unsubscribe(){}};return channel;}};
