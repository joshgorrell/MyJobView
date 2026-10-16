import React from 'react';
export const useAuth=()=>({profile:{id:'tech',organization_id:'org'}});
export const useEmployeeTimePolicy=()=>({ready:true,basis:location.search.includes('hourly')?'daily_clock':'work_allocation',dailyClock:location.search.includes('hourly')});
export const getOrganizationTimezone=async()=> 'America/Chicago';
export const formatDateInTimezone=()=> '2026-10-02';
export const formatTimeInTimezone=()=> '8:00 AM';
export const useToast=()=>({success(){},error(){},warning(){},info(){}});
export const gpsTrackingService={getPermissionState:async()=> 'prompt'};
const channel={on(){return channel;},subscribe(){return channel;},unsubscribe(){}};
export const supabase={channel:()=>channel,from(table:string){const q:any=new Proxy({}, {get(_,key){if(key==='then')return(resolve:any)=>resolve({error:null,data:table==='work_orders'?[{id:'wo',work_order_number:'WO-100',title:'Install Speakers',status:'assigned',scheduled_start_time:'08:00',project:{name:'Home'}}]:table==='time_entries'?null:table==='daily_clock_entries'||table==='daily_clock_breaks'?[]:{}});return()=>q;}});return q;}};
export const ManualJobTimeRequestModal=()=> <div>Manual request</div>;
export const RequestInternalTimeModal=()=> <div>Internal request</div>;
export const MyTimeView=()=> <div>Approved Job Time</div>;
export const AppointmentsCalendar=({personalOnly,onWorkOrderSelect}:any)=> <div><p>{personalOnly?'Personal daily calendar':'Wrong view'}</p><button onClick={()=>onWorkOrderSelect('calendar-wo')}>Scheduled Work Order</button></div>;

export const MyTimeOff=()=> <div>My PTO requests</div>;
export const TeamTimeOffPanel=()=> <div>Approved team absences</div>;
export const WorkOrderTimeControl=()=> <button>Start Job Time</button>;
export const TimeClockModal=()=> <button>Start Your Day</button>;

export const MyJobTimeView=()=> <div>Job time history</div>;
