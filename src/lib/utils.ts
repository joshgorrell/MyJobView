export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '$0.00';
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDistanceToNow(date: string): string {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  // Debug logging
  if (date.includes('2026-01-26') && diffInSeconds < 3600) {
    console.log('formatDistanceToNow DEBUG:', {
      input: date,
      now: now.toISOString(),
      past: past.toISOString(),
      diffInSeconds,
      diffInMinutes: Math.floor(diffInSeconds / 60),
      diffInHours: Math.floor(diffInSeconds / 3600),
      diffInDays: Math.floor(diffInSeconds / 86400),
      nowTime: now.getTime(),
      pastTime: past.getTime(),
    });
  }

  if (diffInSeconds < 0) {
    // Future date - something is wrong, treat as "just now"
    return 'just now';
  }

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return past.toLocaleDateString();
}

export function extractMentions(text: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

export function extractTags(text: string): string[] {
  const tagRegex = /#(\w+)/g;
  const tags: string[] = [];
  let match;

  while ((match = tagRegex.exec(text)) !== null) {
    tags.push(match[1].toLowerCase());
  }

  return tags;
}

export function formatPhoneNumber(value: string): string {
  const cleaned = value.replace(/\D/g, '');

  if (cleaned.length === 0) return '';

  if (cleaned.length <= 3) {
    return cleaned;
  }

  if (cleaned.length <= 6) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
  }

  if (cleaned.length <= 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }

  return `+${cleaned.slice(0, cleaned.length - 10)} (${cleaned.slice(-10, -7)}) ${cleaned.slice(-7, -4)}-${cleaned.slice(-4)}`;
}

export function formatRoleName(role: string): string {
  const roleMap: Record<string, string> = {
    'admin': 'Admin',
    'finance': 'Finance',
    'manager': 'Manager',
    'service_manager': 'Service Manager',
    'office_manager': 'Office Manager',
    'project_manager': 'Project Manager',
    'sales': 'Sales',
    'tech': 'Technician',
    'portal_user': 'Portal User',
  };

  return roleMap[role] || role.split('_').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}
