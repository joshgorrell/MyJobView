import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import SinglePageProductForm from '../../../src/components/Products/SinglePageProductForm';
import { ProductDetailModal } from '../../../src/components/Products/ProductDetailModal';
const mode = new URLSearchParams(location.search).get('mode');
createRoot(document.getElementById('root')!).render(mode === 'edit' ? <SinglePageProductForm productId="product" onClose={()=>{}} onSave={()=>{(window as any).saved=true;}} /> : <ProductDetailModal productId="product" onClose={()=>{}} />);
