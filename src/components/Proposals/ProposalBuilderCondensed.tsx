import React from 'react';
import { ProposalRoom, ProposalLineItem } from '../../lib/types';
import { Plus, ChevronDown, ChevronRight, GripVertical, Trash2 } from 'lucide-react';

interface ProposalBuilderCondensedProps {
  rooms: (ProposalRoom & { line_items: ProposalLineItem[]; expanded: boolean })[];
  onToggleRoom: (roomId: string) => void;
  onUpdateRoom: (roomId: string, updates: Partial<ProposalRoom>) => void;
  onDeleteRoom: (roomId: string) => void;
  onUpdateLineItem: (itemId: string, updates: Partial<ProposalLineItem>) => void;
  onDeleteLineItem: (itemId: string) => void;
  onAddProduct: (roomId: string) => void;
  onAddRoom: () => void;
}

export default function ProposalBuilderCondensed({
  rooms,
  onToggleRoom,
  onUpdateRoom,
  onDeleteRoom,
  onUpdateLineItem,
  onDeleteLineItem,
  onAddProduct,
  onAddRoom
}: ProposalBuilderCondensedProps) {
  return (
    <div className="p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Grid of Compact Room Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden hover:border-gray-600 transition-colors"
            >
              {/* Room Header */}
              <div className="p-3 bg-gray-900 border-b border-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => onToggleRoom(room.id)}
                    className="text-gray-400 hover:text-white flex-shrink-0"
                  >
                    {room.expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>
                  <GripVertical size={18} className="text-gray-500 cursor-move flex-shrink-0" />
                  <input
                    type="text"
                    value={room.name}
                    onChange={(e) => onUpdateRoom(room.id, { name: e.target.value })}
                    className="flex-1 bg-transparent border-none text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1 py-0.5 text-sm"
                  />
                  <button
                    onClick={() => onDeleteRoom(room.id)}
                    className="text-gray-400 hover:text-red-400 flex-shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {/* Scope Preview */}
                <div className="text-xs text-gray-400 line-clamp-1">
                  {room.description || 'No scope defined'}
                </div>
              </div>

              {/* Room Content */}
              <div className="p-3">
                {room.expanded ? (
                  <>
                    {/* Full Scope */}
                    <textarea
                      value={room.description || ''}
                      onChange={(e) => onUpdateRoom(room.id, { description: e.target.value })}
                      placeholder="Scope of work..."
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-xs mb-3 min-h-[60px]"
                    />

                    {/* Line Items Table - Compact */}
                    <div className="overflow-x-auto mb-2">
                      <table className="min-w-full text-xs">
                        <thead className="text-gray-400 border-b border-gray-700">
                          <tr>
                            <th className="text-left py-1 px-1">Item</th>
                            <th className="text-right py-1 px-1 w-12">Qty</th>
                            <th className="text-right py-1 px-1 w-16">Price</th>
                            <th className="text-right py-1 px-1 w-16">Total</th>
                            <th className="w-6"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {room.line_items.map((item) => (
                            <tr key={item.id} className="border-b border-gray-700">
                              <td className="py-1 px-1">
                                <input
                                  type="text"
                                  value={item.description}
                                  onChange={(e) => onUpdateLineItem(item.id, { description: e.target.value })}
                                  className="w-full bg-transparent border-none text-white focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-0.5 text-xs"
                                />
                              </td>
                              <td className="py-1 px-1">
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => onUpdateLineItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                  className="w-full bg-transparent border-none text-white text-right focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-0.5 text-xs"
                                  min="0"
                                  step="0.01"
                                />
                              </td>
                              <td className="py-1 px-1">
                                <input
                                  type="number"
                                  value={item.unit_price}
                                  onChange={(e) => onUpdateLineItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })}
                                  className="w-full bg-transparent border-none text-white text-right focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-0.5 text-xs"
                                  min="0"
                                  step="0.01"
                                />
                              </td>
                              <td className="py-1 px-1 text-right text-white font-semibold text-xs">
                                ${item.line_total?.toFixed(2) || '0.00'}
                              </td>
                              <td className="py-1 px-1">
                                <button
                                  onClick={() => onDeleteLineItem(item.id)}
                                  className="text-gray-400 hover:text-red-400"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <button
                      onClick={() => onAddProduct(room.id)}
                      className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1"
                    >
                      <Plus size={12} />
                      Add Item
                    </button>
                  </>
                ) : (
                  // Collapsed View - Show Preview
                  <div className="space-y-1">
                    {room.line_items.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex justify-between text-xs text-gray-300">
                        <span className="truncate flex-1">{item.description}</span>
                        <span className="text-gray-400 ml-2">${item.line_total?.toFixed(2) || '0.00'}</span>
                      </div>
                    ))}
                    {room.line_items.length > 3 && (
                      <div className="text-xs text-gray-500">
                        +{room.line_items.length - 3} more items
                      </div>
                    )}
                    {room.line_items.length === 0 && (
                      <div className="text-xs text-gray-500 italic">No items yet</div>
                    )}
                  </div>
                )}

                {/* Room Subtotal */}
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-700">
                  <span className="text-xs text-gray-400 font-medium">Subtotal</span>
                  <span className="text-sm text-white font-bold">
                    ${room.line_items.reduce((sum, item) => sum + (item.line_total || 0), 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add Room Button */}
        <button
          onClick={onAddRoom}
          className="w-full mt-4 py-4 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Add Room
        </button>
      </div>
    </div>
  );
}
