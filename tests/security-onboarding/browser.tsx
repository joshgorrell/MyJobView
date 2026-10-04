import EditSecurityContractModal from '../../src/components/Finance/EditSecurityContractModal';
import ManualContractEntry from '../../src/components/Finance/ManualContractEntry';
// Local component fixture; all network calls are intercepted by browser.mjs.
import { SecurityActivationDates } from '../../src/components/Finance/SecurityActivationDates';
import { SecurityContractSummary } from '../../src/components/Portal/SecurityContractSummary';
import PrintSecurityOnboardingForm from '../../src/components/Finance/PrintSecurityOnboardingForm';
import React, { useState } from 'react';
import SecurityContractReviewFields from '../../src/components/Finance/SecurityContractReviewFields';
import ReactDOM from 'react-dom/client';
import { TenantProvider } from '../../src/contexts/TenantContext';
import SecurityOnboardingPortal from '../../src/components/Portal/SecurityOnboardingPortal';
import CreateSecurityContractModal from '../../src/components/Finance/CreateSecurityContractModal';
import '../../src/index.css';
function ReviewFixture() {
  const [record,setRecord]=useState((window as any).__reviewRecord);
  return <div className="security-onboarding-controls p-4"><SecurityContractReviewFields contract={record} canEdit={!new URLSearchParams(location.search).has('readonly')} onEditing={()=>{}} onSaved={async()=>setRecord(structuredClone((window as any).__reviewRecord))}/></div>;
}
function ActivationFixture() {
  const [start,setStart]=useState('');const [first,setFirst]=useState('');const [editing,setEditing]=useState(false);
  return <div className="security-onboarding-controls bg-white p-4"><SecurityActivationDates startDate={start} firstPaymentDate={first} onEditing={setEditing} onChange={(s,f)=>{setStart(s);setFirst(f);}}/><button disabled={editing || !start || !first}>Complete and Activate</button></div>;
}
const review = new URLSearchParams(window.location.search).has('review');
const staff = new URLSearchParams(window.location.search).has('staff');
ReactDOM.createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('edit') ? <EditSecurityContractModal contract={{id:'draft-contract',contact_id:'00000000-0000-0000-0000-000000000004',term_months:36,renewal_term_months:1,monthly_price:35,status:'draft',account_type:'residential',is_monitoring:true,services:[{service_id:'service-1'}]}} onClose={()=>{}} onSuccess={()=>{}}/> : new URLSearchParams(location.search).has('manual') ? <ManualContractEntry contract={{id:'manual-contract'}} onClose={()=>{document.title='Manual entry closed';}} onComplete={()=>{document.title='Manual entry submitted';}}/> : new URLSearchParams(location.search).has('activation') ? <ActivationFixture/> : new URLSearchParams(location.search).has('summary') ? <SecurityContractSummary summary={(window as any).__summary}/> : new URLSearchParams(location.search).has('print') ? <PrintSecurityOnboardingForm onClose={()=>{}}/> : review ? <ReviewFixture/> : staff
  ? <CreateSecurityContractModal prefill={{ contactId: '00000000-0000-0000-0000-000000000004', templateId: 'template-1', serviceIds: ['service-1'] }} onClose={() => {}} onSuccess={() => {}} />
  : <TenantProvider><SecurityOnboardingPortal /></TenantProvider>);
