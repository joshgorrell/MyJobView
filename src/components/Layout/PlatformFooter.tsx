export function PlatformFooter() {
  return (
    <div
      style={{ backgroundColor: '#000000' }}
      className="w-full"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex items-center justify-center gap-2">
          <img
            src="/chatgpt_image_jan_16,_2026,_05_20_58_pm.png"
            alt="MyJobView"
            className="h-5 w-auto object-contain"
          />
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
