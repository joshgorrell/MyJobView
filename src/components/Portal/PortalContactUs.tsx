import { Mail, ArrowLeft } from 'lucide-react';

export function PortalContactUs() {
  const isImpersonating = localStorage.getItem('admin_impersonating_contact');
  const impersonatingName = localStorage.getItem('admin_impersonating_name');

  return (
    <div className="min-h-screen bg-gray-50">
      {isImpersonating && (
        <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium">
          Admin Preview: Viewing portal as {impersonatingName || 'customer'}
        </div>
      )}

      <header className="bg-[#0f2347] text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 sm:h-20 gap-3">
            <a
              href="/portal"
              className="flex items-center gap-1.5 px-3 py-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline text-sm font-medium">Dashboard</span>
            </a>
            <img
              src="/el_logo_color_(2).png"
              alt="Electronic Life"
              className="h-8 sm:h-10 object-contain flex-shrink-0"
            />
            <div className="hidden sm:block border-l border-white/20 pl-4">
              <p className="text-white font-semibold text-sm leading-tight">Contact Us</p>
              <p className="text-blue-300 text-xs">Get in touch with our support team</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8">
          <div className="text-center max-w-xl mx-auto">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Mail className="w-10 h-10 text-blue-600" />
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
              Need Help?
            </h2>

            <p className="text-gray-600 mb-6 sm:mb-8">
              Our support team is here to assist you. Send us an email and we'll get back to you as soon as possible.
            </p>

            <a
              href="mailto:support@electroniclife.com"
              className="inline-flex items-center justify-center gap-3 px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-lg font-semibold text-base sm:text-lg shadow-md hover:shadow-lg transition-all w-full sm:w-auto"
            >
              <Mail className="w-6 h-6" />
              support@electroniclife.com
            </a>

            <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-gray-200">
              <div className="bg-blue-50 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">Service Request Options</h3>
                <div className="text-left space-y-3 text-sm text-gray-700">
                  <p>
                    <span className="font-medium text-blue-700">Single Item:</span> Need something fixed right away? Request service for just one item and we'll get it taken care of.
                  </p>
                  <p>
                    <span className="font-medium text-blue-700">Multiple Items:</span> Have a list of to-do's? Feel free to bank them up and we can knock them all out in one convenient service call.
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-500">
                Please include your account information and a detailed description of your inquiry for the fastest response.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 mt-8 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-center gap-3 text-xs text-gray-400">
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 underline">Privacy Policy</a>
          <span>·</span>
          <a href="/eula" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 underline">Terms of Service</a>
        </div>
      </footer>
    </div>
  );
}
