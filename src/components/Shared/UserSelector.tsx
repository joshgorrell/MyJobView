import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { User, Search, X, Check } from 'lucide-react';

interface Profile {
  id: string;
  full_name: string;
  role: string;
  email: string;
}

interface UserSelectorProps {
  selectedUserId: string | null;
  onSelect: (userId: string | null, userName: string | null) => void;
  roleFilter?: string[];
  label: string;
  placeholder?: string;
  showClearButton?: boolean;
  disabled?: boolean;
  className?: string;
}

export function UserSelector({
  selectedUserId,
  onSelect,
  roleFilter = [],
  label,
  placeholder = 'Select user...',
  showClearButton = true,
  disabled = false,
  className = ''
}: UserSelectorProps) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [roleFilter]);

  async function loadUsers() {
    try {
      setLoading(true);
      let query = supabase
        .from('profiles')
        .select('id, full_name, role, email')
        .order('full_name', { ascending: true });

      if (roleFilter.length > 0) {
        query = query.in('role', roleFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  }

  const selectedUser = users.find(u => u.id === selectedUserId);

  const filteredUsers = users.filter(user =>
    user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  function handleSelect(user: Profile) {
    onSelect(user.id, user.full_name);
    setIsOpen(false);
    setSearchTerm('');
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect(null, null);
    setSearchTerm('');
  }

  return (
    <div className={`relative ${className}`}>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        {label}
      </label>

      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-left flex items-center justify-between transition-colors ${
            disabled
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:border-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
          }`}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
            {selectedUser ? (
              <div className="flex flex-col min-w-0">
                <span className="text-white font-medium truncate">{selectedUser.full_name}</span>
                <span className="text-xs text-gray-400 truncate">{selectedUser.email}</span>
              </div>
            ) : (
              <span className="text-gray-400">{placeholder}</span>
            )}
          </div>

          <div className="flex items-center gap-2 ml-2">
            {selectedUser && showClearButton && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 hover:bg-gray-600 rounded transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
        </button>

        {isOpen && !disabled && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute z-20 mt-2 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-80 overflow-hidden">
              <div className="p-2 border-b border-gray-700">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search users..."
                    className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    autoFocus
                  />
                </div>
              </div>

              <div className="overflow-y-auto max-h-64">
                {loading ? (
                  <div className="p-8 text-center">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    No users found
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleSelect(user)}
                      className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors border-b border-gray-700/50 last:border-b-0 ${
                        user.id === selectedUserId ? 'bg-gray-700/50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{user.full_name}</span>
                            {user.id === selectedUserId && (
                              <Check className="w-4 h-4 text-green-400" />
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{user.email}</div>
                          <div className="text-xs text-gray-500 mt-0.5 capitalize">{user.role}</div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
