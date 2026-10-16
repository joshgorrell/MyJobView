import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from '../../src/contexts/AuthContext';
import SinglePageProductForm from '../../src/components/Products/SinglePageProductForm';
import { ProductDetailModal } from '../../src/components/Products/ProductDetailModal';
import '../../src/index.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<AuthProvider>{new URLSearchParams(location.search).has('add-product')
  ? <SinglePageProductForm onClose={()=>{document.title='Product form closed';}} onSave={()=>{}}/>
  : <ProductDetailModal productId="product-fixture" onClose={()=>{document.title='Product closed';}}/>}</AuthProvider>);
