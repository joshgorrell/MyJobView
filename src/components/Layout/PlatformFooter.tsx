import { MessageSquarePlus } from 'lucide-react';

interface PlatformFooterProps {
  onTellUs?: () => void;
}

export function PlatformFooter({ onTellUs }: PlatformFooterProps) {
  return (
    <footer className="bg-black py-2 px-4 border-t border-gray-800">
      <div className="flex items-center justify-center gap-3">
        <div className="flex items-center gap-2">
          <img
            src="/MJV_icon.PNG"
            alt="MyJobView"
            className="h-7 w-7 object-contain"
          />
          <span className="text-[11px] font-medium tracking-wide text-gray-400 whitespace-nowrap">
            Powered by
          </span>
          <span className="text-[11px] font-semibold tracking-wide text-gray-100 whitespace-nowrap">
            MyJobView
          </span>
        </div>
        {onTellUs && (
          <>
            <span className="h-4 w-px bg-gray-700" aria-hidden="true" />
            <button
              type="button"
              onClick={onTellUs}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold tracking-wide text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
              title="Tell the MyJobView team what you think"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Tell Us
            </button>
          </>
        )}
      </div>
    </footer>
  );
}
