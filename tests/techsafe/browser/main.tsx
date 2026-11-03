import React from 'react';
import { createRoot } from 'react-dom/client';
import ProductTechsafeExclusion from '../../../src/components/Products/ProductTechsafeExclusion';
const canEdit = !new URLSearchParams(location.search).has('readonly');
createRoot(document.getElementById('root')!).render(<div style={{maxWidth:600,margin:'24px auto',padding:16}}><h1>Product details</h1><ProductTechsafeExclusion productId="product-1" canEdit={canEdit} /></div>);
