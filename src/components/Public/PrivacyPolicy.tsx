import { Shield, ArrowLeft } from 'lucide-react';

export function PrivacyPolicy() {
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
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-6 lg:px-8 py-8 sm:py-12 text-white">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-8 h-8 sm:w-10 sm:h-10" />
              <h1 className="text-2xl sm:text-3xl font-bold">Privacy Policy</h1>
            </div>
            <p className="text-emerald-100 text-sm sm:text-base">
              Last Updated: {effectiveDate}
            </p>
          </div>

          <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8">
            <section>
              <p className="text-slate-700 leading-relaxed">
                At {companyName}, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our software application and services. Please read this policy carefully. If you do not agree with the terms of this Privacy Policy, please do not access the application.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">1. Information We Collect</h2>

              <h3 className="text-lg font-semibold text-slate-800 mb-3 mt-4">Personal Information</h3>
              <p className="text-slate-700 leading-relaxed mb-3">
                We may collect personal information that you voluntarily provide to us when you:
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-700 ml-4">
                <li>Register for an account</li>
                <li>Use our services and features</li>
                <li>Contact customer support</li>
                <li>Participate in surveys or promotions</li>
              </ul>
              <p className="text-slate-700 leading-relaxed mt-3">
                This information may include: name, email address, phone number, company name, job title, billing address, and payment information.
              </p>

              <h3 className="text-lg font-semibold text-slate-800 mb-3 mt-6">Usage Data</h3>
              <p className="text-slate-700 leading-relaxed">
                We automatically collect certain information when you use our application, including: IP address, browser type, operating system, access times, pages viewed, device identifiers, and the pages or features you accessed before and after using our services.
              </p>

              <h3 className="text-lg font-semibold text-slate-800 mb-3 mt-6">Location Information</h3>
              <p className="text-slate-700 leading-relaxed">
                With your permission, we may collect and process information about your location using GPS, Wi-Fi, and other technologies to provide location-based features and improve our services.
              </p>

              <h3 className="text-lg font-semibold text-slate-800 mb-3 mt-6">Cookies and Tracking Technologies</h3>
              <p className="text-slate-700 leading-relaxed">
                We use cookies, web beacons, and similar tracking technologies to collect information about your browsing activities and to provide a personalized experience. You can control cookie preferences through your browser settings.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">2. How We Use Your Information</h2>
              <p className="text-slate-700 leading-relaxed mb-3">
                We use the information we collect for the following purposes:
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-700 ml-4">
                <li>To provide, operate, and maintain our services</li>
                <li>To process transactions and send related information</li>
                <li>To send administrative information, updates, and security alerts</li>
                <li>To respond to your inquiries and provide customer support</li>
                <li>To monitor and analyze usage patterns and trends</li>
                <li>To personalize your experience and deliver content relevant to you</li>
                <li>To detect, prevent, and address technical issues and security threats</li>
                <li>To comply with legal obligations and enforce our terms</li>
                <li>To send marketing communications (with your consent)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">3. How We Share Your Information</h2>
              <p className="text-slate-700 leading-relaxed mb-3">
                We may share your information in the following circumstances:
              </p>

              <h3 className="text-lg font-semibold text-slate-800 mb-3 mt-4">Service Providers</h3>
              <p className="text-slate-700 leading-relaxed">
                We may share your information with third-party service providers who perform services on our behalf, such as payment processing, data analysis, email delivery, hosting services, and customer support.
              </p>

              <h3 className="text-lg font-semibold text-slate-800 mb-3 mt-4">Business Transfers</h3>
              <p className="text-slate-700 leading-relaxed">
                In connection with any merger, sale of company assets, financing, or acquisition of all or a portion of our business, your information may be transferred to the acquiring entity.
              </p>

              <h3 className="text-lg font-semibold text-slate-800 mb-3 mt-4">Legal Requirements</h3>
              <p className="text-slate-700 leading-relaxed">
                We may disclose your information if required to do so by law or in response to valid requests by public authorities (e.g., court orders, subpoenas, or government agencies).
              </p>

              <h3 className="text-lg font-semibold text-slate-800 mb-3 mt-4">Protection of Rights</h3>
              <p className="text-slate-700 leading-relaxed">
                We may disclose your information when we believe disclosure is necessary to protect our rights, your safety or the safety of others, investigate fraud, or respond to a government request.
              </p>

              <h3 className="text-lg font-semibold text-slate-800 mb-3 mt-4">With Your Consent</h3>
              <p className="text-slate-700 leading-relaxed">
                We may share your information for any other purpose with your consent.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">4. Data Security</h2>
              <p className="text-slate-700 leading-relaxed">
                We implement appropriate technical and organizational security measures to protect your information against unauthorized access, alteration, disclosure, or destruction. These measures include:
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-700 ml-4 mt-3">
                <li>Encryption of data in transit and at rest</li>
                <li>Regular security assessments and audits</li>
                <li>Access controls and authentication mechanisms</li>
                <li>Employee training on data protection practices</li>
              </ul>
              <p className="text-slate-700 leading-relaxed mt-3">
                However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to protect your information, we cannot guarantee its absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">5. Data Retention</h2>
              <p className="text-slate-700 leading-relaxed">
                We retain your personal information only for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. When we no longer need your information, we will securely delete or anonymize it.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">6. Your Privacy Rights</h2>
              <p className="text-slate-700 leading-relaxed mb-3">
                Depending on your location, you may have the following rights regarding your personal information:
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-700 ml-4">
                <li><strong>Access:</strong> Request access to your personal information</li>
                <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
                <li><strong>Deletion:</strong> Request deletion of your personal information</li>
                <li><strong>Portability:</strong> Request a copy of your information in a portable format</li>
                <li><strong>Objection:</strong> Object to processing of your information</li>
                <li><strong>Restriction:</strong> Request restriction of processing</li>
                <li><strong>Opt-out:</strong> Opt-out of marketing communications</li>
              </ul>
              <p className="text-slate-700 leading-relaxed mt-3">
                To exercise any of these rights, please contact us using the information provided below. We will respond to your request within a reasonable timeframe and as required by applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">7. International Data Transfers</h2>
              <p className="text-slate-700 leading-relaxed">
                Your information may be transferred to and processed in countries other than your country of residence. These countries may have data protection laws that differ from those of your country. We take appropriate measures to ensure that your information receives an adequate level of protection in accordance with this Privacy Policy and applicable laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">8. Children's Privacy</h2>
              <p className="text-slate-700 leading-relaxed">
                Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected personal information from a child without parental consent, we will take steps to delete that information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">9. Third-Party Links and Services</h2>
              <p className="text-slate-700 leading-relaxed">
                Our application may contain links to third-party websites or integrate with third-party services. We are not responsible for the privacy practices of these third parties. We encourage you to review their privacy policies before providing any information to them.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">10. California Privacy Rights</h2>
              <p className="text-slate-700 leading-relaxed">
                If you are a California resident, you have specific rights under the California Consumer Privacy Act (CCPA), including the right to know what personal information we collect, use, and share, and the right to delete your personal information. You also have the right not to be discriminated against for exercising your privacy rights.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">11. European Privacy Rights</h2>
              <p className="text-slate-700 leading-relaxed">
                If you are located in the European Economic Area (EEA), you have rights under the General Data Protection Regulation (GDPR), including the rights to access, rectify, erase, restrict processing, object to processing, and data portability. You also have the right to lodge a complaint with a supervisory authority.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">12. Changes to This Privacy Policy</h2>
              <p className="text-slate-700 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. For material changes, we may provide additional notice such as an email notification. Your continued use of our services after any changes constitutes acceptance of the updated Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">13. Contact Us</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                If you have questions or concerns about this Privacy Policy or our privacy practices, please contact us at:
              </p>
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-slate-700 font-medium">{companyName}</p>
                <p className="text-slate-600">Email: <a href="mailto:privacy@myjobview.com" className="text-blue-600 hover:text-blue-700 underline">privacy@myjobview.com</a></p>
                <p className="text-slate-600">Website: <a href="https://myjobview.com" className="text-blue-600 hover:text-blue-700 underline">https://myjobview.com</a></p>
                <p className="text-slate-600 mt-2">Data Protection Officer: <a href="mailto:dpo@myjobview.com" className="text-blue-600 hover:text-blue-700 underline">dpo@myjobview.com</a></p>
              </div>
            </section>

            <div className="border-t border-slate-200 pt-6 mt-8">
              <p className="text-sm text-slate-500 text-center">
                By using {companyName}, you acknowledge that you have read and understood this Privacy Policy and agree to the collection, use, and disclosure of your information as described herein.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
