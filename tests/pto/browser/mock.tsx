export const useAuth=()=>({user:{id:'me'},profile:{id:'me',role:'admin',organization_id:'org'}});
export const getOrganizationTimezone=async()=> 'America/Chicago';
export const formatTimeInTimezone=(s:string)=>s;export const formatDateInTimezone=(s:string)=>s.slice(0,10);
export const useToast=()=>({success:()=>{},error:(message:string)=>{(window as any).__errors.push(message);}});
const policy={id:'vacation',policy_name:'Vacation',pto_type:'vacation',is_paid:true,is_active:true};
const balance={id:'balance',current_balance_hours:80,pending_hours:0,used_hours_ytd:0,accrued_hours_ytd:0,policy,employee:{id:'me',full_name:'Josh',employment_type:'hourly'}};
const requests:any[]=[];
(window as any).__calls=[];(window as any).__errors=[];
const channel={on(){return channel;},subscribe(){return channel;},unsubscribe(){}};
function query(table:string){let single=false;const q:any=new Proxy({}, {get(_,key){if(key==='then')return(resolve:any)=>{const data=table==='pto_balances'?[balance]:table==='pto_requests'?requests:table==='time_entries'&&new URLSearchParams(location.search).get('surface')==='status'?[{technician_id:'me',clock_in:new Date().toISOString(),work_order:{id:'wo',title:'Job timer only'}}]:table==='pto_policies'?[policy]:table==='profiles'?[{id:'me',full_name:'Josh'}]:[];return Promise.resolve({data:single?(data[0]||null):data,error:null}).then(resolve);};return()=>{if(key==='single'||key==='maybeSingle')single=true;return q;};}});return q;}
export const supabase={from:query,channel:()=>channel,removeChannel:async()=>{},auth:{getUser:async()=>({data:{user:{id:'me'}}}),getSession:async()=>({data:{session:{user:{id:'me'}}}})},rpc(name:string,args:any){(window as any).__calls.push({name,args});let data:any=[];
 if(name==='preview_time_off')data=Array.from({length:5},(_,i)=>({date:`2027-01-0${4+i}`,hours:8,start:'08:00',end:'17:00'}));
 if(name==='submit_time_off'){balance.pending_hours=40;requests.push({id:'req',start_date:args.p_start,end_date:args.p_end,total_hours:40,status:'pending',reason:args.p_reason,review_notes:null,leave_days:null,policy,employee:{id:'me',full_name:'Josh'},submitted_at:new Date().toISOString()});data='req';}
 if(name==='cancel_time_off'){requests[0].status='cancelled';balance.pending_hours=0;}
 if(name==='team_time_off')data=[{request_id:'off',employee_id:'luis',employee_name:'Luis',leave_date:args.p_from,start_time:'08:00',end_time:'12:00',hours:4,full_day:false}];
 if(name==='team_work_schedule'){for(let day=new Date(args.p_from+'T12:00Z');day<=new Date(args.p_to+'T12:00Z');day.setUTCDate(day.getUTCDate()+1)){for(const [id,employee_name] of [['me','Josh'],['luis','Luis']])data.push({employee_id:id,employee_name,work_date:day.toISOString().slice(0,10),scheduled:day.getUTCDay()>0&&day.getUTCDay()<6});}}
 const result={data,error:null};return Object.assign(Promise.resolve(result),{range:()=>Promise.resolve(result)});
}};
export const createTimestampInTimezone=(date:string,time:string)=>date+'T'+time+':00Z';
export const normalizeDateString=(s:string)=>s;
