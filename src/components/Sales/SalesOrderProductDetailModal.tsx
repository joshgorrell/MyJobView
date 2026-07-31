import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Package, Loader2, FileText, ShoppingCart, Wrench, ClipboardList, Boxes, MapPin, ChevronDown, ChevronRight, Check, AlertCircle, Layers } from 'lucide-react';
import ProductDetailPanel, { type ProductDetailPanelData } from '../Products/ProductDetailPanel';

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  line_total: number;
  product_id: string;
  products?: {
    name: string;
    sku: string | null;
  } | null;
}

interface SalesOrderProductDetailModalProps {
  lineItem: LineItem;
  onClose: () => void;
  onSaved?: () => void;
  orderId?: string;
  proposalId?: string;
  projectId?: string | null;
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface RoomUsage {
  roomId: string;
  roomName: string;
  quantity: number;
  lineTotal: number;
}

interface ChangeOrderUsage {
  id: string;
  changeOrderNumber: string;
  title: string | null;
  status: string;
  quantity: number;
  lineTotal: number;
}

interface PartsRequestUsage {
  requestId: string;
  requestNumber: string;
  status: string;
  quantityRequested: number;
  date: string;
}

interface WorkOrderUsage {
  id: string;
  workOrderNumber: string;
  status: string;
  title: string | null;
  date: string;
}

export function SalesOrderProductDetailModal({
  lineItem,
  onClose,
  orderId,
  proposalId,
  projectId,
}: SalesOrderProductDetailModalProps) {
  const [panelData, setPanelData] = useState<ProductDetailPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [productName, setProductName] = useState(lineItem.products?.name || lineItem.description);
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);

  const [jobUsageLoading, setJobUsageLoading] = useState(false);
  const [roomUsage, setRoomUsage] = useState<RoomUsage[]>([]);
  const [changeOrderUsage, setChangeOrderUsage] = useState<ChangeOrderUsage[]>([]);
  const [partsRequestUsage, setPartsRequestUsage] = useState<PartsRequestUsage[]>([]);
  const [workOrderUsage, setWorkOrderUsage] = useState<WorkOrderUsage[]>([]);
  const [stockOnHand, setStockOnHand] = useState<number | null>(null);
  const [jobUsageExpanded, setJobUsageExpanded] = useState(true);

  useEffect(() => {
    loadProduct();
    if (proposalId || orderId || projectId) {
      loadJobUsage();
    }
  }, [lineItem.id]);

  async function loadProduct() {
    try {
      const { data: p, error } = await supabase
        .from('products')
        .select(`
          id, manufacturer_model_number, name, category, subcategory, sku, upc,
          inventory_type, item_color, item_size, cost, our_price, unit_price, msrp,
          image_url, thumbnail_url, manufacturer_url, supplier_url,
          product_sheet_url, install_video_url, description, specifications,
          default_labor_hours, labor_phase_id,
          manufacturers(name), labor_phases(name, default_price)
        `)
        .eq('id', lineItem.product_id)
        .maybeSingle();

      if (error) throw error;
      if (!p) return;

      const mfr = Array.isArray(p.manufacturers) ? p.manufacturers[0] ?? null : p.manufacturers;
      const lp = Array.isArray(p.labor_phases) ? p.labor_phases[0] ?? null : p.labor_phases;

      setProductName(p.manufacturer_model_number || p.name || lineItem.description);
      setCategory(p.category || null);
      setSubcategory(p.subcategory || null);

      setPanelData({
        productId: p.id,
        productName: p.manufacturer_model_number || p.name || '',
        sku: p.sku || null,
        upc: p.upc || null,
        category: p.category || null,
        subcategory: p.subcategory || null,
        inventoryType: p.inventory_type || null,
        itemColor: p.item_color || null,
        itemSize: p.item_size || null,
        manufacturerName: mfr?.name || null,
        imageUrl: p.image_url || p.thumbnail_url || null,
        manufacturerUrl: p.manufacturer_url || null,
        supplierUrl: p.supplier_url || null,
        productSheetUrl: p.product_sheet_url || null,
        installVideoUrl: p.install_video_url || null,
        description: p.description || null,
        specifications: p.specifications || null,
        unitPrice: Number(p.our_price || p.unit_price || 0),
        cost: Number(p.cost || 0),
        msrp: p.msrp ? Number(p.msrp) : null,
        quantity: lineItem.quantity,
        unit: lineItem.unit || 'ea',
        laborHours: Number(p.default_labor_hours || 0),
        laborRate: Number(lp?.default_price || 0),
        laborPhaseId: p.labor_phase_id || null,
        laborPhaseName: lp?.name || null,
        classId: null,
        taskNotes: null,
        showTaskNotes: false,
        isTaxable: false,
        isHidden: false,
        isCustomerSupplied: false,
        isLaborItem: false,
      });
    } catch (err) {
      console.error('Error loading product:', err);
    } finally {
      setLoading(false);
    }
  }

  const loadJobUsage = useCallback(async () => {
    if (!lineItem.product_id) return;
    const pid = lineItem.product_id;
    setJobUsageLoading(true);

    try {
      const queries: Promise<void>[] = [];

      // 1. Room usage within this proposal
      if (proposalId) {
        queries.push((async () => {
          const { data, error } = await supabase
            .from('proposal_line_items')
            .select(`
              id, quantity, line_total, room_id,
              proposal_rooms!inner(id, name)
            `)
            .eq('product_id', pid)
            .eq('proposal_id', proposalId)
            .order('room_id');
          if (error) return;
          const roomMap = new Map<string, RoomUsage>();
          (data || []).forEach((row: any) => {
            const roomId = row.room_id || '__none__';
            const roomName = row.proposal_rooms?.name || 'No Room / Area';
            const existing = roomMap.get(roomId);
            if (existing) {
              existing.quantity += row.quantity || 0;
              existing.lineTotal += row.line_total || 0;
            } else {
              roomMap.set(roomId, {
                roomId,
                roomName,
                quantity: row.quantity || 0,
                lineTotal: row.line_total || 0,
              });
            }
          });
          setRoomUsage(Array.from(roomMap.values()));
        })());
      }

      // 2. Change orders on this sales order
      if (orderId) {
        queries.push((async () => {
          const { data: cos } = await supabase
            .from('change_orders')
            .select('id, change_order_number, title, status')
            .eq('sales_order_id', orderId);
          if (!cos || cos.length === 0) return;
          const coIds = cos.map(c => c.id);
          const { data: coItems, error } = await supabase
            .from('change_order_line_items')
            .select('id, quantity, line_total, change_order_id')
            .eq('product_id', pid)
            .in('change_order_id', coIds);
          if (error) return;
          const coMap = new Map(cos.map(c => [c.id, c]));
          const result: ChangeOrderUsage[] = [];
          (coItems || []).forEach((row: any) => {
            const co = coMap.get(row.change_order_id);
            if (co) {
              result.push({
                id: co.id,
                changeOrderNumber: co.change_order_number,
                title: co.title,
                status: co.status,
                quantity: row.quantity || 0,
                lineTotal: row.line_total || 0,
              });
            }
          });
          setChangeOrderUsage(result);
        })());
      }

      // 3. Parts requests on this sales order
      if (orderId) {
        queries.push((async () => {
          const { data: reqs } = await supabase
            .from('product_requests')
            .select('id, request_number, status, created_at')
            .eq('sales_order_id', orderId)
            .order('created_at', { ascending: false });
          if (!reqs || reqs.length === 0) return;
          const reqIds = reqs.map(r => r.id);
          const { data: reqItems, error } = await supabase
            .from('product_request_items')
            .select('quantity_requested, request_id')
            .eq('product_id', pid)
            .in('request_id', reqIds);
          if (error) return;
          const reqMap = new Map(reqs.map(r => [r.id, r]));
          const result: PartsRequestUsage[] = [];
          (reqItems || []).forEach((row: any) => {
            const req = reqMap.get(row.request_id);
            if (req) {
              result.push({
                requestId: req.id,
                requestNumber: req.request_number || `PR-${req.id.slice(0, 8)}`,
                status: req.status,
                quantityRequested: row.quantity_requested || 0,
                date: req.created_at,
              });
            }
          });
          setPartsRequestUsage(result);
        })());
      }

      // 4. Work orders on this project
      if (projectId) {
        queries.push((async () => {
          const { data, error } = await supabase
            .from('work_orders')
            .select('id, work_order_number, status, title, created_at')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });
          if (error) return;
          const result: WorkOrderUsage[] = (data || []).map((wo: any) => ({
            id: wo.id,
            workOrderNumber: wo.work_order_number,
            status: wo.status,
            title: wo.title,
            date: wo.created_at,
          }));
          setWorkOrderUsage(result);
        })());
      }

      // 5. Stock on hand
      queries.push((async () => {
        const { data, error } = await supabase
          .from('product_inventory')
          .select('quantity_on_hand')
          .eq('product_id', pid);
        if (error) return;
        const total = (data || []).reduce((sum: number, row: any) => sum + (row.quantity_on_hand || 0), 0);
        setStockOnHand(total);
      })());

      await Promise.all(queries);
    } catch (err) {
      console.error('Error loading job usage:', err);
    } finally {
      setJobUsageLoading(false);
    }
  }, [lineItem.product_id, proposalId, orderId, projectId]);

  const hasJobUsage = roomUsage.length > 0 || changeOrderUsage.length > 0 || partsRequestUsage.length > 0 || workOrderUsage.length > 0;
  const totalQtyInJob = roomUsage.reduce((s, r) => s + r.quantity, 0);
  const needsOrdering = stockOnHand !== null && stockOnHand < totalQtyInJob;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-none sm:rounded-xl shadow-2xl w-full max-w-5xl flex flex-col h-screen sm:h-auto sm:max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-blue-500" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900 truncate">{productName}</h2>
              {category && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {category}{subcategory ? ` / ${subcategory}` : ''}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0 ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Line item summary bar */}
        <div className="px-5 py-2.5 bg-blue-50 border-b border-blue-100 shrink-0 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-gray-600">
            <span className="font-medium text-gray-900">{lineItem.quantity}</span>
            <span className="text-gray-500">{lineItem.unit || 'ea'}</span>
            <span className="text-gray-400 mx-1">×</span>
            <span className="font-medium text-gray-900">${fmt(lineItem.unit_price)}</span>
          </div>
          <div className="h-4 w-px bg-blue-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Line Total:</span>
            <span className="font-semibold text-gray-900">${fmt(lineItem.line_total)}</span>
          </div>
          <div className="flex-1" />
          <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full font-medium">View Only</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <span className="text-sm text-gray-500">Loading product details...</span>
            </div>
          ) : panelData ? (
            <>
              <ProductDetailPanel mode="view" data={panelData} />

              {/* Where It's Used in This Job */}
              {(proposalId || orderId || projectId) && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setJobUsageExpanded(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {jobUsageExpanded
                        ? <ChevronDown className="w-4 h-4 text-gray-500" />
                        : <ChevronRight className="w-4 h-4 text-gray-500" />
                      }
                      <Layers className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-semibold text-gray-800">Where It's Used in This Job</span>
                      {stockOnHand !== null && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          needsOrdering
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {needsOrdering ? (
                            <span className="flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Needs Ordering ({stockOnHand} on hand)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              In Stock ({stockOnHand})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    {hasJobUsage && !jobUsageLoading && (
                      <span className="text-xs text-gray-500">
                        {roomUsage.length} room{roomUsage.length !== 1 ? 's' : ''}
                        {changeOrderUsage.length > 0 && ` · ${changeOrderUsage.length} change order${changeOrderUsage.length !== 1 ? 's' : ''}`}
                        {partsRequestUsage.length > 0 && ` · ${partsRequestUsage.length} parts request${partsRequestUsage.length !== 1 ? 's' : ''}`}
                        {workOrderUsage.length > 0 && ` · ${workOrderUsage.length} work order${workOrderUsage.length !== 1 ? 's' : ''}`}
                      </span>
                    )}
                  </button>

                  {jobUsageExpanded && (
                    <div className="p-4 space-y-4">
                      {jobUsageLoading ? (
                        <div className="flex items-center justify-center py-8 gap-3">
                          <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                          <span className="text-sm text-gray-500">Loading job usage...</span>
                        </div>
                      ) : !hasJobUsage ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                            <Layers className="w-5 h-5 text-gray-400" />
                          </div>
                          <p className="text-sm text-gray-500">Not used elsewhere in this job</p>
                          <p className="text-xs text-gray-400">This product only appears in the current line item</p>
                        </div>
                      ) : (
                        <>
                          {/* Rooms / Areas */}
                          {roomUsage.length > 0 && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-2">
                                <MapPin className="w-3.5 h-3.5 text-blue-500" />
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Rooms / Areas</span>
                                <span className="text-xs text-gray-400">({roomUsage.length})</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {roomUsage.map(r => (
                                  <div key={r.roomId} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                                    <span className="text-sm text-gray-800 truncate">{r.roomName}</span>
                                    <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0 ml-2">
                                      <span className="font-medium text-gray-700">{fmt(r.quantity)} {lineItem.unit || 'ea'}</span>
                                      <span className="text-gray-400">${fmt(r.lineTotal)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Change Orders */}
                          {changeOrderUsage.length > 0 && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-2">
                                <FileText className="w-3.5 h-3.5 text-amber-500" />
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Change Orders</span>
                                <span className="text-xs text-gray-400">({changeOrderUsage.length})</span>
                              </div>
                              <div className="space-y-1.5">
                                {changeOrderUsage.map(co => (
                                  <div key={co.id} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-sm font-medium text-gray-800">{co.changeOrderNumber}</span>
                                      {co.title && <span className="text-xs text-gray-500 truncate">— {co.title}</span>}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs shrink-0 ml-2">
                                      <span className="font-medium text-gray-700">{fmt(co.quantity)} {lineItem.unit || 'ea'}</span>
                                      <span className="text-gray-400">${fmt(co.lineTotal)}</span>
                                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                        co.status === 'approved' ? 'bg-green-100 text-green-700'
                                        : co.status === 'pending' ? 'bg-amber-100 text-amber-700'
                                        : co.status === 'rejected' ? 'bg-red-100 text-red-700'
                                        : 'bg-gray-100 text-gray-600'
                                      }`}>{co.status}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Parts Requests */}
                          {partsRequestUsage.length > 0 && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-2">
                                <ShoppingCart className="w-3.5 h-3.5 text-teal-500" />
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Parts Requests</span>
                                <span className="text-xs text-gray-400">({partsRequestUsage.length})</span>
                              </div>
                              <div className="space-y-1.5">
                                {partsRequestUsage.map(pr => (
                                  <div key={pr.requestId} className="flex items-center justify-between bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <ClipboardList className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                                      <span className="text-sm font-medium text-gray-800">{pr.requestNumber}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs shrink-0 ml-2">
                                      <span className="font-medium text-gray-700">{fmt(pr.quantityRequested)} requested</span>
                                      <span className="text-gray-400">{new Date(pr.date).toLocaleDateString()}</span>
                                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                        pr.status === 'fulfilled' || pr.status === 'received' ? 'bg-green-100 text-green-700'
                                        : pr.status === 'pending' ? 'bg-amber-100 text-amber-700'
                                        : pr.status === 'cancelled' ? 'bg-red-100 text-red-700'
                                        : 'bg-gray-100 text-gray-600'
                                      }`}>{pr.status}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Work Orders */}
                          {workOrderUsage.length > 0 && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-2">
                                <Wrench className="w-3.5 h-3.5 text-purple-500" />
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Work Orders on This Project</span>
                                <span className="text-xs text-gray-400">({workOrderUsage.length})</span>
                              </div>
                              <div className="space-y-1.5">
                                {workOrderUsage.map(wo => (
                                  <div key={wo.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-sm font-medium text-gray-800">{wo.workOrderNumber}</span>
                                      {wo.title && <span className="text-xs text-gray-500 truncate">— {wo.title}</span>}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs shrink-0 ml-2">
                                      <span className="text-gray-400">{new Date(wo.date).toLocaleDateString()}</span>
                                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                        wo.status === 'completed' ? 'bg-green-100 text-green-700'
                                        : wo.status === 'in_progress' ? 'bg-blue-100 text-blue-700'
                                        : wo.status === 'open' ? 'bg-amber-100 text-amber-700'
                                        : 'bg-gray-100 text-gray-600'
                                      }`}>{wo.status}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Stock Summary */}
                          {stockOnHand !== null && (
                            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                              <Boxes className="w-4 h-4 text-gray-500 shrink-0" />
                              <div className="flex-1 flex items-center gap-4 text-sm">
                                <div>
                                  <span className="text-gray-500">On Hand: </span>
                                  <span className="font-medium text-gray-900">{fmt(stockOnHand)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Needed for This Job: </span>
                                  <span className="font-medium text-gray-900">{fmt(totalQtyInJob)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Shortfall: </span>
                                  <span className={`font-medium ${needsOrdering ? 'text-amber-600' : 'text-green-600'}`}>
                                    {needsOrdering ? fmt(totalQtyInJob - stockOnHand) : '0'}
                                  </span>
                                </div>
                              </div>
                              {needsOrdering && (
                                <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
                                  <AlertCircle className="w-3 h-3" />
                                  Needs Ordering
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
