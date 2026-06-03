import { Lock, MessageSquare, FileText, Calendar, Wrench, CheckSquare, DollarSign, ArrowRight } from 'lucide-react';

interface VIPFeatureTeasersProps {
  showAllModules?: boolean;
}

export function VIPFeatureTeasers({ showAllModules = true }: VIPFeatureTeasersProps) {

  const features = [
    {
      id: 'messages',
      icon: MessageSquare,
      title: 'Direct Messaging',
      tagline: 'Communicate instantly with your service team',
      demoContent: (
        <div className="space-y-2">
          <div className="bg-white p-3 rounded-lg shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-blue-100 rounded-full" />
              <div className="flex-1">
                <div className="h-3 bg-gray-200 rounded w-24 mb-1" />
                <div className="h-2 bg-gray-100 rounded w-32" />
              </div>
            </div>
            <div className="h-2 bg-gray-100 rounded w-full mt-2" />
            <div className="h-2 bg-gray-100 rounded w-3/4 mt-1" />
          </div>
          <div className="bg-blue-50 p-3 rounded-lg shadow-sm ml-8">
            <div className="h-2 bg-blue-200 rounded w-full" />
            <div className="h-2 bg-blue-200 rounded w-2/3 mt-1" />
          </div>
        </div>
      ),
    },
    {
      id: 'invoices',
      icon: DollarSign,
      title: 'Invoice Management',
      tagline: 'View, download, and pay invoices online',
      demoContent: (
        <div className="space-y-2">
          <div className="bg-white p-3 rounded-lg shadow-sm border-l-4 border-green-500">
            <div className="flex items-center justify-between mb-2">
              <div className="h-3 bg-gray-200 rounded w-20" />
              <div className="h-4 bg-green-100 rounded-full w-16" />
            </div>
            <div className="h-2 bg-gray-100 rounded w-full" />
            <div className="h-2 bg-gray-100 rounded w-1/2 mt-1" />
          </div>
          <div className="bg-white p-3 rounded-lg shadow-sm border-l-4 border-yellow-500">
            <div className="flex items-center justify-between mb-2">
              <div className="h-3 bg-gray-200 rounded w-20" />
              <div className="h-4 bg-yellow-100 rounded-full w-16" />
            </div>
            <div className="h-2 bg-gray-100 rounded w-full" />
            <div className="h-2 bg-gray-100 rounded w-1/2 mt-1" />
          </div>
        </div>
      ),
    },
    {
      id: 'projects',
      icon: FileText,
      title: 'Project Tracking',
      tagline: 'Real-time updates on your ongoing projects',
      demoContent: (
        <div className="space-y-3">
          <div className="bg-white p-3 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="h-3 bg-gray-200 rounded w-32" />
              <div className="h-3 bg-blue-100 rounded w-12" />
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div className="bg-blue-500 h-2 rounded-full w-3/4" />
            </div>
            <div className="h-2 bg-gray-100 rounded w-2/3" />
          </div>
          <div className="bg-white p-3 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="h-3 bg-gray-200 rounded w-28" />
              <div className="h-3 bg-green-100 rounded w-12" />
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div className="bg-green-500 h-2 rounded-full w-full" />
            </div>
            <div className="h-2 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
      ),
    },
    {
      id: 'appointments',
      icon: Calendar,
      title: 'Online Scheduling',
      tagline: 'Book and manage appointments 24/7',
      demoContent: (
        <div className="bg-white rounded-lg shadow-sm p-3">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={i} className="text-center h-6 bg-gray-100 rounded flex items-center justify-center">
                <div className="h-2 w-2 bg-gray-300 rounded" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className={`h-6 rounded ${
                  i === 5 || i === 9
                    ? 'bg-blue-100 border border-blue-300'
                    : 'bg-gray-50 border border-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'services',
      icon: Wrench,
      title: 'Service History',
      tagline: 'Complete record of all services performed',
      demoContent: (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-3 rounded-lg shadow-sm border-l-4 border-blue-500">
              <div className="flex items-center justify-between mb-2">
                <div className="h-3 bg-gray-200 rounded w-28" />
                <div className="h-2 bg-gray-100 rounded w-16" />
              </div>
              <div className="h-2 bg-gray-100 rounded w-full mb-1" />
              <div className="h-2 bg-gray-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'punchlist',
      icon: CheckSquare,
      title: 'Project Punchlist',
      tagline: 'Track completion items with photo documentation',
      demoContent: (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-2 rounded-lg shadow-sm flex items-center gap-3">
              <div className="w-3 h-3 border-2 border-gray-300 rounded" />
              <div className="flex-1">
                <div className="h-2 bg-gray-200 rounded w-full mb-1" />
                <div className="h-2 bg-gray-100 rounded w-2/3" />
              </div>
              <div className="w-12 h-12 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      ),
    },
  ];

  const handleUpgrade = () => {
    window.location.href = '/portal/vip-membership';
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {features.map((feature) => {
        const Icon = feature.icon;
        return (
          <div
            key={feature.id}
            className="relative bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300 border border-gray-200"
          >
            {/* Locked Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-gray-900/10 via-transparent to-gray-900/60 z-10 pointer-events-none" />

            {/* Lock Badge */}
            <div className="absolute top-4 right-4 z-20 bg-gray-900 text-white px-3 py-1.5 rounded-full flex items-center gap-2 text-sm font-semibold shadow-lg">
              <Lock size={14} />
              VIP Only
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.tagline}</p>
                </div>
              </div>

              {/* Demo Content with Blur */}
              <div className="relative mb-4">
                <div className="filter blur-sm opacity-75 pointer-events-none">
                  {feature.demoContent}
                </div>
              </div>

              {/* CTA Button */}
              <button
                onClick={handleUpgrade}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl z-20 relative"
              >
                Upgrade to Unlock
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
