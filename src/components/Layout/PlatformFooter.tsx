import { MessageSquarePlus } from 'lucide-react';

interface PlatformFooterProps {
  onTellUs?: () => void;
}

export function PlatformFooter({ onTellUs }: PlatformFooterProps) {
  return (
    <footer className="theme-chrome bg-canvas py-2 px-4 border-t border-subtle">
      <div className="flex items-center justify-center gap-3">
        <div className="flex items-center gap-2">
          <img
            src="/MJV_icon.PNG"
            alt="MyJobView"
            className="h-7 w-7 object-contain"
          />
          <span className="text-[11px] font-medium tracking-wide text-muted whitespace-nowrap">
            Powered by
          </span>
          <span className="text-[11px] font-semibold tracking-wide text-primary whitespace-nowrap">
            MyJobView
          </span>
        </div>
        {onTellUs && (
          <>
            <span className="h-4 w-px bg-elevated" aria-hidden="true" />
            <button
              type="button"
              onClick={onTellUs}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold tracking-wide text-secondary transition-colors hover:bg-surface hover:text-primary"
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
