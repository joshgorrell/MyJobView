import React from 'react';
import { createRoot } from 'react-dom/client';
import LostOpportunityReviews from '../../../src/components/Reviews/LostOpportunityReviews';
import '../../../src/index.css';
import LostOpportunityForm from '../../../src/components/Reviews/LostOpportunityForm';
createRoot(document.getElementById('root')!).render(window.location.search.includes("customer=1") ? <LostOpportunityForm /> : <LostOpportunityReviews />);
