import { FileText, ArrowLeft } from 'lucide-react';

export function EULA() {
  const companyName = "MyJobView";
  const effectiveDate = "January 21, 2025";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <button
          onClick={() => window.history.back()}
          className="mb-6 flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-4 sm:px-6 lg:px-8 py-8 sm:py-12 text-white">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-8 h-8 sm:w-10 sm:h-10" />
              <h1 className="text-2xl sm:text-3xl font-bold">End-User License Agreement</h1>
            </div>
            <p className="text-blue-100 text-sm sm:text-base">
              Last Updated: {effectiveDate}
            </p>
          </div>

          <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8">
            <section>
              <p className="text-slate-700 leading-relaxed">
                This End-User License Agreement ("Agreement") is a legal agreement between you (either an individual or a single entity) and {companyName} for the {companyName} software application, which includes computer software and may include associated media, printed materials, and online or electronic documentation (collectively, the "Software").
              </p>
              <p className="text-slate-700 leading-relaxed mt-4">
                By installing, copying, or otherwise using the Software, you agree to be bound by the terms of this Agreement. If you do not agree to the terms of this Agreement, do not install or use the Software.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">1. License Grant</h2>
              <p className="text-slate-700 leading-relaxed">
                {companyName} grants you a limited, non-exclusive, non-transferable license to use the Software solely for your internal business purposes, subject to the terms and conditions of this Agreement.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">2. Restrictions</h2>
              <p className="text-slate-700 leading-relaxed mb-3">You may not:</p>
              <ul className="list-disc list-inside space-y-2 text-slate-700 ml-4">
                <li>Modify, adapt, translate, reverse engineer, decompile, or disassemble the Software</li>
                <li>Create derivative works based on the Software</li>
                <li>Remove or alter any copyright, trademark, or other proprietary notices from the Software</li>
                <li>Rent, lease, loan, sublicense, or distribute the Software to third parties</li>
                <li>Use the Software for any illegal purpose or in violation of any applicable laws</li>
                <li>Share your account credentials or access with unauthorized users</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">3. Ownership</h2>
              <p className="text-slate-700 leading-relaxed">
                The Software is licensed, not sold. {companyName} and its licensors retain all right, title, and interest in and to the Software, including all intellectual property rights. This Agreement does not grant you any rights to trademarks or service marks of {companyName}.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">4. Data and Privacy</h2>
              <p className="text-slate-700 leading-relaxed">
                Your use of the Software is also governed by our Privacy Policy, available at <a href="https://myjobview.com/privacy-policy" className="text-blue-600 hover:text-blue-700 underline">https://myjobview.com/privacy-policy</a>. By using the Software, you consent to the collection and use of your data as described in the Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">5. Subscription and Fees</h2>
              <p className="text-slate-700 leading-relaxed">
                Use of the Software may require payment of subscription fees. You agree to pay all applicable fees as described in your subscription plan. Fees are non-refundable except as required by law or as explicitly stated in your subscription terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">6. Updates and Support</h2>
              <p className="text-slate-700 leading-relaxed">
                {companyName} may provide updates, patches, or enhancements to the Software at its discretion. Such updates may be automatically downloaded and installed. Support services, if any, will be provided at {companyName}'s discretion and may be subject to additional terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">7. Termination</h2>
              <p className="text-slate-700 leading-relaxed">
                This Agreement is effective until terminated. Your rights under this Agreement will terminate automatically without notice if you fail to comply with any term of this Agreement. Upon termination, you must cease all use of the Software and destroy all copies in your possession.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">8. Disclaimer of Warranties</h2>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-slate-700 leading-relaxed font-medium">
                  THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. {companyName} DOES NOT WARRANT THAT THE SOFTWARE WILL MEET YOUR REQUIREMENTS OR THAT OPERATION OF THE SOFTWARE WILL BE UNINTERRUPTED OR ERROR-FREE.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">9. Limitation of Liability</h2>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-slate-700 leading-relaxed font-medium">
                  IN NO EVENT SHALL {companyName} BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, OR OTHER ECONOMIC ADVANTAGE, EVEN IF {companyName} HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. {companyName}'s TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT PAID BY YOU FOR THE SOFTWARE IN THE TWELVE MONTHS PRECEDING THE CLAIM.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">10. Indemnification</h2>
              <p className="text-slate-700 leading-relaxed">
                You agree to indemnify, defend, and hold harmless {companyName} and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses arising out of or in any way connected with your use of the Software or violation of this Agreement.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">11. Governing Law</h2>
              <p className="text-slate-700 leading-relaxed">
                This Agreement shall be governed by and construed in accordance with the laws of the jurisdiction in which {companyName} operates, without regard to its conflict of law provisions. Any legal action or proceeding arising under this Agreement shall be brought exclusively in the courts of that jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">12. Changes to This Agreement</h2>
              <p className="text-slate-700 leading-relaxed">
                {companyName} reserves the right to modify this Agreement at any time. We will notify you of any changes by posting the new Agreement on this page and updating the "Last Updated" date. Your continued use of the Software after any such changes constitutes your acceptance of the new Agreement.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">13. Entire Agreement</h2>
              <p className="text-slate-700 leading-relaxed">
                This Agreement constitutes the entire agreement between you and {companyName} regarding the Software and supersedes all prior or contemporaneous understandings and agreements, whether written or oral, regarding the Software.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">14. Contact Information</h2>
              <p className="text-slate-700 leading-relaxed">
                If you have any questions about this Agreement, please contact us at:
              </p>
              <div className="mt-3 p-4 bg-slate-50 rounded-lg">
                <p className="text-slate-700 font-medium">{companyName}</p>
                <p className="text-slate-600">Email: <a href="mailto:support@myjobview.com" className="text-blue-600 hover:text-blue-700 underline">support@myjobview.com</a></p>
                <p className="text-slate-600">Website: <a href="https://myjobview.com" className="text-blue-600 hover:text-blue-700 underline">https://myjobview.com</a></p>
              </div>
            </section>

            <div className="border-t border-slate-200 pt-6 mt-8">
              <p className="text-sm text-slate-500 text-center">
                By clicking "I Accept" during installation or by using the Software, you acknowledge that you have read this Agreement, understand it, and agree to be bound by its terms and conditions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
