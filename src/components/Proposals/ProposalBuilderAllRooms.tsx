import React from 'react';
import { ProposalRoom, ProposalLineItem } from '../../lib/types';
import { Plus, ChevronDown, ChevronRight, GripVertical, Trash2 } from 'lucide-react';

interface ProposalBuilderAllRoomsProps {
  rooms: (ProposalRoom & { line_items: ProposalLineItem[]; expanded: boolean })[];
  onToggleRoom: (roomId: string) => void;
  onUpdateRoom: (roomId: string, updates: Partial<ProposalRoom>) => void;
  onDeleteRoom: (roomId: string) => void;
  onUpdateLineItem: (itemId: string, updates: Partial<ProposalLineItem>) => void;
  onDeleteLineItem: (itemId: string) => void;
  onAddProduct: (roomId: string) => void;
  onAddRoom: () => void;
}

export default function ProposalBuilderAllRooms({
  rooms,
  onToggleRoom,
  onUpdateRoom,
  onDeleteRoom,
  onUpdateLineItem,
  onDeleteLineItem,
  onAddProduct,
  onAddRoom
}: ProposalBuilderAllRoomsProps) {
  return (
    <div className="p-6 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* All Rooms Stacked Vertically */}
        {rooms.map((room, index) => (
          <div
            key={room.id}
            className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden"
          >
            {/* Room Header */}
            <div className="flex items-center gap-2 p-4 bg-gray-900 border-b border-gray-700">
              <button
                onClick={() => onToggleRoom(room.id)}
                className="text-gray-400 hover:text-white"
              >
                {room.expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </button>

              <GripVertical size={20} className="text-gray-500 cursor-move" />

              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={room.name}
                  onChange={(e) => onUpdateRoom(room.id, { name: e.target.value })}
                  className="w-full bg-transparent border-none text-white text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
                />
              </div>

              <span className="text-sm font-bold text-gray-200 flex-shrink-0 px-3">
                ${room.line_items.reduce((sum, item) => sum + (item.line_total || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>

              <button
                onClick={() => onDeleteRoom(room.id)}
                className="text-gray-400 hover:text-red-400"
              >
                <Trash2 size={18} />
              </button>
            </div>

            {/* Room Content */}
            {room.expanded ? (
              <div className="p-4">
                {/* Scope of Work */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Scope of Work
                  </label>
                  <textarea
                    value={room.description || ''}
                    onChange={(e) => onUpdateRoom(room.id, { description: e.target.value })}
                    placeholder="Describe the work to be done in this room..."
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm min-h-[80px]"
                  />
                </div>

                {/* Line Items */}
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="text-xs text-gray-400 border-b border-gray-700">
                      <tr>
                        <th className="text-left py-2 px-2">Description</th>
                        <th className="text-right py-2 px-2 w-24">Qty</th>
                        <th className="text-right py-2 px-2 w-24">Unit</th>
                        <th className="text-right py-2 px-2 w-32">Price</th>
                        <th className="text-right py-2 px-2 w-32">Total</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {room.line_items.map((item) => (
                        <tr key={item.id} className="border-b border-gray-700">
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => onUpdateLineItem(item.id, { description: e.target.value })}
                              className="w-full bg-transparent border-none text-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => onUpdateLineItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-transparent border-none text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                              min="0"
                              step="0.01"
                            />
                          </td>
                          <td className="py-2 px-2 text-gray-400 text-right">{item.unit}</td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) => onUpdateLineItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-transparent border-none text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                              min="0"
                              step="0.01"
                            />
                          </td>
                          <td className="py-2 px-2 text-right text-white font-semibold">
                            ${item.line_total?.toFixed(2) || '0.00'}
                          </td>
                          <td className="py-2 px-2">
                            <button
                              onClick={() => onDeleteLineItem(item.id)}
                              className="text-gray-400 hover:text-red-400"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  onClick={() => onAddProduct(room.id)}
                  className="mt-3 flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                >
                  <Plus size={16} />
                  Add Product
                </button>

                {/* Room Subtotal */}
                <div className="flex justify-end mt-4 pt-4 border-t border-gray-700">
                  <div className="text-right">
                    <div className="text-sm text-gray-400">Room Subtotal</div>
                    <div className="text-lg font-bold text-white">
                      ${room.line_items.reduce((sum, item) => sum + (item.line_total || 0), 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // Collapsed View
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-gray-400 line-clamp-2 mb-2">
                      {room.description || 'No scope defined'}
                    </p>
                    <div className="text-xs text-gray-500">
                      {room.line_items.length} item{room.line_items.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-sm text-gray-400">Subtotal</div>
                    <div className="text-lg font-bold text-white">
                      ${room.line_items.reduce((sum, item) => sum + (item.line_total || 0), 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add Room Button */}
        <button
          onClick={onAddRoom}
          className="w-full py-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Add Room
        </button>
      </div>
    </div>
  );
}
