import React from 'react';import {createRoot} from 'react-dom/client';import '../../../src/index.css';
import {LeadForm} from '../../../src/components/Leads/LeadForm';
createRoot(document.getElementById('root')!).render(<LeadForm onClose={()=>{}} onSuccess={()=>{}}/>);
