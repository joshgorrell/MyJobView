import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { isProposalChoice, proposalChoices, type ProposalChoice } from '../../../supabase/functions/_shared/proposalCheckOptions';
type PreviewBrand={company_name:string;company_logo_url:string;owner_name:string|null;owner_email:string|null};
export default function ProposalCheckResponse({previewChoice,previewBrand}:{previewChoice?:ProposalChoice;previewBrand?:PreviewBrand}={}) {
 const previewOnly=!!previewChoice;
 const params=new URLSearchParams(window.location.search);const token=params.get('token')||'';
 const initial=previewChoice||params.get('choice');const [choice,setChoice]=useState<ProposalChoice>(isProposalChoice(initial)?initial:'considering');
 const [step,setStep]=useState('');const [message,setMessage]=useState('');const [loading,setLoading]=useState(!previewOnly);const [unavailable,setUnavailable]=useState(false);
 const [loadAttempt,setLoadAttempt]=useState(0);
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [sent,setSent]=useState(false);
 const [brand,setBrand]=useState(previewBrand||{company_name:'Our team',company_logo_url:'',owner_name:window.location.hostname==='elife.myjobview.com'?'Josh Gorrell':null as string|null,owner_email:window.location.hostname==='elife.myjobview.com'?'josh@electroniclife.com':null as string|null});
 const pending=useRef(Promise.resolve());const sendKey=useRef(crypto.randomUUID());
 async function action(body: Record<string,unknown>) {
  const {data,error}=await supabase.functions.invoke('proposal-check-response',{body:{token,...body}});
  if(error||data?.error)throw Error(data?.error||'Your response could not be saved. Please try again.');return data;
 }
 useEffect(()=>{if(previewOnly)return;let active=true;setLoading(true);setUnavailable(false);action({action:'load'}).then(data=>{if(active)setBrand(data)}).catch(()=>{if(active)setUnavailable(true)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[token,loadAttempt,previewOnly]);
 function track(next:ProposalChoice,nextStep:string) {
  if(previewOnly)return;
  const event_key=crypto.randomUUID();
  pending.current=pending.current.then(async()=>{try{await action({action:'interaction',choice:next,step:nextStep||null,event_key});setError('')}catch{setError('We could not save your selection yet. You can still send your message or try your selection again.')}});
 }
 async function submit(e:React.FormEvent) {e.preventDefault();if(busy)return;if(previewOnly){setSent(true);return;}setBusy(true);setError('');try{await pending.current;await action({action:'message',choice,step:step||null,message,event_key:sendKey.current});setSent(true)}catch(e){setError(e instanceof Error?e.message:'Please try again.')}finally{setBusy(false)}}
 const field='w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900';
 return <main className="min-h-screen bg-slate-100 p-3 text-slate-900 sm:p-6"><div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
  {brand.company_logo_url&&<img src={brand.company_logo_url} alt={brand.company_name} referrerPolicy="no-referrer" className="mb-5 max-h-16 max-w-full object-contain"/>}
  <p className="text-sm font-semibold text-cyan-800">{brand.company_name}</p>
  {previewOnly&&<p role="status" className="my-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Preview only — choices and messages here are not saved or sent.</p>}
  <h1 className="mt-2 text-2xl font-bold">{sent?'Thank you for your feedback!':'What do you think of your proposal?'}</h1>
  {loading?<p role="status" className="mt-5">Loading your response page…</p>:unavailable?<div className="mt-5"><p role="alert">We could not load this response page. The link may be unavailable or expired, or there may be a connection problem.</p><button type="button" onClick={()=>setLoadAttempt(v=>v+1)} className="my-3 min-h-11 rounded-lg border border-cyan-800 px-4 text-cyan-800">Try again</button><p>Please reply to your original email for help.</p></div>:sent?<div role="status" className="mt-5 space-y-3"><p>{previewOnly?'This is how the customer confirmation will look. No message was sent.':'Your message has been sent to our team. We appreciate the opportunity to help.'}</p><p>Your feedback: <strong>{proposalChoices[choice].label}</strong>{step&&` · ${step}`}</p><p className="text-sm text-slate-600">This feedback does not approve or cancel your proposal.</p></div>:<form onSubmit={submit} className="mt-6 space-y-6">
   <fieldset disabled={busy}><legend className="mb-3 font-semibold">Your feedback</legend><div className="grid gap-2 sm:grid-cols-2">{Object.entries(proposalChoices).map(([key,value])=><button type="button" key={key} aria-pressed={choice===key} onClick={()=>{setChoice(key as ProposalChoice);setStep('');sendKey.current=crypto.randomUUID();track(key as ProposalChoice,'')}} className={`min-h-12 rounded-lg border p-3 text-left font-semibold ${choice===key?'border-cyan-700 bg-cyan-50 text-cyan-900':'border-slate-300 bg-white'}`}>{value.label}</button>)}</div></fieldset>
   <fieldset disabled={busy}><legend className="mb-3 font-semibold">How can we help next? (optional)</legend><div className="space-y-2">{proposalChoices[choice].steps.map(value=><label key={value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-slate-300 p-3"><input type="radio" name="next-step" checked={step===value} onChange={()=>{setStep(value);sendKey.current=crypto.randomUUID();track(choice,value)}}/>{value}</label>)}</div>{step&&<button type="button" className="mt-2 min-h-11 text-sm text-cyan-800" onClick={()=>{setStep('');sendKey.current=crypto.randomUUID();track(choice,'')}}>Clear next step</button>}</fieldset>
   <label className="block font-semibold">Message (optional)<textarea disabled={busy} value={message} maxLength={5000} rows={4} onChange={e=>{setMessage(e.target.value);sendKey.current=crypto.randomUUID()}} placeholder="Tell us what would help, or what you’d like us to change." className={`${field} mt-2 font-normal`}/></label>
   <p className="text-sm text-slate-600">Your button choice and selected next step help us follow up, even if you don’t send a message. Choose a next step or write a message to contact our team. Approval of your proposal is a separate step.</p>
   {error&&<p role="alert" className="text-red-700">{error}</p>}
   <button disabled={busy||(!step&&!message.trim())} className="min-h-12 w-full rounded-lg bg-cyan-800 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy?'Sending…':'Send message'}</button>
  </form>}
  <footer className="mt-7 border-t border-slate-200 pt-5 text-sm leading-7">Anything else? {brand.owner_email?<span>Email {brand.owner_name?<strong>{brand.owner_name}, Owner</strong>:'our team'} at <a className="break-all font-semibold text-cyan-800 underline" href={`mailto:${brand.owner_email}`}>{brand.owner_email}</a>.</span>:<span>Reply to your original email and we’ll help.</span>}</footer>
 </div></main>;
}
