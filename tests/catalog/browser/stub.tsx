export default function Stub({productId, duplicateFromId, onClose}: any){return <div><span data-testid="stub-product-id">{productId || duplicateFromId}</span>{onClose && <button onClick={onClose}>Close test details</button>}</div>;}
export const ProductDetailModal=Stub;
