import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Star,
  Check,
  Shield,
  Clock,
  Wrench,
  Phone,
  ArrowLeft,
  Package,
  Sparkles,
  Users,
  Building2,
  Mail,
  Zap
} from 'lucide-react';

interface VIPPlan {
  id: string;
  plan_name: string;
  description: string | null;
  billing_frequency: string;
  amount: number;
  is_active: boolean;
  plan_type: string;
}

const BENEFITS = [
  {
    icon: Shield,
    label: 'Priority Service',
    desc: 'Skip the line with priority scheduling and faster response times for all service requests.',
    iconBg: 'bg-blue-500/20',
    iconRing: 'ring-blue-400/30',
    iconColor: 'text-blue-400',
  },
  {
    icon: Wrench,
    label: 'Regular Maintenance',
    desc: 'Proactive system checks and tune-ups to prevent issues before they become problems.',
    iconBg: 'bg-emerald-500/20',
    iconRing: 'ring-emerald-400/30',
    iconColor: 'text-emerald-400',
  },
  {
    icon: Sparkles,
    label: 'Punchlist Access',
    desc: 'Track all service items, communicate directly with technicians, and manage your system easily.',
    iconBg: 'bg-amber-500/20',
    iconRing: 'ring-amber-400/30',
    iconColor: 'text-amber-400',
  },
  {
    icon: Phone,
    label: 'Dedicated Support',
    desc: 'Direct access to our support team with priority response for any questions or concerns.',
    iconBg: 'bg-orange-500/20',
    iconRing: 'ring-orange-400/30',
    iconColor: 'text-orange-400',
  },
  {
    icon: Clock,
    label: 'Extended Hours',
    desc: 'Access to extended service hours and priority emergency response when you need it most.',
    iconBg: 'bg-red-500/20',
    iconRing: 'ring-red-400/30',
    iconColor: 'text-red-400',
  },
  {
    icon: Users,
    label: 'Peace of Mind',
    desc: 'Comprehensive coverage and proactive care means fewer surprises and lower costs over time.',
    iconBg: 'bg-cyan-500/20',
    iconRing: 'ring-cyan-400/30',
    iconColor: 'text-cyan-400',
  },
];

const PLAN_FEATURES = [
  'Unlimited punchlist access',
  'Priority service scheduling',
  'Regular maintenance visits',
  'Dedicated support team',
  'Extended service hours',
  'Peace of mind protection',
];

export function PublicVIPMembership() {
  const [availablePlans, setAvailablePlans] = useState<VIPPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyEmail, setCompanyEmail] = useState('info@example.com');
  const [signupEnabled, setSignupEnabled] = useState(false);

  useEffect(() => {
    loadPlans();
    loadCompanySettings();
  }, []);

  async function loadPlans() {
    try {
      const { data: plans, error } = await supabase
        .from('recurring_plans')
        .select('*')
        .eq('is_active', true)
        .eq('plan_type', 'vip_plan')
        .eq('show_on_portal', true)
        .order('amount');

      if (error) throw error;
      setAvailablePlans(plans || []);
    } catch (error) {
      console.error('Error loading VIP plans:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCompanySettings() {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('primary_contact_email, enable_public_vip_signup')
        .maybeSingle();

      if (error) throw error;
      if (data?.primary_contact_email) {
        setCompanyEmail(data.primary_contact_email);
      }
      setSignupEnabled(data?.enable_public_vip_signup ?? false);
    } catch (error) {
      console.error('Error loading company settings:', error);
    }
  }

  function getBillingFrequencyLabel(frequency: string) {
    const labels: Record<string, string> = {
      monthly: 'per month',
      quarterly: 'per quarter',
      yearly: 'per year',
      weekly: 'per week',
    };
    return labels[frequency] || frequency;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-cyan-500/8 rounded-full blur-3xl" />
        </div>
        <div className="relative text-blue-200 text-lg">Loading VIP membership options...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1628]">
      {/* Background glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-cyan-500/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-10 w-64 h-64 bg-blue-800/15 rounded-full blur-2xl" />
      </div>

      {/* Header */}
      <div className="relative z-10 bg-gradient-to-r from-[#0f2347] to-[#1a3a6e] border-b border-white/10 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-0 sm:justify-between">
            <div className="flex flex-col items-center sm:items-start gap-3">
              <img
                src="/el_logo_color_(2).png"
                alt="Electronic Life"
                className="h-14 sm:h-16 object-contain"
              />
              <div className="text-center sm:text-left">
                <div className="text-xl sm:text-2xl font-bold text-white">VIP Membership</div>
                <div className="text-sm text-blue-200">Premium Service & Support</div>
              </div>
            </div>
            <a
              href="/portal"
              className="flex items-center gap-2 px-4 py-2.5 border border-white/20 hover:bg-white/10 text-white/80 hover:text-white rounded-xl transition-all text-sm font-medium min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </a>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">

        {/* Hero Section */}
        <div className="text-center mb-14 sm:mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-400/40 rounded-full text-amber-300 mb-6 text-sm font-semibold">
            <Star className="w-4 h-4" />
            VIP Membership Program
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
            Experience Premium Service
          </h1>
          <p className="text-base sm:text-lg text-blue-200 max-w-2xl mx-auto leading-relaxed">
            Join our VIP program and get priority access, dedicated support, and exclusive benefits designed to keep your systems running perfectly year-round.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-14 sm:mb-20">
          {BENEFITS.map(({ icon: Icon, label, desc, iconBg, iconRing, iconColor }) => (
            <div
              key={label}
              className="bg-[#0f2347]/80 border border-white/10 rounded-2xl p-6 hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-900/30 transition-all"
            >
              <div className={`w-11 h-11 ${iconBg} ring-1 ${iconRing} rounded-xl flex items-center justify-center mb-4`}>
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>
              <h3 className="text-base font-bold text-white mb-2">{label}</h3>
              <p className="text-sm text-blue-200 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Pricing / CTA Block */}
        {!signupEnabled ? (
          <div className="bg-[#0f2347] border border-white/10 rounded-2xl p-8 sm:p-12 text-center mb-14 sm:mb-20">
            <div className="w-16 h-16 bg-amber-500/20 ring-1 ring-amber-400/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Package className="w-8 h-8 text-amber-400" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">VIP Self-Signup Coming Soon</h3>
            <p className="text-blue-200 mb-8 max-w-lg mx-auto leading-relaxed">
              We're currently launching our 90-Day Test and Tune program through invitation only.
              Self-signup for VIP memberships will be available soon! In the meantime, contact us to learn more.
            </p>
            <a
              href={`mailto:${companyEmail}?subject=VIP Membership Inquiry&body=Hi,%0D%0A%0D%0AI'm interested in learning more about your VIP membership program.%0D%0A%0D%0AName:%0D%0APhone:%0D%0A%0D%0APlease contact me to discuss VIP membership options.`}
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold transition-all shadow-md min-h-[44px]"
            >
              <Mail className="w-4 h-4" />
              Contact Us About VIP Membership
            </a>
          </div>
        ) : availablePlans.length > 0 ? (
          <div className="mb-14 sm:mb-20">
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Choose Your Plan</h2>
              <p className="text-blue-200 text-base sm:text-lg">
                All plans include full access to VIP benefits and punchlist portal
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {availablePlans.map((plan) => (
                <div
                  key={plan.id}
                  className="bg-[#0f2347] border border-white/10 rounded-2xl p-6 sm:p-8 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-900/20 transition-all flex flex-col"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-amber-500/20 ring-1 ring-amber-400/30 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Zap className="w-5 h-5 text-amber-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">{plan.plan_name}</h3>
                  </div>

                  {plan.description && (
                    <p className="text-blue-200 text-sm mb-5 leading-relaxed">{plan.description}</p>
                  )}

                  <div className="mb-6">
                    <div className="text-4xl sm:text-5xl font-bold text-white mb-1">
                      ${plan.amount}
                    </div>
                    <div className="text-blue-300 text-sm">
                      {getBillingFrequencyLabel(plan.billing_frequency)}
                    </div>
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {PLAN_FEATURES.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm text-blue-200">
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <a
                    href={`/portal/signup?plan=${plan.id}`}
                    className="block w-full px-6 py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-center transition-all shadow-md min-h-[44px]"
                  >
                    Get Started
                  </a>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-[#0f2347] border border-white/10 rounded-2xl p-8 sm:p-12 text-center mb-14 sm:mb-20">
            <div className="w-16 h-16 bg-amber-500/20 ring-1 ring-amber-400/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Package className="w-8 h-8 text-amber-400" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">VIP Plans Coming Soon</h3>
            <p className="text-blue-200 mb-8 max-w-lg mx-auto leading-relaxed">
              We're setting up our VIP membership program. Check back soon or contact us for more information.
            </p>
            <a
              href="/portal"
              className="inline-flex items-center gap-2 px-6 py-3.5 border border-white/20 hover:bg-white/10 text-white rounded-xl font-semibold transition-all min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Portal
            </a>
          </div>
        )}

        {/* Business VIP Section */}
        <div className="mb-14 sm:mb-20 bg-gradient-to-r from-[#0f2347] to-[#0a1e3d] border border-white/10 rounded-2xl p-6 sm:p-10">
          <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
            <div className="flex-shrink-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-amber-500/20 ring-1 ring-amber-400/30 rounded-2xl flex items-center justify-center">
                <Building2 className="w-8 h-8 sm:w-10 sm:h-10 text-amber-400" />
              </div>
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-3">
                Looking for Business VIP Plans?
              </h2>
              <p className="text-blue-200 text-sm sm:text-base mb-2 leading-relaxed">
                We offer customized VIP service programs for businesses with unique needs. Our business plans include multi-location support, dedicated account management, priority emergency response, and flexible billing options.
              </p>
              <p className="text-blue-300 text-sm">
                Contact us to discuss a tailored VIP solution for your business.
              </p>
            </div>
            <div className="flex-shrink-0 w-full sm:w-auto">
              <a
                href={`mailto:${companyEmail}?subject=Business VIP Plan Inquiry&body=Hi,%0D%0A%0D%0AI'm interested in learning more about VIP membership options for my business.%0D%0A%0D%0ABusiness Name:%0D%0ANumber of Locations:%0D%0AContact Name:%0D%0APhone:%0D%0A%0D%0APlease contact me to discuss custom VIP solutions.`}
                className="w-full sm:w-auto px-6 py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold transition-all shadow-md flex items-center justify-center gap-2 min-h-[44px]"
              >
                <Mail className="w-4 h-4 flex-shrink-0" />
                <span className="whitespace-nowrap">Contact Us About Business Plans</span>
              </a>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        {signupEnabled && (
          <div className="bg-gradient-to-r from-[#0f2347] to-[#1a3a6e] border border-white/10 rounded-2xl p-8 sm:p-12 text-center shadow-xl mb-4">
            <div className="w-14 h-14 bg-amber-500/20 ring-1 ring-amber-400/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Star className="w-7 h-7 text-amber-400" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Ready to Experience VIP Service?
            </h2>
            <p className="text-base sm:text-lg text-blue-200 mb-8 max-w-2xl mx-auto leading-relaxed">
              Join hundreds of satisfied customers who trust us with their home and business systems.
              Sign up today and get your first month at a special introductory rate!
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="/portal/signup"
                className="w-full sm:w-auto px-8 py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold transition-all shadow-md text-base min-h-[44px] flex items-center justify-center"
              >
                Join Now
              </a>
              <a
                href="tel:+1234567890"
                className="w-full sm:w-auto px-8 py-3.5 border border-white/30 hover:bg-white/10 text-white rounded-xl font-semibold transition-all text-base flex items-center justify-center gap-2 min-h-[44px]"
              >
                <Phone className="w-5 h-5" />
                Call Us
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 border-t border-white/10 bg-[#070e1a] mt-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center space-y-4">
          <img
            src="/el_logo_color_(2).png"
            alt="Electronic Life"
            className="h-8 object-contain mx-auto opacity-60"
          />
          <div className="flex items-center justify-center gap-4 text-sm">
            <a
              href="/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
            >
              Privacy Policy
            </a>
            <span className="text-white/20">·</span>
            <a
              href="/eula"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
            >
              Terms of Service
            </a>
          </div>
          <p className="text-blue-200/40 text-xs">
            © {new Date().getFullYear()} Electronic Life. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
