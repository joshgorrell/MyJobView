export function PlatformFooter() {
  return (
    <footer className="bg-black py-2 px-4 border-t border-gray-800">
      <div className="flex items-center justify-center gap-2">
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
    </footer>
  );
}
