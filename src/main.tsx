import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { PortalProposalEngagement } from './components/Portal/PortalProposalEngagement';
import './index.css';
import './proposal-workflow.css';
import './responsive-modals.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => {
        // SW is registered for push notifications and offline caching.
        // We intentionally do NOT poll for updates or auto-reload on
        // controllerchange. Auto-reloading destroys in-memory form state
        // when a backgrounded tab picks up a new SW, causing users to
        // lose unsaved work. The next full page load (user-initiated)
        // will pick up any pending SW update naturally.
      })
      .catch(() => {
        // Service workers are unavailable in some hosted development browsers.
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <PortalProposalEngagement />
  </>
);
