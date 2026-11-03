import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, Star, ThumbsUp, Meh, AlertCircle, Loader2, Sparkles } from 'lucide-react';

type Rating = 'excellent' | 'good' | 'okay' | 'needs_attention';
type Phase = 'rating' | 'comment' | 'positive' | 'negative' | 'submitting' | 'error';

const ratingConfig: Record<Rating, {
  label: string;
  sublabel: string;
  gradient: string;
  ring: string;
  icon: React.ReactNode;
}> = {
  excellent: {
    label: 'Excellent',
    sublabel: 'Loved it',
    gradient: 'from-green-500 to-emerald-600',
    ring: 'ring-green-400',
    icon: <ThumbsUp className="w-6 h-6" />,
  },
  good: {
    label: 'Good',
    sublabel: 'Pretty good',
    gradient: 'from-blue-500 to-blue-600',
    ring: 'ring-blue-400',
    icon: <ThumbsUp className="w-6 h-6" />,
  },
  okay: {
    label: 'Okay',
    sublabel: 'Could be better',
    gradient: 'from-amber-500 to-amber-600',
    ring: 'ring-amber-400',
    icon: <Meh className="w-6 h-6" />,
  },
  needs_attention: {
    label: 'Needs Work',
    sublabel: 'Not great',
    gradient: 'from-red-500 to-rose-600',
    ring: 'ring-red-400',
    icon: <AlertCircle className="w-6 h-6" />,
  },
};

const VALID_RATINGS: Rating[] = ['excellent', 'good', 'okay', 'needs_attention'];

function isValidRating(r: string | null): r is Rating {
  return VALID_RATINGS.includes(r as Rating);
}

interface CompanyInfo {
  reviewUrl?: string;
  name: string;
  logoUrl: string;
  email: string;
}

export function FeedbackPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const ratingParam = urlParams.get('rating');
  const token = urlParams.get('token');

  const hasAutoRating = isValidRating(ratingParam) && !!token;

  const [phase, setPhase] = useState<Phase>(hasAutoRating ? 'submitting' : 'rating');
  const [selectedRating, setSelectedRating] = useState<Rating | null>(
    isValidRating(ratingParam) ? ratingParam : null
  );
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    name: 'Electronic Life',
    logoUrl: 'https://bqtsuzvuvqvgidipbsis.supabase.co/storage/v1/object/public/company_logo/logo-1770649712721.png',
    email: '',
  });

  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    if (!token) loadCompanyInfo();
    if (hasAutoRating && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      submitRating(ratingParam as Rating);
    }
  }, []);

  async function loadCompanyInfo() {
    try {
      const { data } = await supabase
        .from('company_settings')
        .select('company_name, company_logo_url, company_email')
        .maybeSingle();
      if (data) {
        setCompanyInfo({
          name: data.company_name || 'Electronic Life',
          logoUrl: data.company_logo_url || companyInfo.logoUrl,
          email: data.company_email || '',
        });
      }
    } catch {
      // use defaults
    }
  }

  async function submitRating(rating: Rating) {
    if (!token) return;
    try {
      const { data, error } = await supabase.functions.invoke('submit-customer-feedback', { body: { token, rating } });
      if (error) throw error;
      setSelectedRating(rating);
      if (data?.company) setCompanyInfo({ ...data.company, reviewUrl: data.company.reviewUrl || undefined });
      setPhase('comment');
    } catch {
      setPhase('error');
    }
  }

  async function handleRatingSelect(rating: Rating) {
    if (!token) return;
    setSelectedRating(rating);
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('submit-customer-feedback', { body: { token, rating } });
      if (error) throw error;
      if (data?.company) setCompanyInfo({ ...data.company, reviewUrl: data.company.reviewUrl || undefined });
      setPhase('comment');
    } catch {
      setPhase('error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitComment(skipComment = false) {
    if (!token || !selectedRating) return;
    setSubmitting(true);
    try {
      const commentText = skipComment ? '' : comment.trim();
      if (commentText) {
        const { error } = await supabase.functions.invoke('submit-customer-feedback', { body: { token, rating: selectedRating, comment: commentText } });
        if (error) throw error;
      }

      const isNegative = selectedRating === 'okay' || selectedRating === 'needs_attention';

      if (isNegative) {
        try {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-satisfaction-alert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
        } catch {
          // alert is best-effort
        }
        setPhase('negative');
      } else {
        setPhase('positive');
      }
    } catch {
      setPhase('error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-950 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
          <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <p className="text-gray-200 text-lg font-semibold">Invalid feedback link</p>
          <p className="text-gray-500 text-sm mt-1">This link may be expired or malformed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-950 to-slate-900 flex flex-col relative overflow-hidden">
      {/* Decorative background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-600/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-emerald-600/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative bg-gray-900/60 backdrop-blur-sm border-b border-gray-800/60 px-4 py-3 flex justify-center">
        <img
          src={companyInfo.logoUrl}
          alt={companyInfo.name}
          className="h-9 object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>

      <div className="relative flex-1 flex items-center justify-center p-4 py-8">
        <div className="w-full max-w-md">

          {/* Rating Selection Phase */}
          {phase === 'rating' && (
            <div className="bg-gray-900/70 backdrop-blur-sm border border-gray-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 mb-4">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-blue-300 text-xs font-medium tracking-wide uppercase">Quick Feedback</span>
                </div>
                <h1 className="text-2xl font-bold text-white mb-1.5">How did we do?</h1>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Tap the option that best describes your experience with {companyInfo.name}.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(Object.entries(ratingConfig) as [Rating, typeof ratingConfig[Rating]][]).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => handleRatingSelect(key)}
                    disabled={submitting}
                    className={`bg-gradient-to-br ${config.gradient} text-white rounded-2xl py-5 px-4 flex flex-col items-center gap-2 transition-all hover:scale-[1.03] hover:shadow-xl active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-md ring-1 ring-white/10`}
                  >
                    {submitting && selectedRating === key ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      config.icon
                    )}
                    <span className="font-bold text-sm">{config.label}</span>
                    <span className="text-white/70 text-xs font-normal">{config.sublabel}</span>
                  </button>
                ))}
              </div>

              <p className="text-center text-gray-600 text-xs mt-5">
                Takes less than 30 seconds
              </p>
            </div>
          )}

          {/* Comment Phase */}
          {phase === 'comment' && selectedRating && (
            <div className="bg-gray-900/70 backdrop-blur-sm border border-gray-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
              {/* Rating badge inline */}
              <div className="flex items-center justify-center mb-4">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${ratingConfig[selectedRating].ring} ring-1 bg-gray-800/50 text-white`}>
                  {ratingConfig[selectedRating].icon}
                  {ratingConfig[selectedRating].label}
                </div>
              </div>

              <h2 className="text-xl font-bold text-white text-center mb-1">Thanks for the feedback!</h2>
              <p className="text-gray-400 text-sm text-center mb-5">
                Want to share more? (optional)
              </p>

              {/* Google Review prompt for positive ratings */}
              {companyInfo.reviewUrl && (selectedRating === 'excellent' || selectedRating === 'good') && (
                <div className="mb-5 p-4 bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg">
                  <div className="flex items-center gap-1.5 mb-2">
                    {[1,2,3,4,5].map(i => (
                      <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                    ))}
                    <span className="text-gray-800 text-xs font-bold ml-1.5 uppercase tracking-wide">Google Review</span>
                  </div>
                  <p className="text-gray-900 font-bold text-sm mb-1">Sounds like we earned 5 stars!</p>
                  <p className="text-gray-500 text-xs mb-3 leading-relaxed">
                    Would you mind sharing on Google? It takes under 2 minutes and helps other customers find us.
                  </p>
                  <a
                    href={companyInfo.reviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full py-3 bg-white hover:bg-gray-50 text-gray-900 rounded-xl font-bold text-sm transition-all hover:shadow-md border border-gray-200"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-3.58-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                      <path fill="none" d="M0 0h48v48H0z"/>
                    </svg>
                    Leave a Google Review
                  </a>
                </div>
              )}

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Is there anything we could have done better?"
                className="w-full bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none text-sm mb-3"
              />

              <button
                onClick={() => handleSubmitComment(false)}
                disabled={submitting}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition-all hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Feedback'
                )}
              </button>
              <button
                onClick={() => handleSubmitComment(true)}
                disabled={submitting}
                className="w-full mt-2 py-2.5 text-gray-500 hover:text-gray-400 transition-colors text-xs disabled:opacity-40"
              >
                Skip and submit without a comment
              </button>
            </div>
          )}

          {/* Positive Outcome — Google Review Prompt */}
          {phase === 'positive' && (
            <div className="bg-gray-900/70 backdrop-blur-sm border border-gray-800 rounded-3xl shadow-2xl overflow-hidden">
              {/* Success banner */}
              <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Feedback received!</h2>
                  <p className="text-green-100 text-xs">Your feedback has been shared with our team.</p>
                </div>
              </div>

              <div className="p-6 sm:p-7">
                {companyInfo.reviewUrl ? (
                  <>
                    <div className="flex items-center justify-center gap-1.5 mb-3">
                      {[1, 2, 3, 4, 5].map(i => (
                        <Star key={i} className="w-6 h-6 text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                    <h3 className="text-xl font-bold text-white text-center mb-1.5">
                      We'd love a Google review!
                    </h3>
                    <p className="text-gray-400 text-sm text-center leading-relaxed mb-5">
                      It takes under 2 minutes and helps other customers find reliable service.
                    </p>

                    {/* Google Review CTA — primary focal point */}
                    <a
                      href={companyInfo.reviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-3 w-full py-4 bg-white hover:bg-gray-50 text-gray-900 rounded-xl font-bold text-base transition-all hover:shadow-xl hover:scale-[1.02] active:scale-100 border border-gray-200"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-3.58-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                        <path fill="none" d="M0 0h48v48H0z"/>
                      </svg>
                      Leave a Google Review
                    </a>
                    <p className="text-center text-gray-600 text-xs mt-3">
                      Your review helps our team grow and helps other customers find great service.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-1.5 mb-3">
                      {[1, 2, 3, 4, 5].map(i => (
                        <Star key={i} className="w-6 h-6 text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                    <h3 className="text-lg font-bold text-white text-center mb-1.5">
                      Thank you for your feedback!
                    </h3>
                    <p className="text-gray-400 text-sm text-center leading-relaxed">
                      Your review helps our team grow and helps other customers find great service.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Negative Outcome — Thank You Without Review Link */}
          {phase === 'negative' && (
            <div className="bg-gray-900/70 backdrop-blur-sm border border-gray-800 rounded-3xl shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Thank you for letting us know</h2>
                  <p className="text-blue-100 text-xs">Your feedback has been shared with our team.</p>
                </div>
              </div>

              <div className="p-6 sm:p-7">
                <p className="text-gray-300 text-sm leading-relaxed mb-4">
                  We're sorry your experience wasn't everything it should have been. We'll use your feedback to improve.
                </p>
                {companyInfo.email && (
                  <div className="bg-gray-800/50 rounded-xl p-4 text-center">
                    <p className="text-gray-400 text-xs mb-1">Need to talk to someone?</p>
                    <a href={`mailto:${companyInfo.email}`} className="text-blue-400 hover:text-blue-300 font-semibold text-sm transition-colors">
                      {companyInfo.email}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submitting / Loading */}
          {phase === 'submitting' && (
            <div className="bg-gray-900/70 backdrop-blur-sm border border-gray-800 rounded-3xl p-8 shadow-2xl text-center">
              <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-3" />
              <p className="text-gray-300 text-sm">Saving your feedback...</p>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="bg-gray-900/70 backdrop-blur-sm border border-gray-800 rounded-3xl p-8 shadow-2xl text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-red-400" />
              </div>
              <h2 className="text-lg font-bold text-white mb-1">Something went wrong</h2>
              <p className="text-gray-400 text-sm">We couldn't save your feedback. This link may have already been used.</p>
            </div>
          )}
        </div>
      </div>

      <div className="relative text-center py-3 text-gray-700 text-xs">
        &copy; {new Date().getFullYear()} {companyInfo.name}
      </div>
    </div>
  );
}
