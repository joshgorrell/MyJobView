import { useId, useState } from 'react';
import { ChevronDown, ChevronRight, Package, Eye, Pencil, Copy, Trash2 } from 'lucide-react';
import ProductsGridView from './ProductsGridView';
import { groupCatalogProducts, type CatalogGrouping, type CatalogProduct } from './catalogGrouping';

interface Props {
  products: CatalogProduct[];
  groupBy: CatalogGrouping;
  viewMode: 'list' | 'grid';
  revealMatches: boolean;
  canEdit: boolean;
  hideCost: boolean;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function ProductCatalogView(props: Props) {
  const { products, groupBy, revealMatches } = props;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [closedMatches, setClosedMatches] = useState<Set<string>>(new Set());
  const [previousProducts, setPreviousProducts] = useState(products);
  const [previousReveal, setPreviousReveal] = useState(revealMatches);
  const id = useId();
  // A new search/filter reveals its results; users can still collapse a result group.
  if (previousProducts !== products || previousReveal !== revealMatches) {
    setPreviousProducts(products);
    setPreviousReveal(revealMatches);
    setClosedMatches(new Set());
  }
  const groups = groupCatalogProducts(products, groupBy);
  const isOpen = (key: string) => revealMatches ? !closedMatches.has(key) : expanded.has(key);
  const toggle = (key: string) => {
    const setter = revealMatches ? setClosedMatches : setExpanded;
    setter(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };
  const content = (items: CatalogProduct[]) => props.viewMode === 'grid'
    ? <ProductsGridView {...props} products={items} showVendor={groupBy === 'none'} showBrand={groupBy !== 'brand'} />
    : <ProductList {...props} products={items} />;

  if (groupBy === 'none') return content(groups.flatMap(group => group.products));
  return <div className="min-w-0 space-y-2">
    <div className="flex justify-end gap-3 text-xs">
      <button type="button" className="min-h-9 text-blue-400" onClick={() => revealMatches ? setClosedMatches(new Set()) : setExpanded(new Set(groups.map(group => group.key)))}>Expand all</button>
      <button type="button" className="min-h-9 text-blue-400" onClick={() => revealMatches ? setClosedMatches(new Set(groups.map(group => group.key))) : setExpanded(new Set())}>Collapse all</button>
    </div>
    {groups.map((group, index) => {
      const open = isOpen(group.key);
      const panelId = `${id}-group-${index}`;
      return <section key={group.key} className="min-w-0 rounded-lg border border-gray-700 overflow-hidden">
        <h3><button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => toggle(group.key)}
          className="flex w-full min-w-0 items-center gap-2 bg-gray-800 px-3 py-2 text-left text-white hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
          {open ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />}
          <span className="min-w-0 flex-1 break-words text-sm font-medium">{group.label}</span>
          <span className="shrink-0 rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-300">{group.products.length} {group.products.length === 1 ? 'product' : 'products'}</span>
        </button></h3>
        <div id={panelId} hidden={!open}>{open && <div className="p-2">{content(group.products)}</div>}</div>
      </section>;
    })}
  </div>;
}

function ProductList({ products, groupBy, canEdit, hideCost, onView, onEdit, onDuplicate, onDelete }: Props) {
  const actions = (product: CatalogProduct) => <div className="flex items-center justify-end gap-1">
    <button type="button" aria-label={`View ${product.sku || product.manufacturer_model_number}`} onClick={() => onView(product.id)} className="p-2 text-green-400"><Eye size={16} /></button>
    {canEdit && <>
      <button type="button" aria-label={`Edit ${product.sku || product.manufacturer_model_number}`} onClick={() => onEdit(product.id)} className="p-2 text-blue-400"><Pencil size={16} /></button>
      <button type="button" aria-label={`Duplicate ${product.sku || product.manufacturer_model_number}`} onClick={() => onDuplicate(product.id)} className="p-2 text-purple-400"><Copy size={16} /></button>
      <button type="button" aria-label={`Delete ${product.sku || product.manufacturer_model_number}`} onClick={() => onDelete(product.id)} className="p-2 text-red-400"><Trash2 size={16} /></button>
    </>}
  </div>;
  const image = (product: CatalogProduct) => product.image_url
    ? <img src={product.image_url} alt="" className="h-10 w-10 shrink-0 rounded border border-gray-600 object-contain bg-white" />
    : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-gray-700"><Package size={18} className="text-gray-400" /></div>;
  const identity = (product: CatalogProduct) => <>
    {groupBy !== 'brand' && product.brandName && <div className="text-xs text-gray-400 break-words">{product.brandName}</div>}
    <div className="font-mono text-sm font-medium text-white break-all">{product.sku || product.manufacturer_model_number}</div>
  </>;
  const category = (product: CatalogProduct) => <div className="text-xs text-gray-400 break-words">{[product.categoryName, product.subcategoryName].filter(Boolean).join(' / ')}</div>;
  const price = (product: CatalogProduct) => `$${Number(product.our_price ?? product.unit_price ?? 0).toFixed(2)}`;
  return <>
    <div className="sm:hidden divide-y divide-gray-700">
      {products.map(product => <article key={product.id} className="min-w-0 py-2">
        <button type="button" onClick={() => onView(product.id)} className="flex w-full min-w-0 gap-2 text-left">
          {image(product)}<div className="min-w-0 flex-1">{identity(product)}
            <div className="line-clamp-2 break-words text-xs text-gray-300">{product.description || '-'}</div>{category(product)}
          </div>
        </button>
        <div className="flex flex-wrap items-center justify-between gap-1 pt-1">
          <div className="text-sm text-white">{price(product)}{!hideCost && <span className="ml-2 text-xs text-gray-400">Cost: ${Number(product.cost ?? 0).toFixed(2)}</span>}</div>{actions(product)}
        </div>
      </article>)}
    </div>
    <div className="hidden sm:block overflow-x-auto">
      <table className="w-full min-w-[900px] table-fixed text-sm">
        <colgroup>
          <col style={{ width: '24%' }} />
          <col />
          {groupBy !== 'vendor' && <col style={{ width: '14%' }} />}
          <col style={{ width: 96 }} />
          {!hideCost && <col style={{ width: 96 }} />}
          <col style={{ width: canEdit ? 144 : 48 }} />
        </colgroup>
        <thead className="border-b border-gray-700 text-xs text-gray-400"><tr>
          <th className="p-2 text-left">Model / SKU</th><th className="p-2 text-left">Description</th>
          {groupBy !== 'vendor' && <th className="p-2 text-left">Vendor</th>}
          <th className="p-2 text-right">Price</th>{!hideCost && <th className="p-2 text-right">Cost</th>}<th className="p-2 text-right">Actions</th>
        </tr></thead>
        <tbody>{products.map(product => <tr key={product.id} className="border-b border-gray-700 hover:bg-gray-800">
          <td className="p-2"><button type="button" className="flex w-full min-w-0 items-center gap-2 text-left" onClick={() => onView(product.id)}>{image(product)}<div className="min-w-0">{identity(product)}</div></button></td>
          <td className="p-2 text-gray-300"><div className="line-clamp-2 break-words" title={product.description || ''}>{product.description || '-'}</div>{category(product)}</td>
          {groupBy !== 'vendor' && <td className="p-2 text-xs text-gray-400 break-words">{product.vendorName || '—'}</td>}
          <td className="p-2 text-right text-white whitespace-nowrap">{price(product)}</td>
          {!hideCost && <td className="p-2 text-right text-gray-300 whitespace-nowrap">${Number(product.cost ?? 0).toFixed(2)}</td>}
          <td className="p-2">{actions(product)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}
