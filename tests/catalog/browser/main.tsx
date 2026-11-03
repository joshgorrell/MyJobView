import React from 'react';
import { createRoot } from 'react-dom/client';
import ProductsManagement from '../../../src/components/Products/ProductsManagement';
import '../../../src/index.css';
createRoot(document.getElementById('root')!).render(<div className="p-3 bg-gray-900 min-h-screen"><ProductsManagement /></div>);
