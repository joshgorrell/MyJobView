import { useState, useEffect } from 'react';
import { Check, Home, Building2, ChevronDown, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface SalesRep {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
}

type Step = 'form' | 'success';

interface InterestOption {
  id: string;
  label: string;
  allowCustom?: boolean;
}

const homeInterests: InterestOption[] = [
  { id: 'home-security', label: 'Home Security Systems' },
  { id: 'home-theater', label: 'Home Theater' },
  { id: 'home-av', label: 'Home Audio/Video' },
  { id: 'lighting-control', label: 'Lighting Control' },
  { id: 'golf-simulator', label: 'Golf Simulators' },
  { id: 'building-remodeling', label: "I'm Building or Remodeling" },
  { id: 'home-other', label: 'Something Else', allowCustom: true },
];

const businessInterests: InterestOption[] = [
  { id: 'business-security', label: 'Business Security Systems' },
  { id: 'business-av', label: 'Business Audio/Video Systems' },
  { id: 'business-lighting', label: 'Lighting Control' },
  { id: 'business-golf', label: 'Golf Simulators' },
  { id: 'video-conferencing', label: 'Video Conferencing Systems' },
  { id: 'business-building', label: "I'm Building or Remodeling Soon" },
  { id: 'business-other', label: 'Something Else', allowCustom: true },
];

export function TradeshowKiosk() {
  const [step, setStep] = useState<Step>('form');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [interestCategory, setInterestCategory] = useState<'home' | 'business' | null>(null);
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set());
  const [customInterest, setCustomInterest] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);

  // Hidden rep mode state
  const [repMode, setRepMode] = useState(false);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [loadingReps, setLoadingReps] = useState(false);
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);
  const [repDropdownOpen, setRepDropdownOpen] = useState(false);

  useEffect(() => {
    const addedMetaTags: HTMLMetaElement[] = [];

    const metaTags = [
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'apple-mobile-web-app-title', content: 'MJV Kiosk' },
      { name: 'mobile-web-app-capable', content: 'yes' },
    ];

    metaTags.forEach(({ name, content }) => {
      let existingTag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
      if (!existingTag) {
        const meta = document.createElement('meta');
        meta.name = name;
        meta.content = content;
        document.head.appendChild(meta);
        addedMetaTags.push(meta);
      }
    });

    let appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
    if (!appleTouchIcon) {
      appleTouchIcon = document.createElement('link');
      appleTouchIcon.rel = 'apple-touch-icon';
      appleTouchIcon.href = '/el_logo_color_(2).png';
      document.head.appendChild(appleTouchIcon);
    }

    return () => {
      addedMetaTags.forEach(tag => tag.remove());
    };
  }, []);

  useEffect(() => {
    // Ensure we're using anonymous access (no existing session)
    async function initializeKiosk() {
      try {
        setLoadingOrg(true);
        console.log('Kiosk: Initializing...');

        // Check current session
        const { data: sessionData } = await supabase.auth.getSession();
        console.log('Kiosk: Current session:', sessionData.session ? 'authenticated' : 'anonymous');

        // Sign out any existing session to ensure anonymous access
        if (sessionData.session) {
          console.log('Kiosk: Signing out existing session...');
          await supabase.auth.signOut();
          // Wait a moment for sign out to complete
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Fetch the organization ID for anonymous contact creation
        console.log('Kiosk: Fetching organization ID...');

        // Retry logic for organization fetch (helps with network issues)
        let data = null;
        let lastError = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
          console.log(`Kiosk: Fetch attempt ${attempt}/3`);

          const result = await supabase
            .from('organizations')
            .select('id')
            .eq('is_active', true)
            .limit(1)
            .single();

          if (!result.error && result.data) {
            data = result.data;
            break;
          }

          lastError = result.error;

          if (attempt < 3) {
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        if (!data) {
          console.error('Kiosk: Failed to fetch organization after 3 attempts:', lastError);
          setError('Unable to load form. Please check your internet connection and refresh.');
          return;
        }

        console.log('Kiosk: Organization loaded successfully:', data.id);
        setOrganizationId(data.id);
      } catch (err) {
        console.error('Kiosk: Exception during initialization:', err);
        setError('Unable to load form. Please refresh the page.');
      } finally {
        setLoadingOrg(false);
      }
    }

    initializeKiosk();
  }, []);

  const resetForm = () => {
    setStep('form');
    setFormData({ name: '', email: '', phone: '' });
    setInterestCategory(null);
    setSelectedInterests(new Set());
    setCustomInterest('');
    setError('');
    setSelectedRepId(null);
    setRepDropdownOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleActivateRepMode = async () => {
    if (repMode) {
      setRepMode(false);
      setSelectedRepId(null);
      setRepDropdownOpen(false);
      return;
    }
    setRepMode(true);
    if (salesReps.length > 0) return;
    if (!organizationId) return;
    setLoadingReps(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, username')
        .eq('organization_id', organizationId)
        .in('role', ['sales', 'sales_manager', 'manager', 'admin'])
        .eq('is_active', true)
        .order('full_name', { ascending: true });
      setSalesReps(data ?? []);
    } catch (_) {
    } finally {
      setLoadingReps(false);
    }
  };

  const getRepDisplayName = (rep: SalesRep) => {
    if (rep.full_name) return rep.full_name;
    if (rep.first_name || rep.last_name) return [rep.first_name, rep.last_name].filter(Boolean).join(' ');
    return rep.username ?? 'Unknown';
  };

  const selectedRep = salesReps.find(r => r.id === selectedRepId);

  const toggleInterest = (interestId: string) => {
    const newInterests = new Set(selectedInterests);
    if (newInterests.has(interestId)) {
      newInterests.delete(interestId);
    } else {
      newInterests.add(interestId);
    }
    setSelectedInterests(newInterests);
  };

  const formatPhoneNumber = (value: string) => {
    // Remove all non-digit characters
    const phoneNumber = value.replace(/\D/g, '');

    // Format as (XXX) XXX-XXXX
    if (phoneNumber.length <= 3) {
      return phoneNumber;
    } else if (phoneNumber.length <= 6) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    } else {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setFormData({ ...formData, phone: formatted });
  };

  const isContactInfoComplete = () => {
    return formData.name.trim() !== '' &&
           formData.email.trim() !== '' &&
           formData.phone.trim() !== '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Ensure organization is loaded
    if (!organizationId) {
      setError('Form not ready. Please refresh the page and try again.');
      return;
    }

    // Validate basic fields
    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim()) {
      setError('Please enter your name, email, and phone number');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address');
      return;
    }

    // Validate interests
    if (!interestCategory) {
      setError('Please select whether this is for your home or business');
      return;
    }

    if (selectedInterests.size === 0 && !customInterest.trim()) {
      setError('Please select at least one interest or enter your own');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const interests = Array.from(selectedInterests).map(id => {
        const allOptions = [...homeInterests, ...businessInterests];
        const option = allOptions.find(opt => opt.id === id);
        return option?.label || id;
      });

      if (customInterest.trim()) {
        interests.push(customInterest.trim());
      }

      const category = interestCategory === 'home' ? 'Residential' : 'Commercial';
      const opportunityDescription = `Tradeshow Lead - ${category}\n\nInterested in:\n${interests.map(i => `• ${i}`).join('\n')}`;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/submit-kiosk-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          opportunityDescription,
          interests,
          organizationId,
          assignedRepId: selectedRepId ?? undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Submission failed');
      }

      // Show success animation
      setStep('success');

      // Auto-reset after 5 seconds
      setTimeout(() => {
        resetForm();
      }, 5000);
    } catch (err: any) {
      console.error('Error creating lead:', err);
      // Show a user-friendly error message
      const errorMessage = err?.message || 'Unknown error';
      setError(`Sorry, we couldn't submit your information. ${errorMessage.includes('Failed to') ? errorMessage : 'Please try again or see a team member.'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-8 px-4 select-none">
      {/* Hidden rep mode trigger — styled as a trademark mark */}
      <button
        type="button"
        onClick={handleActivateRepMode}
        className="fixed bottom-3 right-4 text-gray-700 hover:text-gray-600 transition-colors z-50 text-xs leading-none select-none"
        style={{ fontFamily: 'serif', fontSize: '11px', background: 'none', border: 'none', padding: '4px', cursor: 'default', userSelect: 'none' }}
        tabIndex={-1}
        aria-hidden="true"
      >
        ®
      </button>

      {/* Rep mode panel */}
      {repMode && (
        <div className="fixed bottom-10 right-4 z-50 w-64 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-4 animate-fadeIn">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Assigned Rep</span>
            <button
              type="button"
              onClick={() => { setRepMode(false); setSelectedRepId(null); setRepDropdownOpen(false); }}
              className="text-gray-600 hover:text-gray-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {loadingReps ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-500 border-t-transparent"></div>
              Loading...
            </div>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setRepDropdownOpen(!repDropdownOpen)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white hover:border-gray-500 transition-colors"
              >
                <span className={selectedRep ? 'text-white' : 'text-gray-500'}>
                  {selectedRep ? getRepDisplayName(selectedRep) : 'Select a rep...'}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${repDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {repDropdownOpen && (
                <div className="absolute bottom-full mb-1 left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto z-10">
                  <button
                    type="button"
                    onClick={() => { setSelectedRepId(null); setRepDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-700 transition-colors"
                  >
                    None (fishbowl)
                  </button>
                  {salesReps.map(rep => (
                    <button
                      key={rep.id}
                      type="button"
                      onClick={() => { setSelectedRepId(rep.id); setRepDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        selectedRepId === rep.id
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {getRepDisplayName(rep)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedRep && (
            <p className="mt-2 text-xs text-cyan-400 text-center">
              Lead will be assigned to {getRepDisplayName(selectedRep)}
            </p>
          )}
        </div>
      )}

      <div className="w-full max-w-4xl mx-auto">
        {step === 'form' && (
          <div className="bg-gray-900/50 backdrop-blur-sm rounded-3xl shadow-2xl border border-purple-500/30 p-8 md:p-12 animate-fadeIn">
            <div className="text-center mb-8">
              <div className="mb-6">
                <img
                  src="/el_logo_color_(2).png"
                  alt="Electronic Life"
                  className="h-20 mx-auto"
                />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-3">
                Welcome to Electronic Life!
              </h1>
              <p className="text-xl md:text-2xl text-gray-300">
                Let's get to know you
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Contact Information */}
              <div className="space-y-6">
                <div>
                  <label className="block text-lg font-semibold text-white mb-3">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-6 py-5 text-xl bg-gray-800 border border-gray-700 text-white rounded-2xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-gray-500 transition-all"
                    placeholder="John Smith"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="block text-lg font-semibold text-white mb-3">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-6 py-5 text-xl bg-gray-800 border border-gray-700 text-white rounded-2xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-gray-500 transition-all"
                    placeholder="john@example.com"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="block text-lg font-semibold text-white mb-3">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={handlePhoneChange}
                    className="w-full px-6 py-5 text-xl bg-gray-800 border border-gray-700 text-white rounded-2xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-gray-500 transition-all"
                    placeholder="(555) 123-4567"
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Interest Category Selection */}
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-white text-center">
                  What are you interested in? *
                </h2>
                {!isContactInfoComplete() && (
                  <p className="text-center text-gray-400 text-sm">
                    Please complete your contact information above first
                  </p>
                )}

                <div className="grid md:grid-cols-2 gap-6">
                  <button
                    type="button"
                    onClick={() => isContactInfoComplete() && setInterestCategory('home')}
                    disabled={!isContactInfoComplete()}
                    className={`group rounded-3xl p-8 transition-all backdrop-blur-sm ${
                      !isContactInfoComplete()
                        ? 'bg-gray-800/50 border-2 border-gray-700 opacity-50 cursor-not-allowed'
                        : interestCategory === 'home'
                        ? 'bg-gradient-to-br from-cyan-500/30 to-blue-500/30 border-2 border-cyan-400 shadow-lg shadow-cyan-500/50 transform hover:scale-105 active:scale-95'
                        : 'bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-2 border-cyan-500/50 hover:border-cyan-400 transform hover:scale-105 active:scale-95'
                    }`}
                  >
                    <Home className={`w-16 h-16 mx-auto mb-4 ${
                      !isContactInfoComplete()
                        ? 'text-gray-600'
                        : interestCategory === 'home' ? 'text-cyan-300' : 'text-cyan-400'
                    }`} />
                    <h3 className={`text-3xl font-bold mb-2 ${
                      !isContactInfoComplete() ? 'text-gray-500' : 'text-white'
                    }`}>
                      For My Home
                    </h3>
                    <p className={`text-lg ${
                      !isContactInfoComplete() ? 'text-gray-600' : 'text-gray-300'
                    }`}>
                      Residential solutions
                    </p>
                    {interestCategory === 'home' && (
                      <div className="mt-3">
                        <Check className="w-8 h-8 text-cyan-300 mx-auto" />
                      </div>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => isContactInfoComplete() && setInterestCategory('business')}
                    disabled={!isContactInfoComplete()}
                    className={`group rounded-3xl p-8 transition-all backdrop-blur-sm ${
                      !isContactInfoComplete()
                        ? 'bg-gray-800/50 border-2 border-gray-700 opacity-50 cursor-not-allowed'
                        : interestCategory === 'business'
                        ? 'bg-gradient-to-br from-purple-500/30 to-blue-500/30 border-2 border-purple-400 shadow-lg shadow-purple-500/50 transform hover:scale-105 active:scale-95'
                        : 'bg-gradient-to-br from-purple-500/20 to-blue-500/20 border-2 border-purple-500/50 hover:border-purple-400 transform hover:scale-105 active:scale-95'
                    }`}
                  >
                    <Building2 className={`w-16 h-16 mx-auto mb-4 ${
                      !isContactInfoComplete()
                        ? 'text-gray-600'
                        : interestCategory === 'business' ? 'text-purple-300' : 'text-purple-400'
                    }`} />
                    <h3 className={`text-3xl font-bold mb-2 ${
                      !isContactInfoComplete() ? 'text-gray-500' : 'text-white'
                    }`}>
                      For My Business
                    </h3>
                    <p className={`text-lg ${
                      !isContactInfoComplete() ? 'text-gray-600' : 'text-gray-300'
                    }`}>
                      Commercial solutions
                    </p>
                    {interestCategory === 'business' && (
                      <div className="mt-3">
                        <Check className="w-8 h-8 text-purple-300 mx-auto" />
                      </div>
                    )}
                  </button>
                </div>
              </div>

              {/* Interest Options */}
              {interestCategory && (
                <div className="space-y-4 animate-fadeIn">
                  <h3 className="text-xl font-bold text-white text-center">
                    Select all that apply *
                  </h3>

                  <div className="grid gap-4">
                    {(interestCategory === 'home' ? homeInterests : businessInterests).map((interest) => (
                      <div key={interest.id}>
                        <button
                          type="button"
                          onClick={() => toggleInterest(interest.id)}
                          className={`w-full p-5 rounded-2xl text-left text-xl font-semibold transition-all transform hover:scale-102 active:scale-98 ${
                            selectedInterests.has(interest.id)
                              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/50 border border-cyan-400'
                              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{interest.label}</span>
                            {selectedInterests.has(interest.id) && (
                              <Check className="w-6 h-6" />
                            )}
                          </div>
                        </button>

                        {interest.allowCustom && selectedInterests.has(interest.id) && (
                          <div className="mt-3 ml-4 animate-fadeIn">
                            <input
                              type="text"
                              value={customInterest}
                              onChange={(e) => setCustomInterest(e.target.value)}
                              className="w-full px-5 py-4 text-lg bg-gray-800 border border-gray-700 text-white rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-gray-500"
                              placeholder="Please describe..."
                              autoComplete="off"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-2xl p-4 animate-fadeIn">
                  <p className="text-red-400 text-center text-lg">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || loadingOrg || !organizationId}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold py-6 px-8 rounded-2xl text-2xl flex items-center justify-center gap-3 transition-all transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingOrg ? (
                  <>
                    <div className="animate-spin rounded-full h-6 w-6 border-3 border-white border-t-transparent"></div>
                    Loading...
                  </>
                ) : loading ? (
                  <>
                    <div className="animate-spin rounded-full h-6 w-6 border-3 border-white border-t-transparent"></div>
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit
                    <Check className="w-8 h-8" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {step === 'success' && (
          <div className="bg-gray-900/50 backdrop-blur-sm rounded-3xl shadow-2xl border border-purple-500/30 p-8 md:p-12 text-center animate-fadeIn mt-20">
            <div className="mb-8">
              <div className="mb-6">
                <img
                  src="/el_logo_color_(2).png"
                  alt="Electronic Life"
                  className="h-20 mx-auto mb-8"
                />
              </div>
              <div className="inline-flex items-center justify-center w-32 h-32 bg-green-500/20 rounded-full mb-6 animate-successPulse border-2 border-green-400/50">
                <Check className="w-20 h-20 text-green-400 animate-successCheck" />
              </div>
              <h2 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-4">
                Thank You, {formData.name.split(' ')[0]}!
              </h2>
              <p className="text-2xl md:text-3xl text-white mb-4">
                We've received your information
              </p>
              <p className="text-xl text-gray-300">
                Someone from our team will contact you soon to discuss your interests.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 text-gray-400 text-lg">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-cyan-400 border-t-transparent"></div>
              <span>Returning to start...</span>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes successPulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }

        @keyframes successCheck {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.2);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }

        .animate-successPulse {
          animation: successPulse 2s ease-in-out infinite;
        }

        .animate-successCheck {
          animation: successCheck 0.6s ease-out;
        }
      `}</style>
    </div>
  );
}
