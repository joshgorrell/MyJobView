import { useState, useEffect, useRef } from 'react';
import { Camera, X, Scan, Keyboard } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
  title?: string;
  placeholder?: string;
}

export function BarcodeScanner({ onScan, onClose, title = "Scan Barcode", placeholder = "Enter or scan barcode..." }: BarcodeScannerProps) {
  const [manualInput, setManualInput] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onClose]);

  useEffect(() => {
    if (showCamera) {
      startCamera();
    }

    return () => {
      stopCamera();
    };
  }, [showCamera]);

  async function startCamera() {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (error) {
      console.error('Camera error:', error);
      setCameraError('Unable to access camera. Please check permissions or use manual entry.');
      setShowCamera(false);
    }
  }

  function stopCamera() {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manualInput.trim()) {
      onScan(manualInput.trim());
      setManualInput('');
    }
  }

  function toggleCamera() {
    if (showCamera) {
      stopCamera();
    }
    setShowCamera(!showCamera);
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-2xl">
        <div className="bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Scan className="w-5 h-5 text-blue-400" />
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {cameraError && (
            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
              <p className="text-sm text-yellow-400">{cameraError}</p>
            </div>
          )}

          {showCamera ? (
            <div className="space-y-4">
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-blue-500 rounded-lg w-64 h-32"></div>
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-400">Position barcode within the frame</p>
                <p className="text-xs text-gray-500 mt-1">
                  Camera scanning is a preview feature. Use manual entry for best results.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  <Keyboard className="w-4 h-4 inline mr-2" />
                  Manual Entry
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder={placeholder}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-lg focus:ring-2 focus:ring-blue-500"
                  autoComplete="off"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Type or scan with a handheld scanner, then press Enter
                </p>
              </div>

              <button
                type="submit"
                disabled={!manualInput.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                Submit Barcode
              </button>
            </form>
          )}

          <div className="pt-4 border-t border-gray-700">
            <button
              onClick={toggleCamera}
              className="w-full py-2 border border-gray-600 hover:bg-gray-700 text-gray-300 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Camera className="w-4 h-4" />
              {showCamera ? 'Use Manual Entry' : 'Use Camera (Preview)'}
            </button>
          </div>

          <div className="text-center">
            <button
              onClick={onClose}
              className="text-sm text-gray-400 hover:text-white"
            >
              Cancel (Esc)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
