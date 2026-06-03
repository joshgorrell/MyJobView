import { useState } from 'react';
import { X, Shield, Layout } from 'lucide-react';
import { UserDepartmentAccess } from './UserDepartmentAccess';
import { UserModuleAccess } from './UserModuleAccess';

interface UserAccessControlProps {
  userId: string;
  userName: string;
  userRoleId: string | null;
  onClose: () => void;
}

type Tab = 'departments' | 'modules';

export function UserAccessControl({ userId, userName, userRoleId, onClose }: UserAccessControlProps) {
  const [activeTab, setActiveTab] = useState<Tab>('departments');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Access Control</h2>
              <p className="text-sm text-gray-600 mt-1">
                Manage {userName}'s department and page access
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('departments')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'departments'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Shield className="w-4 h-4" />
              Departments
            </button>
            <button
              onClick={() => setActiveTab('modules')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'modules'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Layout className="w-4 h-4" />
              Individual Pages
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {activeTab === 'departments' ? (
            <div className="h-full overflow-y-auto p-6">
              <UserDepartmentAccess
                userId={userId}
                userName={userName}
                userRoleId={userRoleId}
                onClose={onClose}
              />
            </div>
          ) : (
            <div className="h-full overflow-y-auto p-6">
              <UserModuleAccess
                userId={userId}
                userName={userName}
                userRoleId={userRoleId}
                onClose={onClose}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
