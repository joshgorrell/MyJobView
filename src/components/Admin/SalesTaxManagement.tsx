import React, { useState } from 'react';
import { DollarSign, Shield, Map, Info, Printer } from 'lucide-react';
import TaxRateManagement from './TaxRateManagement';
import TaxExemptionManager from './TaxExemptionManager';

type TabType = 'rates' | 'exemptions' | 'info';

export default function SalesTaxManagement() {
  const [activeTab, setActiveTab] = useState<TabType>('rates');

  return (
    <div className="space-y-6">
      <div className="no-print">
        <h1 className="text-3xl font-bold text-gray-900">Sales Tax Management</h1>
        <p className="text-gray-600 mt-1">
          Configure tax rates, manage exemptions, and understand tax rules
        </p>
      </div>

      <div className="border-b border-gray-200 no-print">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          <button
            onClick={() => setActiveTab('rates')}
            className={`
              py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap
              ${
                activeTab === 'rates'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            <Map className="w-5 h-5" />
            Tax Rates
          </button>
          <button
            onClick={() => setActiveTab('exemptions')}
            className={`
              py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap
              ${
                activeTab === 'exemptions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            <Shield className="w-5 h-5" />
            Tax Exemptions
          </button>
          <button
            onClick={() => setActiveTab('info')}
            className={`
              py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap
              ${
                activeTab === 'info'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            <Info className="w-5 h-5" />
            Tax Rules
          </button>
        </nav>
      </div>

      <div>
        {activeTab === 'rates' && <TaxRateManagement />}
        {activeTab === 'exemptions' && <TaxExemptionManager />}
        {activeTab === 'info' && <TaxRulesInfo />}
      </div>
    </div>
  );
}

function TaxRulesInfo() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print-container">
      <style>{`
        @media print {
          @page {
            margin: 0.5in;
            size: letter;
          }

          /* Hide everything except the print container */
          body * {
            visibility: hidden;
          }

          .print-container,
          .print-container * {
            visibility: visible;
          }

          .print-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }

          * {
            box-shadow: none !important;
            text-shadow: none !important;
          }

          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Hide elements marked with no-print */
          .no-print {
            display: none !important;
            visibility: hidden !important;
          }

          /* Show and style print title */
          .print-title {
            display: block !important;
            margin-bottom: 1.5rem !important;
            text-align: center;
          }

          .print-title h1 {
            font-size: 20pt;
            font-weight: bold;
            margin-bottom: 0.5rem;
            color: #000;
          }

          .print-title p {
            font-size: 10pt;
            color: #4b5563;
          }

          /* Prevent page breaks inside these elements */
          .print-break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Force page break before element */
          .print-break-before {
            break-before: page;
            page-break-before: always;
          }

          /* Style sections for print */
          .print-section {
            background: white !important;
            border: 1px solid #d1d5db !important;
            border-radius: 4px !important;
            padding: 1rem !important;
            margin-bottom: 1rem !important;
          }

          .print-section h3 {
            font-size: 12pt;
            font-weight: 600;
            border-bottom: 2px solid #000;
            padding-bottom: 0.5rem;
            margin-bottom: 0.75rem;
          }

          /* Table styling for print */
          table {
            font-size: 9pt;
            border-collapse: collapse;
            width: 100%;
          }

          thead {
            background: #f3f4f6 !important;
          }

          th {
            border: 1px solid #9ca3af !important;
            padding: 6px !important;
            font-weight: 600;
            font-size: 8pt;
            text-align: left;
          }

          td {
            border: 1px solid #d1d5db !important;
            padding: 6px !important;
            font-size: 9pt;
          }

          /* Badge styling for print */
          .badge-green {
            background: white !important;
            border: 1px solid #059669 !important;
            color: #059669 !important;
            padding: 2px 6px;
            border-radius: 3px;
            font-weight: 600;
            font-size: 8pt;
          }

          .badge-red {
            background: white !important;
            border: 1px solid #dc2626 !important;
            color: #dc2626 !important;
            padding: 2px 6px;
            border-radius: 3px;
            font-weight: 600;
            font-size: 8pt;
          }

          /* Grid layout for print - force single column */
          .grid {
            display: block !important;
          }

          .grid > * {
            width: 100% !important;
            margin-bottom: 1rem !important;
          }

          /* Spacing */
          .space-y-6 > * + * {
            margin-top: 1.5rem !important;
          }

          .space-y-3 > * + * {
            margin-top: 0.75rem !important;
          }

          /* List styling */
          ul {
            margin-left: 1.5rem;
          }

          li {
            margin-bottom: 0.5rem;
          }

          /* Typography */
          p {
            line-height: 1.5;
            margin-bottom: 0.5rem;
          }

          strong {
            font-weight: 600;
            color: #000;
          }
        }

        @media screen {
          .print-title {
            display: none;
          }
        }
      `}</style>

      <div className="print-title text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Sales Tax Rules & Guidelines
        </h1>
        <p className="text-sm text-gray-600">
          Reference Guide for Tax Calculation in Proposals and Invoices
        </p>
      </div>

      <div className="no-print flex justify-end mb-4">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Printer className="w-4 h-4" />
          Print Instructions
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 print-break-inside-avoid print-section">
        <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <Info className="w-5 h-5 no-print" />
          How Sales Tax Works in This System
        </h3>
        <div className="space-y-3 text-blue-800">
          <p>
            This system automatically calculates sales tax based on the project environment
            (Residential or Commercial), project type, and whether line items are Labor or
            Materials.
          </p>
          <p>
            Tax rates are looked up by zip code, falling back to your default company rate if no
            specific jurisdiction is configured.
          </p>
          <p>
            Customers marked as tax-exempt must have a valid, non-expired exemption certificate on
            file.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden print-break-before print-break-inside-avoid print-section">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Sales Tax Rules Matrix</h3>
          <p className="text-sm text-gray-600 mt-1">
            How tax is applied based on project type and item type
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Environment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Project Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Labor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Materials
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">Residential</td>
                <td className="px-6 py-4 text-sm text-gray-900">Original Construction</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 badge-green">
                    Non-Taxable
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 badge-red">
                    Taxable
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-gray-600">New home construction</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">Residential</td>
                <td className="px-6 py-4 text-sm text-gray-900">Remodel</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 badge-green">
                    Non-Taxable
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 badge-red">
                    Taxable
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-gray-600">Home renovation projects</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">Commercial</td>
                <td className="px-6 py-4 text-sm text-gray-900">Original Construction</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 badge-green">
                    Non-Taxable
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 badge-red">
                    Taxable
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-gray-600">
                  New commercial building construction
                </td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">Commercial</td>
                <td className="px-6 py-4 text-sm text-gray-900">Remodel</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 badge-red">
                    Taxable
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 badge-red">
                    Taxable
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-gray-600">
                  Both labor and materials are taxed
                </td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">Both</td>
                <td className="px-6 py-4 text-sm text-gray-900">General Installation/Repair or Retail</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 badge-red">
                    Taxable
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 badge-red">
                    Taxable
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-gray-600">Service calls, repairs, etc.</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">Both</td>
                <td className="px-6 py-4 text-sm text-gray-900">Exempt Project</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 badge-green">
                    Non-Taxable
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 badge-green">
                    Non-Taxable
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-gray-600">
                  Requires valid exemption certificate
                </td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">Both</td>
                <td className="px-6 py-4 text-sm text-gray-900">Design Services</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 badge-green">
                    Non-Taxable
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 badge-green">
                    Non-Taxable
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-gray-600">
                  Must be invoiced separately
                </td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">Both</td>
                <td className="px-6 py-4 text-sm text-gray-900">Maintenance Agreement</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 badge-red">
                    Taxable
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 badge-red">
                    Taxable
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-gray-600">Recurring maintenance contracts</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">Both</td>
                <td className="px-6 py-4 text-sm text-gray-900">Membership</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 badge-red">
                    Taxable
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 badge-red">
                    Taxable
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-gray-600">VIP programs, memberships</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">Both</td>
                <td className="px-6 py-4 text-sm text-gray-900">Security Monitoring</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 badge-green">
                    Non-Taxable
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 badge-green">
                    Non-Taxable
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-gray-600">
                  Only on recurring billing
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print-break-inside-avoid">
        <div className="bg-white rounded-lg shadow p-6 print-section">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-blue-600 no-print" />
            Tax Rate Lookup
          </h3>
          <div className="space-y-3 text-sm text-gray-600">
            <p>
              <strong>By Zip Code:</strong> System first checks if a tax rate is configured for
              the job site's zip code.
            </p>
            <p>
              <strong>Default Rate:</strong> If no zip-specific rate exists, the system uses your
              default company tax rate.
            </p>
            <p>
              <strong>TaxJar API:</strong> Use the Quick Lookup feature to automatically fetch tax
              rates from TaxJar. Configure your API key in Tax Rate Management.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 print-section">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-600 no-print" />
            Tax Exemptions
          </h3>
          <div className="space-y-3 text-sm text-gray-600">
            <p>
              <strong>Certificate Required:</strong> Customers marked as tax-exempt must have a
              valid exemption certificate on file.
            </p>
            <p>
              <strong>Automatic Validation:</strong> System checks certificate expiration dates and
              only applies exemption if certificate is valid.
            </p>
            <p>
              <strong>Supported Types:</strong> Resale certificates, exempt organizations,
              government entities, and other exemptions.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 print-break-inside-avoid print-section">
        <h3 className="font-semibold text-yellow-900 mb-3">Important Notes</h3>
        <ul className="list-disc list-inside space-y-2 text-sm text-yellow-800">
          <li>
            Design Services must be invoiced separately from installation work to maintain
            non-taxable status.
          </li>
          <li>
            Security Monitoring is only non-taxable when billed as a recurring service. One-time
            monitoring charges may be taxable.
          </li>
          <li>
            Tax rules vary by state and jurisdiction. Always consult with your tax advisor to
            ensure compliance.
          </li>
          <li>
            Keep exemption certificates up to date. Expired certificates automatically disable tax
            exemption.
          </li>
          <li>
            You can override calculated tax on individual proposals/invoices when needed (requires
            documentation).
          </li>
        </ul>
      </div>
    </div>
  );
}
