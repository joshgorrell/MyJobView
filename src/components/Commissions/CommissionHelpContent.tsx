import { DollarSign, Users, Settings, TrendingUp, CheckCircle, Clock, AlertCircle } from 'lucide-react';

export function CommissionHelpContent() {
  return (
    <div className="space-y-6 text-gray-700">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <DollarSign className="w-6 h-6 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 mb-2">Welcome to Commission Management</h3>
            <p className="text-sm text-blue-800">
              This system helps you track, manage, and pay commissions to your team members based on their sales performance, project management, and service work.
            </p>
          </div>
        </div>
      </div>

      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-700" />
          Commission Dashboard Overview
        </h3>
        <div className="space-y-2 text-sm">
          <p>The Commission Dashboard provides a comprehensive view of your team's earnings:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><strong>All Records View:</strong> See every commission transaction with detailed breakdowns</li>
            <li><strong>Employee Summary View:</strong> Group commissions by employee to see totals owed</li>
            <li><strong>Payroll Periods:</strong> Filter by pay periods (1st-15th, 16th-End) for easy payroll processing</li>
            <li><strong>Status Filters:</strong> Track commissions through their lifecycle stages</li>
          </ul>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-gray-700" />
          Commission Basis Types
        </h3>
        <div className="space-y-3 text-sm">
          <p>Commissions can be calculated based on different metrics:</p>
          <div className="grid grid-cols-1 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="font-semibold text-gray-900 mb-1">Project Revenue</div>
              <p className="text-gray-600">Commission based on total project/sales order value (most common for sales roles)</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="font-semibold text-gray-900 mb-1">Revenue Collected</div>
              <p className="text-gray-600">Commission based on actual payments received from customers</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="font-semibold text-gray-900 mb-1">Labor Hours</div>
              <p className="text-gray-600">Commission based on billable hours worked (useful for service teams)</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="font-semibold text-gray-900 mb-1">Flat Rate</div>
              <p className="text-gray-600">Fixed commission amount per transaction or milestone</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-700" />
          Commission Lifecycle Stages
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="w-3 h-3 rounded-full bg-gray-400 mt-1" />
            <div>
              <div className="font-semibold text-gray-900">Pending</div>
              <p className="text-gray-600">Commission created but no payments collected yet</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="w-3 h-3 rounded-full bg-blue-400 mt-1" />
            <div>
              <div className="font-semibold text-blue-900">Accruing</div>
              <p className="text-blue-800">Partial payments received, commission growing proportionally</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="w-3 h-3 rounded-full bg-green-400 mt-1" />
            <div>
              <div className="font-semibold text-green-900">Ready to Pay</div>
              <p className="text-green-800">Full payment collected, commission ready for payout</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5" />
            <div>
              <div className="font-semibold text-emerald-900">Paid</div>
              <p className="text-emerald-800">Commission has been paid to employee</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Settings className="w-5 h-5 text-gray-700" />
          Employee Configuration
        </h3>
        <div className="space-y-2 text-sm">
          <p>Configure commission rates for each employee across different role types:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><strong>Sales (Projects):</strong> Commission on new project sales</li>
            <li><strong>Design:</strong> Commission for design work completed</li>
            <li><strong>Project Management:</strong> Commission for managing project delivery</li>
            <li><strong>Service Sales:</strong> Commission on service contracts sold</li>
            <li><strong>Service PM:</strong> Commission for managing service delivery</li>
          </ul>
          <p className="mt-3">
            Each employee can have different rates for different roles, allowing flexible compensation structures.
          </p>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-gray-700" />
          Company Settings
        </h3>
        <div className="space-y-2 text-sm">
          <p>Set default commission structures in Company Settings:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Default commission rates by role type</li>
            <li>Choose between revenue-based or collection-based commission models</li>
            <li>Set minimum thresholds for commission payouts</li>
            <li>Configure automatic commission calculations</li>
          </ul>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-gray-700" />
          Best Practices
        </h3>
        <div className="space-y-2 text-sm">
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li><strong>Regular Reviews:</strong> Review commission reports weekly to track team performance</li>
            <li><strong>Clear Communication:</strong> Ensure employees understand how their commissions are calculated</li>
            <li><strong>Timely Payments:</strong> Process commission payouts consistently with your payroll schedule</li>
            <li><strong>Track Collections:</strong> Monitor customer payments to keep commission status accurate</li>
            <li><strong>Audit Trail:</strong> Use the detailed records view to verify commission calculations</li>
            <li><strong>Adjust Rates Strategically:</strong> Review and adjust commission rates during annual reviews</li>
          </ul>
        </div>
      </section>

      <section className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-green-900 mb-2">Getting Started</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-green-800">
          <li>Navigate to the <strong>Employee Config</strong> tab to set up commission rates for your team members</li>
          <li>Configure default rates in <strong>Company Settings</strong> to streamline new employee setup</li>
          <li>Use the <strong>Dashboard</strong> tab to monitor commission status and process payouts</li>
          <li>Filter by payroll period when preparing commission payments</li>
          <li>Mark commissions as "Paid" after processing payroll</li>
        </ol>
      </section>
    </div>
  );
}
