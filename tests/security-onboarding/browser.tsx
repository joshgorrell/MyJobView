// Local component fixture; all network calls are intercepted by browser.mjs.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { TenantProvider } from '../../src/contexts/TenantContext';
import SecurityOnboardingPortal from '../../src/components/Portal/SecurityOnboardingPortal';
import '../../src/index.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<TenantProvider><SecurityOnboardingPortal /></TenantProvider>);
