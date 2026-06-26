import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ArrowLeft,
  Star,
  Check,
  Shield,
  Calendar,
  ClipboardList,
  Wrench,
  Headphones,
  Zap,
  ChevronRight,
  Package,
  Sparkles,
  Clock,
  Award
} from 'lucide-react';

interface VIPPlan {
  id: string;
  plan_name: string;
  description: string | null;
  billing_frequency: string;
  amount: number;
  is_active: boolean;
}

const BENEFITS = [
  {
    icon: ClipboardList,
    title: 'Unlimited Punchlist Access',
    description:
      'Create, manage, and track all your service items in one place. Add photos, write details, and follow progress from request to completion.',
    color: 'blue',
  },
  {
    icon: Zap,
    title: 'Priority Service Scheduling',
    description:
      'VIP members move to the front of the line. When you submit a service request, our team prioritizes your appointment above standard calls.',
    color: 'amber',
  },
  {
    icon: Calendar,
    title: 'Regular Maintenance Visits',
    description:
      'Stay ahead of issues with proactive maintenance. Your system gets inspected and tuned on a regular schedule, so problems are caught early.',
    color: 'green',
  },
  {
    icon: Headphones,
    title: 'Dedicated VIP Support',
    description:
      'Skip the general queue. VIP members reach a dedicated support line staffed by senior technicians who know your system.',
    color: 'teal',
  },
  {
    icon: Shield,
    title: 'System Performance Monitoring',
    description:
      'We keep a close eye on your system health between visits, flagging anomalies before they become expensive repairs.',
    color: 'navy',
  },
  {
    icon: Award,
    title: '90-Day Test & Tune Trial',
    description:
      'New project customers get a complimentary 90-day trial so you can experience VIP benefits before committing to a plan.',
    color: 'orange',
  },
];

const HOW_IT_WORKS = [
  {
    step: 1,
    title: 'Choose a Plan',
    description: 'Select the VIP membership level that fits your needs and budget.',
  },
  {
    step: 2,
    title: 'Get Instant Access',
    description: 'Your punchlist unlocks immediately and your priority status is activated.',
  },
  {
    step: 3,
    title: 'Enjoy Year-Round Service',
    description: 'Submit items, schedule visits, and relax knowing your system is in expert hands.',
  },
];

function colorClasses(color: string) {
  const map: Record<string, { bg: string; icon: string; border: string }> = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-200' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-200' },
    green: { bg: 'bg-green-50', icon: 'text-green-600', border: 'border-green-200' },
    teal: { bg: 'bg-teal-50', icon: 'text-teal-600', border: 'border-teal-200' },
    navy: { bg: 'bg-slate-50', icon: 'text-slate-700', border: 'border-slate-200' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600', border: 'border-orange-200' },
  };
  return map[color] || map.blue;
}

function getBillingLabel(frequency: string) {
  const map: Record<string, string> = {
    monthly: 'per month',
    quarterly: 'per quarter',
    yearly: 'per year',
    annual: 'per year',
  };
  return map[frequency] || `per ${frequency}`;
}

export function PortalVIPBenefits() {
  const [plans, setPlans] = useState<VIPPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  const impersonatingName = localStorage.getItem('admin_impersonating_name');

  useEffect(() => {
    supabase
      .from('recurring_plans')
      .select('id, plan_name, description, billing_frequency, amount, is_active')
      .eq('is_active', true)
      .eq('plan_type', 'vip_plan')
      .order('amount')
      .then(({ data }) => {
        setPlans(data || []);
        setLoadingPlans(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {impersonatingName && (
        <div className="bg-orange-600 text-white px-4 py-2 text-center text-sm font-medium">
          Admin View: Previewing as {impersonatingName}
        </div>
      )}

      <header className="bg-[#0f2347] shadow-lg sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
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
            <h1 className="text-lg font-bold text-white leading-tight">VIP Membership</h1>
            <p className="text-xs text-blue-200">Premium service & priority support</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">

        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f2347] to-[#1e4080] text-white p-8 sm:p-12 shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/10 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400/10 rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-yellow-400/20 rounded-xl flex items-center justify-center">
                <Star className="w-7 h-7 text-yellow-400 fill-yellow-400" />
              </div>
              <span className="text-sm font-semibold text-yellow-300 tracking-wide uppercase">VIP Membership</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 leading-tight">
              Priority Service.<br className="hidden sm:block" /> Total Peace of Mind.
            </h2>
            <p className="text-blue-200 text-lg mb-8 max-w-xl leading-relaxed">
              VIP members get unlimited punchlist access, jump-the-queue scheduling, regular
              maintenance, and a dedicated support team — all for one predictable monthly rate.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href="/portal/vip-membership"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-yellow-500 hover:bg-yellow-400 text-white font-bold rounded-xl shadow-lg transition-colors text-base"
              >
                <Sparkles className="w-5 h-5" />
                View Plans & Sign Up
              </a>
              <a
                href="/portal/contact"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl border border-white/20 transition-colors text-base"
              >
                Ask About Free Trial
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        {/* Benefits grid */}
        <div>
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Everything VIP Includes</h3>
            <p className="text-gray-500 max-w-xl mx-auto">
              One membership covers all of these — no add-ons, no surprises.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {BENEFITS.map((benefit) => {
              const Icon = benefit.icon;
              const cls = colorClasses(benefit.color);
              return (
                <div
                  key={benefit.title}
                  className={`bg-white border ${cls.border} rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow`}
                >
                  <div className={`w-10 h-10 ${cls.bg} rounded-lg flex items-center justify-center mb-3`}>
                    <Icon className={`w-5 h-5 ${cls.icon}`} />
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-1.5">{benefit.title}</h4>
                  <p className="text-gray-500 text-sm leading-relaxed">{benefit.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* How it works */}
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">How It Works</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((step, index) => (
              <div key={step.step} className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-[#0f2347] text-white rounded-full flex items-center justify-center text-lg font-bold mb-4 shadow">
                  {step.step}
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">{step.title}</h4>
                <p className="text-gray-500 text-sm leading-relaxed">{step.description}</p>
                {index < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden sm:block absolute translate-x-full" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Pricing plans */}
        <div>
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Choose Your Plan</h3>
            <p className="text-gray-500 max-w-lg mx-auto">
              All plans include every benefit listed above. Pick the billing frequency that works best for you.
            </p>
          </div>

          {loadingPlans ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-[#0f2347] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : plans.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.map((plan, i) => (
                <div
                  key={plan.id}
                  className={`relative bg-white rounded-2xl border-2 shadow-sm hover:shadow-lg transition-shadow p-6 flex flex-col ${
                    i === 0 ? 'border-[#0f2347]' : 'border-gray-200'
                  }`}
                >
                  {i === 0 && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="bg-[#0f2347] text-white text-xs font-semibold px-3 py-1 rounded-full shadow">
                        Most Popular
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-4">
                    <Package className="w-5 h-5 text-[#0f2347]" />
                    <h4 className="font-bold text-gray-900 text-lg">{plan.plan_name}</h4>
                  </div>

                  {plan.description && (
                    <p className="text-gray-500 text-sm mb-4 min-h-[48px] leading-relaxed">{plan.description}</p>
                  )}

                  <div className="mb-6">
                    <div className="text-4xl font-bold text-gray-900">
                      ${plan.amount}
                    </div>
                    <div className="text-gray-500 text-sm mt-1">{getBillingLabel(plan.billing_frequency)}</div>
                  </div>

                  <ul className="space-y-2.5 mb-8 flex-1">
                    {[
                      'Unlimited punchlist access',
                      'Priority service scheduling',
                      'Regular maintenance visits',
                      'Dedicated VIP support',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                        <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>

                  <a
                    href="/portal/vip-membership"
                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-colors ${
                      i === 0
                        ? 'bg-[#0f2347] hover:bg-[#1a3a6e] text-white'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                    }`}
                  >
                    <Star className={`w-4 h-4 ${i === 0 ? 'text-yellow-400' : 'text-gray-500'}`} />
                    Get Started
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
              <Package className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">Plans are being configured. Contact us to learn about pricing.</p>
              <a
                href="/portal/contact"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#0f2347] hover:bg-[#1a3a6e] text-white rounded-xl font-semibold text-sm transition-colors"
              >
                Contact Us
              </a>
            </div>
          )}
        </div>

        {/* Trial callout */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Clock className="w-7 h-7 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-1">Not Ready to Commit? Try It Free.</h3>
              <p className="text-gray-600 leading-relaxed">
                If you recently completed a project with us, you may be eligible for a complimentary
                <strong> 90-Day Test & Tune</strong> trial — full VIP access at no charge so you can experience
                the difference before subscribing.
              </p>
            </div>
            <a
              href="/portal/contact"
              className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold text-sm transition-colors shadow"
            >
              Ask About the Trial
              <ChevronRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Final CTA strip */}
        <div className="bg-[#0f2347] rounded-2xl p-8 text-center text-white shadow-xl">
          <Star className="w-10 h-10 text-yellow-400 fill-yellow-400 mx-auto mb-4" />
          <h3 className="text-2xl font-bold mb-2">Ready to Become a VIP Member?</h3>
          <p className="text-blue-200 mb-6 max-w-md mx-auto">
            Join today and start enjoying priority service, unlimited punchlist access, and expert support.
          </p>
          <a
            href="/portal/vip-membership"
            className="inline-flex items-center gap-2 px-10 py-3.5 bg-yellow-500 hover:bg-yellow-400 text-white font-bold rounded-xl shadow-lg transition-colors text-base"
          >
            <Sparkles className="w-5 h-5" />
            View Plans & Sign Up
          </a>
        </div>

        <div className="pb-4" />
      </main>
    </div>
  );
}
