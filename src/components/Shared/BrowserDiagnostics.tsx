import { useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';

interface DiagnosticResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
}

export function BrowserDiagnostics() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [running, setRunning] = useState(false);

  async function runDiagnostics() {
    setRunning(true);
    const diagnostics: DiagnosticResult[] = [];

    // 1. Check LocalStorage
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      diagnostics.push({
        name: 'LocalStorage',
        status: 'pass',
        message: 'LocalStorage is available',
      });
    } catch (e) {
      diagnostics.push({
        name: 'LocalStorage',
        status: 'fail',
        message: 'LocalStorage is blocked or disabled',
        details: 'This is required for login. Enable cookies and site data in your browser settings.',
      });
    }

    // 2. Check SessionStorage
    try {
      sessionStorage.setItem('test', 'test');
      sessionStorage.removeItem('test');
      diagnostics.push({
        name: 'SessionStorage',
        status: 'pass',
        message: 'SessionStorage is available',
      });
    } catch (e) {
      diagnostics.push({
        name: 'SessionStorage',
        status: 'fail',
        message: 'SessionStorage is blocked or disabled',
        details: 'Enable cookies and site data in your browser settings.',
      });
    }

    // 3. Check Cookies
    const cookiesEnabled = navigator.cookieEnabled;
    diagnostics.push({
      name: 'Cookies',
      status: cookiesEnabled ? 'pass' : 'fail',
      message: cookiesEnabled ? 'Cookies are enabled' : 'Cookies are disabled',
      details: cookiesEnabled ? undefined : 'Enable cookies in your browser settings.',
    });

    // 4. Check JavaScript
    diagnostics.push({
      name: 'JavaScript',
      status: 'pass',
      message: 'JavaScript is enabled',
    });

    // 5. Check Browser Info
    const userAgent = navigator.userAgent;
    let browserName = 'Unknown';
    let browserVersion = 'Unknown';

    if (userAgent.includes('Firefox/')) {
      browserName = 'Firefox';
      browserVersion = userAgent.split('Firefox/')[1]?.split(' ')[0] || 'Unknown';
    } else if (userAgent.includes('Edg/')) {
      browserName = 'Edge';
      browserVersion = userAgent.split('Edg/')[1]?.split(' ')[0] || 'Unknown';
    } else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
      browserName = 'Chrome';
      browserVersion = userAgent.split('Chrome/')[1]?.split(' ')[0] || 'Unknown';
    } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
      browserName = 'Safari';
      browserVersion = userAgent.split('Version/')[1]?.split(' ')[0] || 'Unknown';
    }

    diagnostics.push({
      name: 'Browser',
      status: 'pass',
      message: `${browserName} ${browserVersion}`,
    });

    // 6. Check Network Connection
    const online = navigator.onLine;
    diagnostics.push({
      name: 'Network',
      status: online ? 'pass' : 'fail',
      message: online ? 'Connected to internet' : 'No internet connection',
    });

    // 7. Check API Connectivity
    try {
      const response = await fetch(import.meta.env.VITE_SUPABASE_URL + '/rest/v1/', {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok || response.status === 401) {
        diagnostics.push({
          name: 'API Connection',
          status: 'pass',
          message: 'Can reach authentication server',
        });
      } else {
        diagnostics.push({
          name: 'API Connection',
          status: 'warn',
          message: `Server returned status ${response.status}`,
          details: 'The server is reachable but returned an unexpected status.',
        });
      }
    } catch (e) {
      diagnostics.push({
        name: 'API Connection',
        status: 'fail',
        message: 'Cannot reach authentication server',
        details: 'Check your network connection or firewall settings. Your company network may be blocking access.',
      });
    }

    // 8. Check Third-party Cookies
    diagnostics.push({
      name: 'Privacy Settings',
      status: 'warn',
      message: 'Check privacy/tracking protection',
      details: 'If you have strict privacy settings or browser extensions (ad blockers), try disabling them temporarily.',
    });

    // 9. Check IndexedDB
    try {
      const request = indexedDB.open('test');
      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
      });
      indexedDB.deleteDatabase('test');
      diagnostics.push({
        name: 'IndexedDB',
        status: 'pass',
        message: 'IndexedDB is available',
      });
    } catch (e) {
      diagnostics.push({
        name: 'IndexedDB',
        status: 'warn',
        message: 'IndexedDB may be blocked',
        details: 'Not critical, but may affect offline functionality.',
      });
    }

    // 10. Check Console for errors
    diagnostics.push({
      name: 'Console Check',
      status: 'warn',
      message: 'Check browser console (F12) for errors',
      details: 'Press F12 to open developer tools and check the Console tab for any red error messages.',
    });

    setResults(diagnostics);
    setRunning(false);
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'fail':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'warn':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      default:
        return <Info className="w-5 h-5 text-gray-600" />;
    }
  };

  const hasFailures = results.some((r) => r.status === 'fail');

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Browser Diagnostics</h2>
        <p className="text-gray-600 mb-6">
          Run this diagnostic to check if your browser is configured correctly for MyJobView.
        </p>

        <button
          onClick={runDiagnostics}
          disabled={running}
          className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium mb-6"
        >
          {running ? 'Running Diagnostics...' : 'Run Diagnostics'}
        </button>

        {results.length > 0 && (
          <div className="space-y-3">
            {hasFailures && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-red-900">Issues Detected</p>
                    <p className="text-sm text-red-700 mt-1">
                      Critical issues were found that may prevent login. Please follow the
                      recommendations below.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {results.map((result, index) => (
              <div
                key={index}
                className={`border rounded-lg p-4 ${
                  result.status === 'fail'
                    ? 'border-red-200 bg-red-50'
                    : result.status === 'warn'
                    ? 'border-yellow-200 bg-yellow-50'
                    : 'border-green-200 bg-green-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {getStatusIcon(result.status)}
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{result.name}</div>
                    <div className="text-sm text-gray-700 mt-1">{result.message}</div>
                    {result.details && (
                      <div className="text-sm text-gray-600 mt-2 bg-white bg-opacity-50 rounded p-2">
                        {result.details}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-900">
                  <p className="font-medium mb-2">Next Steps:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Fix any issues marked with a red X</li>
                    <li>Try using a different browser (Chrome, Firefox, or Edge)</li>
                    <li>Try disabling browser extensions or ad blockers temporarily</li>
                    <li>Check if you're on a corporate network with restrictions</li>
                    <li>Take a screenshot of these results and send to support</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
