export const supabase = { rpc: async (name: string, args: unknown) => {
  const response = await fetch('/fixture/rpc', { method: 'POST', body: JSON.stringify({ name, args }) });
  return response.json();
} };
