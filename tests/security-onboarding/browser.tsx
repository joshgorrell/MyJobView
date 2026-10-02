// Local component fixture; all network calls are intercepted by browser.mjs.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { TenantProvider } from '../../src/contexts/TenantContext';
import SecurityOnboardingPortal from '../../src/components/Portal/SecurityOnboardingPortal';
import CreateSecurityContractModal from '../../src/components/Finance/CreateSecurityContractModal';
import '../../src/index.css';
const staff = new URLSearchParams(window.location.search).has('staff');
ReactDOM.createRoot(document.getElementById('root')!).render(staff
  ? <CreateSecurityContractModal prefill={{ contactId: '00000000-0000-0000-0000-000000000004', templateId: 'template-1', serviceIds: ['service-1'] }} onClose={() => {}} onSuccess={() => {}} />
  : <TenantProvider><SecurityOnboardingPortal /></TenantProvider>);
