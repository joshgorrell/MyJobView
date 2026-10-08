export default function ProductStatusNotice({ product }: { product?: { is_active?: boolean | null; is_discontinued?: boolean | null } | null }) {
  return <>
    {product?.is_active === false && <span className="inline-flex rounded border border-gray-500/50 bg-gray-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500">Archived</span>}
    {product?.is_discontinued && <span className="inline-flex rounded border border-red-500/50 bg-red-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-red-500">Discontinued</span>}
  </>;
}
