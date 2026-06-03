import React from 'react';
import { ProposalRoom, ProposalLineItem } from '../../lib/types';
import { Plus, ChevronDown, ChevronRight, GripVertical, Trash2 } from 'lucide-react';

interface ProposalBuilderStandardProps {
  rooms: (ProposalRoom & { line_items: ProposalLineItem[]; expanded: boolean })[];
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  onToggleRoom: (roomId: string) => void;
  onUpdateRoom: (roomId: string, updates: Partial<ProposalRoom>) => void;
  onDeleteRoom: (roomId: string) => void;
  onUpdateLineItem: (itemId: string, updates: Partial<ProposalLineItem>) => void;
  onDeleteLineItem: (itemId: string) => void;
  onAddProduct: (roomId: string) => void;
  onAddRoom: () => void;
}

export default function ProposalBuilderStandard({
  rooms,
  selectedRoomId,
  onSelectRoom,
  onToggleRoom,
  onUpdateRoom,
  onDeleteRoom,
  onUpdateLineItem,
  onDeleteLineItem,
  onAddProduct,
  onAddRoom
}: ProposalBuilderStandardProps) {
  const selectedRoom = rooms.find(r => r.id === selectedRoomId);

  return (
    <div className="flex h-full">
      {/* Left Sidebar - Rooms List */}
      <div className="w-64 border-r border-gray-700 bg-gray-900 overflow-y-auto">
        <div className="p-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">Rooms</h3>
          <div className="space-y-1">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => onSelectRoom(room.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedRoomId === room.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <div className="font-medium truncate">{room.name}</div>
                <div className="text-xs opacity-75 mt-0.5">
                  {room.line_items.length} items
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={onAddRoom}
            className="w-full mt-3 py-2 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 flex items-center justify-center gap-2 text-sm"
          >
            <Plus size={16} />
            Add Room
          </button>
        </div>
      </div>

      {/* Main Content - Selected Room */}
      <div className="flex-1 overflow-y-auto">
        {selectedRoom ? (
          <div className="p-6">
            <div className="max-w-4xl mx-auto">
              {/* Room Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="text"
                    value={selectedRoom.name}
                    onChange={(e) => onUpdateRoom(selectedRoom.id, { name: e.target.value })}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => onDeleteRoom(selectedRoom.id)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2"
                  >
                    <Trash2 size={18} />
                    Delete Room
                  </button>
                </div>

                {/* Scope of Work - Collapsible */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg">
                  <button
                    onClick={() => onToggleRoom(selectedRoom.id)}
                    className="w-full flex items-center gap-2 p-3 text-left"
                  >
                    {selectedRoom.expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    <span className="font-semibold text-white">Scope of Work</span>
                  </button>
                  {selectedRoom.expanded && (
                    <div className="p-3 pt-0">
                      <textarea
                        value={selectedRoom.description || ''}
                        onChange={(e) => onUpdateRoom(selectedRoom.id, { description: e.target.value })}
                        placeholder="Describe the work to be done in this room..."
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm min-h-[100px]"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Line Items */}
              <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                <div className="p-4 border-b border-gray-700">
                  <h3 className="font-semibold text-white">Products & Services</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="text-xs text-gray-400 bg-gray-900 border-b border-gray-700">
                      <tr>
                        <th className="text-left py-3 px-4">Description</th>
                        <th className="text-right py-3 px-4 w-24">Qty</th>
                        <th className="text-right py-3 px-4 w-24">Unit</th>
                        <th className="text-right py-3 px-4 w-32">Price</th>
                        <th className="text-right py-3 px-4 w-32">Total</th>
                        <th className="w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {selectedRoom.line_items.map((item) => (
                        <tr key={item.id} className="border-b border-gray-700 hover:bg-gray-750">
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => onUpdateLineItem(item.id, { description: e.target.value })}
                              className="w-full bg-transparent border-none text-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => onUpdateLineItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-transparent border-none text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                              min="0"
                              step="0.01"
                            />
                          </td>
                          <td className="py-3 px-4 text-gray-400 text-right">{item.unit}</td>
                          <td className="py-3 px-4">
                            <input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) => onUpdateLineItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-transparent border-none text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                              min="0"
                              step="0.01"
                            />
                          </td>
                          <td className="py-3 px-4 text-right text-white font-semibold">
                            ${item.line_total?.toFixed(2) || '0.00'}
                          </td>
                          <td className="py-3 px-4">
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
                <div className="p-4 border-t border-gray-700">
                  <button
                    onClick={() => onAddProduct(selectedRoom.id)}
                    className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium"
                  >
                    <Plus size={16} />
                    Add Product or Service
                  </button>
                </div>
              </div>

              {/* Room Subtotal */}
              <div className="mt-4 flex justify-end">
                <div className="bg-gray-800 border border-gray-700 rounded-lg px-6 py-3">
                  <div className="text-sm text-gray-400">Room Subtotal</div>
                  <div className="text-xl font-bold text-white">
                    ${selectedRoom.line_items.reduce((sum, item) => sum + (item.line_total || 0), 0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <div className="text-lg mb-2">Select a room to view details</div>
              <div className="text-sm">or create a new room to get started</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
