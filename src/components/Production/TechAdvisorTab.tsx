import { useState, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Briefcase,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface TechEfficiencyRow {
  technician_id: string;
  technician_name: string;
  employment_type: string;
  current_payroll_hours: number;
  current_job_hours: number;
  current_efficiency_pct: number;
  current_days_worked: number;
  prior_payroll_hours: number;
  prior_job_hours: number;
  prior_efficiency_pct: number;
  prior_days_worked: number;
  efficiency_change: number;
  trend_direction: 'improving' | 'declining' | 'stable';
  current_miles_driven: number;
  current_trips: number;
}

interface TechAdvisorTabProps {
  startDate: string;
  endDate: string;
  priorStartDate: string;
  priorEndDate: string;
  periodLabel: string;
  priorPeriodLabel: string;
}

function getEfficiencyColor(pct: number) {
  if (pct >= 90) return 'text-green-400';
  if (pct >= 75) return 'text-blue-400';
  if (pct >= 60) return 'text-yellow-400';
  return 'text-red-400';
}

function getEfficiencyBg(pct: number) {
  if (pct >= 90) return 'bg-green-500/10 border-green-500/20';
  if (pct >= 75) return 'bg-blue-500/10 border-blue-500/20';
  if (pct >= 60) return 'bg-yellow-500/10 border-yellow-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

function TrendIcon({ direction, change }: { direction: string; change: number }) {
  if (direction === 'improving') {
    return (
      <span className="flex items-center gap-1 text-green-400 text-xs font-semibold">
        <TrendingUp className="w-3.5 h-3.5" />
        +{change.toFixed(1)}%
      </span>
    );
  }
  if (direction === 'declining') {
    return (
      <span className="flex items-center gap-1 text-red-400 text-xs font-semibold">
        <TrendingDown className="w-3.5 h-3.5" />
        {change.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-gray-400 text-xs font-semibold">
      <Minus className="w-3.5 h-3.5" />
      {change >= 0 ? '+' : ''}{change.toFixed(1)}%
    </span>
  );
}

// Render **bold** and section headers from the AI text
function FormattedAnalysis({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Horizontal rule separators (--- or ***)
        if (/^[-*]{3,}$/.test(trimmed)) {
          return <hr key={i} className="border-gray-700 my-3" />;
        }

        // Section headers: any line that is ONLY **...** content (case-insensitive, any chars inside)
        if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
          const title = trimmed.replace(/\*\*/g, '').trim();
          return (
            <h3 key={i} className="text-white font-bold text-base mt-6 mb-2 border-b border-gray-700 pb-1 uppercase tracking-wide">
              {title}
            </h3>
          );
        }

        // Lines with inline bold
        if (trimmed.includes('**')) {
          const parts = trimmed.split(/\*\*(.+?)\*\*/g);
          // Single bold segment with no surrounding text = technician name subheading
          if (parts.length === 3 && parts[0] === '' && parts[2] === '') {
            return (
              <p key={i} className="text-white font-semibold text-sm mt-4 mb-1">
                {parts[1]}
              </p>
            );
          }
          return (
            <p key={i} className="text-gray-300 text-sm leading-relaxed">
              {parts.map((part, j) =>
                j % 2 === 1
                  ? <strong key={j} className="text-white font-semibold">{part}</strong>
                  : part
              )}
            </p>
          );
        }

        // Empty line — small spacer
        if (trimmed === '') {
          return <div key={i} className="h-2" />;
        }

        return (
          <p key={i} className="text-gray-300 text-sm leading-relaxed">
            {line}
          </p>
        );
      })}
    </div>
  );
}

export function TechAdvisorTab({
  startDate,
  endDate,
  priorStartDate,
  priorEndDate,
  periodLabel,
  priorPeriodLabel,
}: TechAdvisorTabProps) {
  const [analysisText, setAnalysisText] = useState('');
  const [techStats, setTechStats] = useState<TechEfficiencyRow[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [cachedKey, setCachedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAllTechs, setShowAllTechs] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const cacheKey = `${startDate}|${endDate}|${priorStartDate}|${priorEndDate}`;

  const runAnalysis = useCallback(async () => {
    if (isStreaming) return;

    setIsStreaming(true);
    setError(null);
    setAnalysisText('');
    setTechStats([]);

    abortRef.current = new AbortController();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/tech-advisor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          currentStart: startDate,
          currentEnd: endDate,
          priorStart: priorStartDate,
          priorEnd: priorEndDate,
          periodLabel,
          priorPeriodLabel,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let statsLoaded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === 'tech_stats' && !statsLoaded) {
              setTechStats(parsed.data);
              statsLoaded = true;
            } else if (parsed.type === 'text') {
              setAnalysisText(prev => prev + parsed.content);
            } else if (parsed.type === 'error') {
              throw new Error(parsed.content);
            }
          } catch (parseErr) {
            // Only skip truly malformed JSON — re-throw Error objects from above
            if (parseErr instanceof Error && parseErr.message !== 'Unexpected token') {
              throw parseErr;
            }
          }
        }
      }

      const ts = new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
      setGeneratedAt(ts);
      setCachedKey(cacheKey);

      // Warn if the response looks truncated (no FORWARD PRIORITIES section = cut off)
      setAnalysisText(prev => {
        if (prev.length > 0 && !prev.includes('FORWARD PRIORITIES') && !prev.includes('Forward Priorities')) {
          return prev + '\n\n_Note: The analysis may have been truncated. Click Regenerate to get the full report._';
        }
        return prev;
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsStreaming(false);
    }
  }, [startDate, endDate, priorStartDate, priorEndDate, periodLabel, priorPeriodLabel, cacheKey, isStreaming]);

  const handleCopy = () => {
    navigator.clipboard.writeText(analysisText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isCacheValid = cachedKey === cacheKey && analysisText.length > 0;
  const hasAnalysis = analysisText.length > 0;
  const visibleTechs = showAllTechs ? techStats : techStats.slice(0, 6);

  const totalPayroll = techStats.reduce((s, t) => s + t.current_payroll_hours, 0);
  const totalJob = techStats.reduce((s, t) => s + t.current_job_hours, 0);
  const totalGap = totalPayroll - totalJob;
  // Weighted average: total job hours / total payroll hours (matches what the AI sees)
  const teamEfficiency = totalPayroll > 0 ? (totalJob / totalPayroll) * 100 : 0;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold text-white">AI Tech Advisor</h2>
          </div>
          <p className="text-gray-400 text-sm">
            CTO-level efficiency analysis &mdash; <span className="text-gray-300">{periodLabel}</span> vs <span className="text-gray-300">{priorPeriodLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasAnalysis && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg text-sm transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
          <button
            onClick={runAnalysis}
            disabled={isStreaming}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isStreaming ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : hasAnalysis ? (
              <>
                <RefreshCw className="w-4 h-4" />
                Regenerate
              </>
            ) : (
              <>
                <Brain className="w-4 h-4" />
                Run Analysis
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-3 bg-red-900/20 border border-red-700/40 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 font-medium text-sm">Analysis failed</p>
            <p className="text-red-400 text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Empty state — no analysis yet */}
      {!hasAnalysis && !isStreaming && !error && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-10 text-center">
          <Brain className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <h3 className="text-white font-semibold mb-1">Ready to analyze</h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Click <strong className="text-gray-300">Run Analysis</strong> to get a CTO-level efficiency
            review comparing <strong className="text-gray-300">{periodLabel}</strong> against{' '}
            <strong className="text-gray-300">{priorPeriodLabel}</strong> for every technician.
          </p>
        </div>
      )}

      {/* Tech stat cards — shown once data arrives */}
      {techStats.length > 0 && (
        <div className="space-y-3">
          {/* Team summary bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Team Efficiency</p>
              <p className={`text-2xl font-bold ${getEfficiencyColor(teamEfficiency)}`}>
                {teamEfficiency.toFixed(1)}%
              </p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-gray-400 text-xs uppercase tracking-wide">Payroll Hours</p>
              </div>
              <p className="text-2xl font-bold text-white">{totalPayroll.toFixed(1)}h</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-gray-400 text-xs uppercase tracking-wide">Job Hours</p>
              </div>
              <p className="text-2xl font-bold text-white">{totalJob.toFixed(1)}h</p>
              {totalGap > 0 && (
                <p className="text-xs text-red-400 mt-0.5">{totalGap.toFixed(1)}h unaccounted</p>
              )}
            </div>
          </div>

          {/* Per-tech cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleTechs.map(tech => (
              <div
                key={tech.technician_id}
                className={`bg-gray-800 border rounded-xl p-4 ${getEfficiencyBg(tech.current_efficiency_pct)}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-white font-semibold text-sm leading-tight">{tech.technician_name}</p>
                  <TrendIcon direction={tech.trend_direction} change={tech.efficiency_change} />
                </div>
                <div className="flex items-end gap-1 mb-2">
                  <span className={`text-2xl font-bold ${getEfficiencyColor(tech.current_efficiency_pct)}`}>
                    {tech.current_efficiency_pct.toFixed(1)}%
                  </span>
                  <span className="text-gray-500 text-xs mb-1">efficiency</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div>
                    <span className="text-gray-500">Payroll </span>
                    <span className="text-gray-300 font-medium">{tech.current_payroll_hours.toFixed(1)}h</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Job </span>
                    <span className="text-gray-300 font-medium">{tech.current_job_hours.toFixed(1)}h</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Days </span>
                    <span className="text-gray-300 font-medium">{tech.current_days_worked}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Prior </span>
                    <span className="text-gray-400">{tech.prior_efficiency_pct.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {techStats.length > 6 && (
            <button
              onClick={() => setShowAllTechs(v => !v)}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mx-auto"
            >
              {showAllTechs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showAllTechs ? 'Show less' : `Show all ${techStats.length} technicians`}
            </button>
          )}
        </div>
      )}

      {/* Streaming / completed analysis */}
      {(hasAnalysis || isStreaming) && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 bg-gray-800/80">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-white">CTO Operations Review</span>
              {isStreaming && (
                <span className="flex items-center gap-1 text-xs text-blue-400">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                  Generating...
                </span>
              )}
            </div>
            {generatedAt && !isStreaming && (
              <span className="text-xs text-gray-500">Generated {generatedAt}</span>
            )}
          </div>

          <div className="p-5">
            {hasAnalysis ? (
              <FormattedAnalysis text={analysisText} />
            ) : (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className={`h-3 bg-gray-700 rounded animate-pulse ${i === 3 ? 'w-2/3' : 'w-full'}`} />
                ))}
              </div>
            )}
            {isStreaming && hasAnalysis && (
              <span className="inline-block w-0.5 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        </div>
      )}

      {isCacheValid && !isStreaming && (
        <p className="text-xs text-gray-600 text-center">
          Analysis cached for current date range &mdash; click Regenerate to refresh
        </p>
      )}
    </div>
  );
}
