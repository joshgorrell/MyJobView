import { useEffect, useState } from 'react';
import { CreditCard, Plus, Edit, Trash2, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BusinessCard, Profile } from '../../lib/types';
import { BusinessCardForm } from './BusinessCardForm';
import ConfirmModal from '../ui/ConfirmModal';

export function BusinessCardManager() {
  const [cards, setCards] = useState<BusinessCard[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCard, setEditingCard] = useState<BusinessCard | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadCards();
    loadProfiles();
  }, []);

  async function loadCards() {
    try {
      const { data, error } = await supabase
        .from('business_cards')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCards(data || []);
    } catch (error) {
      console.error('Error loading cards:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadProfiles() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  }

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase
        .from('business_cards')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadCards();
    } catch (error) {
      console.error('Error deleting card:', error);
      alert('Failed to delete business card');
    }
  }

  async function handleToggleActive(card: BusinessCard) {
    try {
      const { error } = await supabase
        .from('business_cards')
        .update({ is_active: !card.is_active })
        .eq('id', card.id);

      if (error) throw error;
      loadCards();
    } catch (error) {
      console.error('Error updating card:', error);
      alert('Failed to update business card');
    }
  }

  const cardUrl = (slug: string) => `${window.location.origin}/card/${slug}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">Business Cards</h2>
          <p className="text-gray-300">Manage digital business cards for your sales team</p>
        </div>
        <button
          onClick={() => {
            setEditingCard(null);
            setShowForm(true);
          }}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all font-medium flex items-center gap-2 shadow-md hover:shadow-lg"
        >
          <Plus className="w-4 h-4" />
          New Card
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p className="text-gray-500">No business cards yet. Create your first one!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <div
              key={card.id}
              className={`bg-white rounded-lg shadow-sm border-2 ${
                card.is_active ? 'border-gray-200' : 'border-red-200'
              } p-4 hover:shadow-md transition-all`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 text-lg">{card.full_name}</h3>
                  <p className="text-gray-600 text-sm">{card.title}</p>
                </div>
                {card.photo_url && (
                  <img
                    src={card.photo_url}
                    alt={card.full_name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-blue-200"
                  />
                )}
              </div>

              <div className="space-y-1 mb-3">
                <p className="text-gray-600 text-sm truncate">{card.email}</p>
                <p className="text-gray-600 text-sm">{card.phone}</p>
                <p className="text-xs text-gray-500 mt-2">
                  /{card.slug}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={cardUrl(card.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  View
                </a>
                <button
                  onClick={() => {
                    setEditingCard(card);
                    setShowForm(true);
                  }}
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleToggleActive(card)}
                  className={`px-3 py-2 rounded-lg transition-colors text-xs font-semibold ${
                    card.is_active
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {card.is_active ? 'Active' : 'Inactive'}
                </button>
                <button
                  onClick={() => setConfirmModal({ title: 'Delete Business Card', message: 'Are you sure you want to delete this business card?', onConfirm: () => handleDelete(card.id) })}
                  className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />

      {showForm && (
        <BusinessCardForm
          card={editingCard}
          profiles={profiles}
          onClose={() => {
            setShowForm(false);
            setEditingCard(null);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditingCard(null);
            loadCards();
          }}
        />
      )}
    </div>
  );
}
