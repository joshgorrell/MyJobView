import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';

interface ProjectScopeProps {
  project: any;
}

export default function ProjectScope({ project }: ProjectScopeProps) {
  const [proposal, setProposal] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProposalScope();
  }, [project]);

  async function loadProposalScope() {
    if (!project.sales_orders?.proposal_id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: proposalData, error: proposalError } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', project.sales_orders.proposal_id)
        .maybeSingle();

      if (proposalError) throw proposalError;

      const { data: roomsData, error: roomsError } = await supabase
        .from('proposal_rooms')
        .select(`
          *,
          proposal_line_items(*)
        `)
        .eq('proposal_id', project.sales_orders.proposal_id)
        .order('sort_order');

      if (roomsError) throw roomsError;

      setProposal(proposalData);
      setRooms(roomsData || []);
    } catch (error) {
      console.error('Error loading proposal scope:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading scope...</div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">No proposal linked to this project</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-4">
          <h2 className="text-xl font-bold text-white mb-2">Contract Scope</h2>
          <div className="text-sm text-gray-400">
            From Proposal: {proposal.proposal_number}
          </div>
        </div>

        {/* Rooms */}
        <div className="space-y-4">
          {rooms.map((room) => (
            <div key={room.id} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
              <div className="p-4 bg-gray-900 border-b border-gray-700">
                <h3 className="text-lg font-semibold text-white">{room.name}</h3>
              </div>

              <div className="p-4">
                {room.description && (
                  <div className="mb-6">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Scope of Work</div>
                    <div className="text-gray-100 whitespace-pre-wrap leading-relaxed text-base" style={{ fontFamily: 'Georgia, Cambria, "Times New Roman", serif' }}>
                      {room.description}
                    </div>
                  </div>
                )}

                {/* Line Items */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-400 border-b border-gray-700">
                      <tr>
                        <th className="text-left py-2 px-2">Description</th>
                        <th className="text-right py-2 px-2 w-20">Qty</th>
                        <th className="text-right py-2 px-2 w-24">Price</th>
                        <th className="text-right py-2 px-2 w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {room.proposal_line_items?.map((item: any) => (
                        <tr key={item.id} className="border-b border-gray-700">
                          <td className="py-2 px-2 text-white">{item.description}</td>
                          <td className="py-2 px-2 text-right text-gray-300">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="py-2 px-2 text-right text-gray-300">
                            ${item.unit_price?.toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-right text-white font-semibold">
                            ${item.line_total?.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Room Subtotal */}
                <div className="flex justify-end mt-3 pt-3 border-t border-gray-700">
                  <div className="text-right">
                    <div className="text-sm text-gray-400">Room Subtotal</div>
                    <div className="text-lg font-bold text-white">
                      $
                      {room.proposal_line_items
                        ?.reduce((sum: number, item: any) => sum + (item.line_total || 0), 0)
                        .toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="mt-6 bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex justify-between items-center text-xl font-bold">
            <span className="text-gray-400">Total Contract Value</span>
            <span className="text-white">{proposal.total != null ? formatCurrency(proposal.total) : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
