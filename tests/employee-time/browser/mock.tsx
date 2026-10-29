import React from 'react';
const profile={id:'tech',organization_id:'org'};
export const useAuth=()=>({profile});
export const useEmployeeTimePolicy=()=>({ready:true,loading:false,clockAccess:'both',basis:location.search.includes('hourly')?'daily_clock':location.search.includes('salary')?'salary':'work_allocation',dailyClock:location.search.includes('hourly')});
export const getOrganizationTimezone=async()=> 'America/Chicago';
export const formatDateInTimezone=()=> '2026-10-02';
export const formatTimeInTimezone=()=> '8:00 AM';
export const useToast=()=>({success(){},error(){},warning(){},info(){}});
export const gpsTrackingService={getPermissionState:async()=> 'prompt',captureLocationForClockEvent:async()=>null};
const channel={on(){return channel;},subscribe(){return channel;},unsubscribe(){}};
export const supabase={rpc:async(name:string,args:any)=>{(window as any).__timerCall={name,args};return {data:'timer-id',error:null};},channel:()=>channel,removeChannel:async()=> 'ok',from(table:string){const q:any=new Proxy({}, {get(_,key){if(key==='insert')return(payload:any)=>{(window as any).__timeWrite={table,payload};return q;};if(key==='then')return(resolve:any)=>resolve({error:null,data:table==='contacts'?[{id:'customer',full_name:'Test Customer',company_name:null}]:table==='projects'?[{id:'project',contact_id:'customer',name:'Test Project',project_number:'P-100',status:'active'}]:table==='work_orders'?(location.search.includes('empty')?[]:[{id:'wo',work_order_number:'WO-100',title:'Install Speakers',status:'assigned',type:'project',assigned_to:'tech',project_id:'project',contact_id:'customer',scheduled_start_time:'08:00',project:{name:'Home'}}]):['time_entries','daily_clock_entries','daily_clock_breaks','internal_time_sessions'].includes(table)?[]:table==='company_settings'?{shop_time_request_enabled:true,training_time_request_enabled:true}:{}});return()=>q;}});return q;}};
export const ManualJobTimeRequestModal=()=> <div>Manual request</div>;
export const RequestInternalTimeModal=()=> <div>Internal request</div>;
export const MyTimeView=()=> <div>{location.search.includes('salary')?'Recorded Job Time':'Approved Job Time'}</div>;
export const AppointmentsCalendar=({personalOnly,onWorkOrderSelect}:any)=> <div><p>{personalOnly?'Personal daily calendar':'Wrong view'}</p><button onClick={()=>onWorkOrderSelect('calendar-wo')}>Scheduled Work Order</button></div>;

export const MyTimeOff=()=> <div>My PTO requests</div>;
export const TeamTimeOffPanel=()=> <div>Approved team absences</div>;
export const WorkOrderTimeControl=()=> <button>Start Job Time</button>;
export const TimeClockModal=()=> <button>Start Your Day</button>;

export const MyJobTimeView=()=> <div>Job time history</div>;

export const CustomerTimeTimer=()=>null;
export const saveCustomerTimeGps=async()=>{};
export const createTimestampInTimezone=(date:string,time:string)=>`${date}T${time}:00Z`;
