import { useState } from 'react';
import { Pencil } from 'lucide-react';

export function SecurityActivationDates({ startDate, firstPaymentDate, onChange, onEditing }: {
  startDate:string; firstPaymentDate:string;
  onChange:(start:string,first:string)=>void; onEditing:(editing:boolean)=>void;
}) {
  const [editing,setEditing]=useState(false);
  const [draftStart,setDraftStart]=useState(startDate);
  const [draftFirst,setDraftFirst]=useState(firstPaymentDate);
  function close(){setEditing(false);onEditing(false);}
  return <section className="space-y-3 mb-4 text-gray-900">
    <p>Set these dates after installation and account setup. Customer completion does not start billing.</p>
    <button type="button" aria-label="Edit activation dates" onClick={()=>{setDraftStart(startDate);setDraftFirst(firstPaymentDate);setEditing(true);onEditing(true);}} className="text-blue-700"><Pencil className="inline w-4 h-4 mr-1"/>Edit activation dates</button>
    <label className="block">Monitoring starts<input aria-label="Monitoring starts" type="date" disabled={!editing} value={editing ? draftStart : startDate} onChange={e=>setDraftStart(e.target.value)} className="block w-full bg-white text-black border rounded p-2"/></label>
    <label className="block">First payment scheduled<input aria-label="First payment scheduled" type="date" disabled={!editing} value={editing ? draftFirst : firstPaymentDate} onChange={e=>setDraftFirst(e.target.value)} className="block w-full bg-white text-black border rounded p-2"/></label>
    <p className="text-sm">Allow at least 10 days for the payment notice. A delayed notice delays the debit.</p>
    {editing && <div className="flex gap-2"><button type="button" disabled={!draftStart || !draftFirst} onClick={()=>{onChange(draftStart,draftFirst);close();}} className="bg-blue-700 text-white border rounded p-2 disabled:opacity-50">Save activation dates</button><button type="button" onClick={close} className="border rounded p-2">Cancel</button></div>}
  </section>;
}
