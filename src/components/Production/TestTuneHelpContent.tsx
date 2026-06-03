import { Award, Target, TrendingUp, Clock, CheckCircle2, AlertTriangle, DollarSign, Zap, Trophy, BarChart, Eye, Shield } from 'lucide-react';

interface TestTuneHelpContentProps {
  userRole: string;
  canViewBonusAmounts: boolean;
  canViewPMMetrics: boolean;
  canViewAdminControls: boolean;
}

export function TestTuneHelpContent({ userRole, canViewBonusAmounts, canViewPMMetrics, canViewAdminControls }: TestTuneHelpContentProps) {
  const isTech = userRole === 'tech' || userRole === 'lead_tech' || userRole === 'technician';
  const isSales = userRole === 'sales' || userRole === 'sales_rep' || userRole === 'sales_manager';
  const isManager = userRole === 'manager' || userRole === 'sales_manager' || userRole === 'service_manager';
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  return (
    <div className="space-y-6 text-gray-700">
      {/* Role-Specific Welcome Banner */}
      <div className={`bg-gradient-to-r ${
        isTech ? 'from-purple-50 to-blue-50 border-purple-200' :
        isSales ? 'from-green-50 to-teal-50 border-green-200' :
        isManager ? 'from-blue-50 to-cyan-50 border-blue-200' :
        'from-gray-50 to-slate-50 border-gray-200'
      } border rounded-lg p-4`}>
        <div className="flex items-start gap-3">
          {isTech && <Award className="w-6 h-6 text-purple-600 mt-0.5" />}
          {isSales && <BarChart className="w-6 h-6 text-green-600 mt-0.5" />}
          {isManager && <Eye className="w-6 h-6 text-blue-600 mt-0.5" />}
          {isAdmin && <Shield className="w-6 h-6 text-gray-600 mt-0.5" />}
          <div>
            <h3 className={`font-semibold mb-2 ${
              isTech ? 'text-purple-900' :
              isSales ? 'text-green-900' :
              isManager ? 'text-blue-900' :
              'text-gray-900'
            }`}>
              {isTech && 'Welcome to Test & Tune Bonuses!'}
              {isSales && 'Welcome to Test & Tune Performance Tracking!'}
              {isManager && 'Welcome to Test & Tune Management Dashboard!'}
              {isAdmin && 'Welcome to Test & Tune Administration!'}
            </h3>
            <p className={`text-sm ${
              isTech ? 'text-purple-800' :
              isSales ? 'text-green-800' :
              isManager ? 'text-blue-800' :
              'text-gray-700'
            }`}>
              {isTech && 'The Test & Tune system rewards you for delivering quality work efficiently. Every completed project enters a 90-day warranty period where you can earn bonuses by minimizing return trips and warranty work.'}
              {isSales && 'Track the accuracy of your labor estimates and identify opportunities to improve bidding strategies. The Test & Tune system helps you understand how your estimates compare to actual field performance.'}
              {isManager && 'Monitor your office\'s performance during the 90-day warranty period. Track labor efficiency, manage PM allocations, and ensure quality installations across all projects.'}
              {isAdmin && 'Full system administration and oversight. Manage settings, approve bonuses, handle overrides, and monitor company-wide performance metrics.'}
            </p>
          </div>
        </div>
      </div>

      {/* What You Can See - Role-Specific Access */}
      <section className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <Eye className="w-5 h-5" />
          What You Can See
        </h3>
        <div className="space-y-2 text-sm text-blue-800">
          {isTech && (
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Projects where you are the <strong>Lead Technician</strong></li>
              <li>Projects where you are <strong>assigned to work orders</strong></li>
              <li>Your personal bonus performance and projections</li>
              <li>Field labor hours you've logged</li>
              <li>Status of all your active 90-day projects</li>
            </ul>
          )}
          {isSales && (
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Projects where you are the <strong>Sales Representative</strong></li>
              <li>Estimation accuracy compared to actual field performance</li>
              <li>Labor variance trends across your sales</li>
              <li>Opportunities to improve future estimates</li>
              <li><em>Note: Bonus calculations are not visible to sales reps</em></li>
            </ul>
          )}
          {isManager && (
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>All projects in <strong>your office</strong></li>
              <li>Team performance metrics and efficiency rates</li>
              <li>PM hour allocations and non-performance labor</li>
              <li>Labor drag costs and margin impact</li>
              <li>First-time completion rates</li>
              <li>Bonus projections for your team</li>
            </ul>
          )}
          {isAdmin && (
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li><strong>All projects company-wide</strong> across all offices</li>
              <li>Complete labor breakdown by category</li>
              <li>Full bonus calculations and approval controls</li>
              <li>System settings and override capabilities</li>
              <li>Audit logs and modification history</li>
              <li>Executive-level performance comparisons</li>
            </ul>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-gray-700" />
          {isSales ? 'How Estimation Accuracy is Measured' : 'What is the Test & Tune System?'}
        </h3>
        <div className="space-y-2 text-sm">
          {!isSales && (
            <>
              <p>
                Test & Tune is a performance-based bonus program that rewards technicians and project managers for quality installations. After a project is completed, it enters a 90-day monitoring period where we track any additional labor required for warranty work, service calls, or adjustments.
              </p>
              <p className="font-medium text-blue-600 mt-3">
                The less time you spend on warranty work, the bigger your bonus!
              </p>
            </>
          )}
          {isSales && (
            <>
              <p>
                Test & Tune tracks the accuracy of your labor estimates by comparing the Field Target hours you allocated against actual Field Performance hours during the 90-day warranty period.
              </p>
              <p className="font-medium text-green-600 mt-3">
                Use this data to refine future estimates and improve bidding accuracy!
              </p>
              <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="font-semibold text-gray-900 mb-1">Variance Tracking</p>
                <p className="text-gray-600">
                  <strong>Under Target:</strong> Your estimate was conservative (good for customer expectations)<br/>
                  <strong>On Target:</strong> Your estimate was accurate<br/>
                  <strong>Over Target:</strong> Your estimate was aggressive (learn for next time)
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      {canViewBonusAmounts && (
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-gray-700" />
            How Bonuses Are Calculated
          </h3>
        <div className="space-y-3 text-sm">
          <p>
            Each project has a <strong>Field Labor Target</strong> - the estimated hours needed for warranty and follow-up work during the 90-day period. Your bonus is based on staying under that target:
          </p>
          <div className="grid grid-cols-1 gap-3">
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-green-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Green Zone (Under 75%)
                </div>
                <span className="text-2xl font-bold text-green-600">$$$</span>
              </div>
              <p className="text-green-800">
                Outstanding performance! You're using minimal warranty hours and maximizing your bonus potential. Keep it up!
              </p>
            </div>
            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-yellow-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Yellow Zone (75-100%)
                </div>
                <span className="text-2xl font-bold text-yellow-600">$$</span>
              </div>
              <p className="text-yellow-800">
                You're approaching your labor target. Be strategic about warranty visits to stay within budget and secure your bonus.
              </p>
            </div>
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-red-900 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Red Zone (Over 100%)
                </div>
                <span className="text-2xl font-bold text-red-600">$0</span>
              </div>
              <p className="text-red-800">
                You've exceeded the labor budget for this project. Unfortunately, no bonus will be earned, but use this as a learning opportunity.
              </p>
            </div>
          </div>
        </div>
        </section>
      )}

      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Target className="w-5 h-5 text-gray-700" />
          Understanding Your Dashboard
        </h3>
        <div className="space-y-3 text-sm">
          <p>The Test & Tune Dashboard shows all your active projects in the 90-day warranty period:</p>
          <div className="space-y-2">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="font-semibold text-gray-900 mb-1">Status Indicator</div>
              <p className="text-gray-600">The colored dot shows if you're Green, Yellow, or Red based on labor usage percentage</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="font-semibold text-gray-900 mb-1">Field Target</div>
              <p className="text-gray-600">The estimated hours allocated for warranty work on this project</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="font-semibold text-gray-900 mb-1">Field Hours Used</div>
              <p className="text-gray-600">Actual hours you've logged for warranty visits and service calls</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="font-semibold text-gray-900 mb-1">Labor Budget Left</div>
              <p className="text-gray-600">How many hours you have remaining before reaching your target</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="font-semibold text-gray-900 mb-1">Calendar Days Left</div>
              <p className="text-gray-600">Time remaining in the 90-day warranty period</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Zap className="w-5 h-5 text-gray-700" />
          Tips to Maximize Your Bonus
        </h3>
        <div className="space-y-2 text-sm">
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li><strong>Quality First Time:</strong> Take time during installation to do it right the first time</li>
            <li><strong>Complete Walkthroughs:</strong> Test all equipment thoroughly before leaving the job site</li>
            <li><strong>Customer Education:</strong> Teach customers proper operation to prevent unnecessary service calls</li>
            <li><strong>Batch Service Visits:</strong> When possible, group multiple minor issues into one trip</li>
            <li><strong>Proactive Communication:</strong> Address potential issues during installation before they become callbacks</li>
            <li><strong>Documentation:</strong> Take photos and notes during installation for reference if issues arise</li>
            <li><strong>Follow Best Practices:</strong> Use company standards and installation procedures consistently</li>
          </ul>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-700" />
          The 90-Day Timeline
        </h3>
        <div className="space-y-2 text-sm">
          <p>
            Once a project is completed and invoiced, the 90-day Test & Tune period begins automatically. During this time:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>All warranty work and service calls are tracked against your labor target</li>
            <li>You can monitor your status daily on this dashboard</li>
            <li>Projects stay visible until the 90-day period expires</li>
            <li>At the end of 90 days, bonuses are calculated and approved for payout</li>
            <li>VIP customers may have extended warranty periods</li>
          </ul>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Award className="w-5 h-5 text-gray-700" />
          Viewing Your Bonuses
        </h3>
        <div className="space-y-2 text-sm">
          <p>
            Click the <strong>"My Bonuses"</strong> tab to see all bonuses you've earned:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>View earned bonuses from completed 90-day periods</li>
            <li>See bonus amounts for both lead technician and project manager roles</li>
            <li>Track bonus approval status and payout dates</li>
            <li>Filter by date range to view historical performance</li>
          </ul>
          <p className="mt-3 font-medium text-blue-600">
            Bonuses are typically paid out with your regular payroll after the 90-day period ends.
          </p>
        </div>
      </section>

      <section className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-green-900 mb-3">Success Story Example</h3>
        <div className="text-sm text-green-800 space-y-2">
          <p className="italic">
            "I had a project with a 10-hour warranty target. By taking extra care during installation, walking the customer through proper operation, and only needing one quick follow-up visit (2 hours), I used just 20% of my labor budget. This earned me the full bonus and made the customer happy!"
          </p>
          <p className="font-medium">
            - Tech focusing on quality and customer education
          </p>
        </div>
      </section>

      <section className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">Remember</h3>
        <p className="text-sm text-blue-800">
          The Test & Tune system is designed to reward excellent work, not to penalize mistakes. Everyone has challenging projects - use each one as a learning experience to improve your skills and earn more bonuses in the future. Quality workmanship benefits everyone: you, the company, and most importantly, our customers!
        </p>
      </section>
    </div>
  );
}
