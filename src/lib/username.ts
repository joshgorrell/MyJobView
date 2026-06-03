export function generateUsername(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 30);
}

export async function generateUniqueUsername(name: string, supabase: any): Promise<string> {
  const baseUsername = generateUsername(name);

  const [{ data: existingLead }, { data: existingContact }] = await Promise.all([
    supabase.from('leads').select('username').eq('username', baseUsername).maybeSingle(),
    supabase.from('contacts').select('username').eq('username', baseUsername).maybeSingle()
  ]);

  if (!existingLead && !existingContact) {
    return baseUsername;
  }

  let counter = 1;
  while (counter < 100) {
    const candidateUsername = `${baseUsername}${counter}`;

    const [{ data: leadExists }, { data: contactExists }] = await Promise.all([
      supabase.from('leads').select('username').eq('username', candidateUsername).maybeSingle(),
      supabase.from('contacts').select('username').eq('username', candidateUsername).maybeSingle()
    ]);

    if (!leadExists && !contactExists) {
      return candidateUsername;
    }

    counter++;
  }

  return `${baseUsername}${Date.now()}`;
}

export function parseHashtags(content: string): string[] {
  const hashtagRegex = /#([a-z0-9]+)/gi;
  const matches = content.matchAll(hashtagRegex);
  const hashtags = Array.from(new Set(Array.from(matches).map(match => match[1].toLowerCase())));
  return hashtags;
}

export function parseMentions(content: string): { userMentions: string[]; leadMentions: string[] } {
  const mentionRegex = /@([a-z0-9]+)/gi;
  content.matchAll(mentionRegex);

  return {
    userMentions: [],
    leadMentions: [],
  };
}

export async function resolveMentions(
  content: string,
  supabase: any
): Promise<{ userMentions: string[]; leadMentions: string[] }> {
  const mentionRegex = /@([a-z0-9]+)/gi;
  const matches = content.matchAll(mentionRegex);
  const allMentions = Array.from(new Set(Array.from(matches).map(match => match[1].toLowerCase())));

  if (allMentions.length === 0) {
    return { userMentions: [], leadMentions: [] };
  }

  const { data: users } = await supabase
    .from('profiles')
    .select('id, username')
    .in('username', allMentions);

  const { data: leads } = await supabase
    .from('leads')
    .select('id, username')
    .in('username', allMentions);

  const userMentions = (users || []).map((u: any) => u.id);
  const leadMentions = (leads || []).map((l: any) => l.id);

  return { userMentions, leadMentions };
}
