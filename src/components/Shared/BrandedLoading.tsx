import { useEffect, useState } from 'react';

interface BrandedLoadingProps {
  message?: string;
  logoSrc?: string;
}

export function BrandedLoading({ message = 'Loading...', logoSrc = '/MJV_icon.PNG' }: BrandedLoadingProps) {
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowMessage(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="relative inline-flex items-center justify-center mb-6">
          <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-xl animate-pulse" />
          <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-2xl animate-pulse" style={{ animationDelay: '0.3s' }} />
          <div className="relative h-20 w-20 rounded-xl object-contain animate-[fadeIn_0.4s_ease-out]">
            <img
              src={logoSrc}
              alt="MyJobView"
              className="h-20 w-20 rounded-xl object-contain"
              style={{ animation: 'breathe 2.4s ease-in-out infinite' }}
            />
          </div>
        </div>
        <p
          className={`text-gray-300 text-lg transition-opacity duration-500 ${showMessage ? 'opacity-100' : 'opacity-0'}`}
        >
          {message}
        </p>
      </div>
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.06); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
