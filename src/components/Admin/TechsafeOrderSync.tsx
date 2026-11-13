import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type ConnectedOrder = {connectionId: string; orderId: string; orderNumber: string; status: string; enabled: boolean};
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
export function TechsafeOrderSync() {
 const [orders,setOrders] = useState<ConnectedOrder[]>([]);
 const [selected,setSelected] = useState('');
 const [loading,setLoading] = useState(true);
 const [sending,setSending] = useState(false);
 const [message,setMessage] = useState('');
 const [failed,setFailed] = useState(false);
 useEffect(() => { let active=true;
  void (async () => {
   const {data,error} = await supabase.rpc('get_techsafe_connected_orders');
   if(!active)return;
   if(error || !Array.isArray(data) || !data.every(o => uuid(o.connectionId) && uuid(o.orderId) && typeof o.orderNumber === 'string' && typeof o.status === 'string' && typeof o.enabled === 'boolean')) {
    setFailed(true);setMessage('Unable to load connected Sales Orders.');
   } else {setOrders(data);setSelected(data[0]?.orderId || '');}
   setLoading(false);
  })();return () => {active=false;};
 },[]);
 const order=orders.find(o=>o.orderId===selected);
 const send=async()=>{
  if(sending||!order||!order.enabled||order.status!=='active')return;
  setSending(true);setMessage('');setFailed(false);
  try {
   const {data,error}=await supabase.functions.invoke('techsafe-send-sales-order',{body:{connectionId:order.connectionId,orderId:order.orderId}});
   if(error || data?.accepted!==true) {
    let reason=data?.reason;
    if(error && 'context' in error && error.context instanceof Response) {
     try {reason=(await error.context.json()).reason;} catch { /* Show safe fallback. */ }
    }
    setFailed(true);
    setMessage(typeof reason==='string' && /^[a-z_]{1,96}$/.test(reason) ? `Import not confirmed: ${reason.replace(/_/g,' ')}.` : 'Import not confirmed. The connection may be held or the server may be unavailable.');
   } else setMessage('Techsafe confirmed receipt of this Sales Order. No coverage was purchased.');
  } catch {setFailed(true);setMessage('Import not confirmed. Check the connection before retrying.');}
  finally {setSending(false);}
 };
 return <section className="border-t pt-5 space-y-3" aria-label="Send Sales Order to Techsafe">
  <h5 className="font-semibold text-gray-900">Send Sales Order to Techsafe</h5>
  <p className="text-sm text-gray-600">Import or refresh a connected Sales Order as a Techsafe draft. Approved source checks still apply.</p>
  {loading ? <p className="text-sm">Loading connected Sales Orders…</p> : orders.length ? <>
   <label className="block text-sm font-medium" htmlFor="techsafe-order">Sales Order</label>
   <select id="techsafe-order" value={selected} disabled={sending} onChange={e=>{setSelected(e.target.value);setMessage('');}} className="w-full rounded-md border p-2 text-sm">
    {orders.map(o=><option key={o.orderId} value={o.orderId}>{o.orderNumber}{!o.enabled || o.status!=='active' ? ' — paused' : ''}</option>)}
   </select>
   <button type="button" disabled={sending||!order?.enabled||order.status!=='active'} onClick={()=>void send()} className="rounded-md bg-blue-600 text-white px-4 py-2 text-sm disabled:opacity-50">{sending?'Sending…':'Send to Techsafe'}</button>
   {(!order?.enabled || order.status!=='active') && <p className="text-sm text-amber-800">This connection is paused. Import is unavailable until it is activated.</p>}
  </> : !failed ? <p className="text-sm text-gray-600">No connected Sales Orders.</p> : null}
  <p role="status" className={`text-sm ${failed?'text-red-700':'text-green-800'}`}>{message}</p>
 </section>;
}
