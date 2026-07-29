interface QaDotProps {
  hasMessages: boolean;
  unreadCount: number;
  onClick: () => void;
}

export function QaDot({ hasMessages, unreadCount, onClick }: QaDotProps) {
  const hasUnread = unreadCount > 0;

  if (!hasMessages) {
    return (
      <button
        onClick={onClick}
        title="Ask a question or comment"
        aria-label="Ask a question or comment"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-gray-400 text-gray-400 hover:border-blue-500 hover:text-blue-500 transition-colors flex-shrink-0"
      >
        <span className="text-[11px] font-bold leading-none">?</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      title={hasUnread ? `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}` : 'View messages'}
      aria-label={hasUnread ? `${unreadCount} unread messages` : 'View messages'}
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white transition-colors flex-shrink-0 ${hasUnread ? 'bg-amber-500 hover:bg-amber-600' : 'bg-gray-500 hover:bg-gray-600'}`}
    >
      <span className="text-[10px] font-bold leading-none">
        {hasUnread ? (unreadCount > 9 ? '9+' : unreadCount) : ''}
      </span>
    </button>
  );
}
