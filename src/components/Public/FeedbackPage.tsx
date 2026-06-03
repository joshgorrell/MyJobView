import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, Star, ThumbsUp, Meh, AlertCircle, Loader2 } from 'lucide-react';

const REVIEW_URL = 'https://g.page/r/CZzvVUth7kuyEBM/review';

type Rating = 'excellent' | 'good' | 'okay' | 'needs_attention';
type Phase = 'rating' | 'comment' | 'positive' | 'negative' | 'submitting' | 'error';

const ratingConfig: Record<Rating, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  excellent: {
    label: 'Excellent',
    color: 'text-green-400',
    bg: 'bg-green-600 hover:bg-green-500',
    border: 'border-green-500',
    icon: <ThumbsUp className="w-7 h-7" />,
  },
  good: {
    label: 'Good',
    color: 'text-blue-400',
    bg: 'bg-blue-600 hover:bg-blue-500',
    border: 'border-blue-500',
    icon: <ThumbsUp className="w-7 h-7" />,
  },
  okay: {
    label: 'Okay',
    color: 'text-amber-400',
    bg: 'bg-amber-600 hover:bg-amber-500',
    border: 'border-amber-500',
    icon: <Meh className="w-7 h-7" />,
  },
  needs_attention: {
    label: 'Needs Attention',
    color: 'text-red-400',
    bg: 'bg-red-600 hover:bg-red-500',
    border: 'border-red-500',
    icon: <AlertCircle className="w-7 h-7" />,
  },
};

const VALID_RATINGS: Rating[] = ['excellent', 'good', 'okay', 'needs_attention'];

function isValidRating(r: string | null): r is Rating {
  return VALID_RATINGS.includes(r as Rating);
}

interface CompanyInfo {
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
    loadCompanyInfo();
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
      const { error } = await supabase
        .from('customer_satisfaction')
        .update({ rating, responded_at: new Date().toISOString() })
        .eq('response_token', token);

      if (error) throw error;
      setSelectedRating(rating);
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
      const { error } = await supabase
        .from('customer_satisfaction')
        .update({ rating, responded_at: new Date().toISOString() })
        .eq('response_token', token);

      if (error) throw error;
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
        await supabase
          .from('customer_satisfaction')
          .update({ comment: commentText })
          .eq('response_token', token);
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-gray-300 text-lg">Invalid feedback link.</p>
          <p className="text-gray-500 text-sm mt-2">This link may be expired or malformed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-5 flex justify-center">
        <img
          src={companyInfo.logoUrl}
          alt={companyInfo.name}
          className="h-10 object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">

          {/* Rating Selection Phase */}
          {phase === 'rating' && (
            <div className="text-center">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-3">How did we do?</h1>
                <p className="text-gray-400 text-lg">Tap the button that best describes your experience with {companyInfo.name}.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {(Object.entries(ratingConfig) as [Rating, typeof ratingConfig[Rating]][]).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => handleRatingSelect(key)}
                    disabled={submitting}
                    className={`${config.bg} text-white rounded-2xl p-6 flex flex-col items-center gap-3 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg`}
                  >
                    {submitting && selectedRating === key ? (
                      <Loader2 className="w-7 h-7 animate-spin" />
                    ) : (
                      config.icon
                    )}
                    <span className="font-bold text-base">{config.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Comment Phase */}
          {phase === 'comment' && selectedRating && (
            <div>
              <div className="text-center mb-6">
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-4 border ${ratingConfig[selectedRating].border} ${ratingConfig[selectedRating].color} bg-gray-900`}>
                  {ratingConfig[selectedRating].icon}
                  You selected: {ratingConfig[selectedRating].label}
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Thank you for your feedback!</h2>
                <p className="text-gray-400">Would you like to share anything about your experience? (optional)</p>
              </div>

              {/* Google Review prompt shown immediately for positive ratings */}
              {(selectedRating === 'excellent' || selectedRating === 'good') && (
                <div className="mb-6 p-5 bg-gray-900 border border-gray-700 rounded-2xl">
                  <div className="flex items-center gap-2 mb-3">
                    {[1,2,3,4,5].map(i => (
                      <Star key={i} className="w-5 h-5 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <p className="text-white font-semibold mb-1">Sounds like we earned a 5-star review!</p>
                  <p className="text-gray-400 text-sm mb-4">Would you mind sharing on Google? It takes less than 2 minutes and helps other customers find us.</p>
                  <a
                    href={REVIEW_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-3 w-full py-4 bg-white hover:bg-gray-100 text-gray-900 rounded-xl font-bold text-base transition-colors shadow-lg"
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
                </div>
              )}

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                placeholder="We love feedback, is there anything we could have done better?"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 transition-colors resize-none text-base mb-4"
              />

              <button
                onClick={() => handleSubmitComment(false)}
                disabled={submitting}
                className="w-full py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-bold text-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Feedback'
                )}
              </button>
              <button
                onClick={() => handleSubmitComment(true)}
                disabled={submitting}
                className="w-full mt-3 py-3 text-gray-500 hover:text-gray-400 transition-colors text-sm disabled:opacity-40"
              >
                Skip and submit without a comment
              </button>
            </div>
          )}

          {/* Positive Outcome — Google Review Prompt */}
          {phase === 'positive' && (
            <div className="text-center">
              <div className="mb-6">
                <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                <h2 className="text-3xl font-bold text-white mb-3">We're so glad to hear that!</h2>
                <p className="text-gray-400 text-lg leading-relaxed">
                  Sounds like we earned a 5-star review. Would you mind sharing your experience on Google? It takes less than 2 minutes and helps other customers find reliable service.
                </p>
              </div>

              <a
                href={REVIEW_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-3 w-full py-5 bg-white hover:bg-gray-100 text-gray-900 rounded-2xl font-bold text-lg transition-colors shadow-xl mb-4"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-3.58-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  <path fill="none" d="M0 0h48v48H0z"/>
                </svg>
                Leave a Google Review
              </a>

              <div className="flex items-center gap-2 justify-center mb-6">
                {[1, 2, 3, 4, 5].map(i => (
                  <Star key={i} className="w-6 h-6 text-amber-400 fill-amber-400" />
                ))}
              </div>

              <p className="text-gray-500 text-sm">
                Your review helps our team grow and helps other customers find great service.
              </p>
            </div>
          )}

          {/* Negative Outcome — Thank You Without Review Link */}
          {phase === 'negative' && (
            <div className="text-center">
              <CheckCircle className="w-16 h-16 text-blue-400 mx-auto mb-6" />
              <h2 className="text-3xl font-bold text-white mb-3">Thank you for letting us know.</h2>
              <p className="text-gray-400 text-lg leading-relaxed mb-6">
                We're sorry your experience wasn't everything it should have been. Your feedback has been shared with our team and we'll use it to improve.
              </p>
              {companyInfo.email && (
                <p className="text-gray-500 text-sm">
                  If you'd like to speak with someone directly, feel free to reach us at{' '}
                  <a href={`mailto:${companyInfo.email}`} className="text-blue-400 hover:underline">
                    {companyInfo.email}
                  </a>.
                </p>
              )}
            </div>
          )}

          {/* Submitting / Loading */}
          {phase === 'submitting' && (
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-gray-400 animate-spin mx-auto mb-4" />
              <p className="text-gray-300 text-lg">Saving your feedback...</p>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
              <p className="text-gray-400">We couldn't save your feedback. This link may have already been used.</p>
            </div>
          )}
        </div>
      </div>

      <div className="text-center py-6 text-gray-600 text-xs">
        &copy; {new Date().getFullYear()} {companyInfo.name}
      </div>
    </div>
  );
}
