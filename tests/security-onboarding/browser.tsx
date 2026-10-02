// Local component fixture; all network calls are intercepted by browser.mjs.
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
const review = new URLSearchParams(window.location.search).has('review');
const staff = new URLSearchParams(window.location.search).has('staff');
ReactDOM.createRoot(document.getElementById('root')!).render(review ? <ReviewFixture/> : staff
  ? <CreateSecurityContractModal prefill={{ contactId: '00000000-0000-0000-0000-000000000004', templateId: 'template-1', serviceIds: ['service-1'] }} onClose={() => {}} onSuccess={() => {}} />
  : <TenantProvider><SecurityOnboardingPortal /></TenantProvider>);
