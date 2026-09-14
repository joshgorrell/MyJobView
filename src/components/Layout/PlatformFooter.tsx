export function PlatformFooter() {
  return (
    <div
      style={{ backgroundColor: '#000000' }}
      className="w-full"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex items-center justify-center gap-2">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="flex-shrink-0"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="9" height="9" rx="1.5" fill="#f9fafb" />
            <rect x="13" y="2" width="9" height="9" rx="1.5" fill="#9ca3af" />
            <rect x="2" y="13" width="9" height="9" rx="1.5" fill="#9ca3af" />
            <rect x="13" y="13" width="9" height="9" rx="1.5" fill="#f9fafb" />
          </svg>
          <span className="text-[11px] font-medium tracking-wide text-gray-400 whitespace-nowrap">
            Powered by
          </span>
          <span className="text-[11px] font-semibold tracking-wide text-gray-200 whitespace-nowrap">
            MyJobView
          </span>
        </div>
      </div>
    </div>
  );
}
