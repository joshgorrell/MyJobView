import { Mail, ArrowLeft } from 'lucide-react';

export function PortalContactUs() {
  const isImpersonating = localStorage.getItem('admin_impersonating_contact');
  const impersonatingName = localStorage.getItem('admin_impersonating_name');

  return (
    <div className="min-h-screen bg-gray-50">
      {isImpersonating && (
        <div className="bg-orange-600 text-white px-4 py-2 text-center text-sm font-medium">
          Admin View: Previewing as {impersonatingName || 'customer'}
        </div>
      )}

      <header className="bg-[#0f2347] sticky top-0 z-40 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-3">
            <a
              href="/portal"
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </a>
            <img
              src="/el_logo_color_(2).png"
              alt="Electronic Life"
              className="h-9 object-contain"
            />
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">Contact Us</h1>
              <p className="text-xs text-blue-200">Get in touch with our support team</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
    </div>
  );
}
