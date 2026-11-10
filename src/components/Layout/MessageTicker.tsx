import { useEffect, useState } from 'react';
import { AlertCircle, Info, Megaphone, Newspaper, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface CompanyMessage {
  id: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  type: 'news' | 'alert' | 'announcement' | 'info';
}

const chicagoDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export function MessageTicker() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<CompanyMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    let active = true;
    const loadMessages = async () => {
      const now = new Date().toISOString();
      const [{ data: regular }, { data: birthdays, error: birthdayError }] = await Promise.all([
        supabase.from('company_messages')
          .select('id, message, priority, type')
          .eq('is_active', true)
          .lte('start_date', now)
          .or('end_date.is.null,end_date.gte.' + now)
          .order('priority', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.rpc('get_todays_company_birthdays'),
      ]);
      if (!active) return;
      if (birthdayError) console.error('Unable to load employee birthdays:', birthdayError);
      const date = chicagoDate();
      const birthdayKey = `mJV-birthday-dismissed:${profile?.id}:${date}`;
      const names = (birthdays || []).map((row: { full_name: string }) => row.full_name).filter(Boolean);
      const birthdayMessage: CompanyMessage[] = names.length && profile?.id &&
        localStorage.getItem(birthdayKey) !== '1'
        ? [{
            id: `birthday:${date}`,
            message: names.length === 1
              ? `🎉 Happy Birthday, ${names[0]}! 🎂`
              : `🎉 Happy Birthday to ${names.join(', ')}! 🎂`,
            priority: 'normal', type: 'announcement',
          }]
        : [];
      setMessages([...birthdayMessage, ...(regular || [])]);
      setCurrentIndex((index) => birthdayMessage.length ? 0 : Math.min(index, Math.max((regular || []).length - 1, 0)));
    };
    void loadMessages();
    const subscription = supabase.channel('company_messages_changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'company_messages',
      }, () => { void loadMessages(); })
      .subscribe();
    // Refresh at midnight without requiring the user to reload MJV.
    const refresh = setInterval(() => { void loadMessages(); }, 60_000);
    return () => {
      active = false;
      clearInterval(refresh);
      void subscription.unsubscribe();
    };
  }, [profile?.id]);

  useEffect(() => {
    if (messages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % messages.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [messages.length]);

  if (messages.length === 0) return null;
  const currentMessage = messages[currentIndex] || messages[0];
  const isBirthday = currentMessage.id.startsWith('birthday:');

  const dismissBirthday = () => {
    if (!profile?.id || !isBirthday) return;
    const date = currentMessage.id.slice('birthday:'.length);
    localStorage.setItem(`mJV-birthday-dismissed:${profile.id}:${date}`, '1');
    setMessages((prev) => prev.filter((message) => message.id !== currentMessage.id));
    setCurrentIndex(0);
  };

  const getIcon = () => {
    switch (currentMessage.type) {
      case 'alert': return <AlertCircle className="w-4 h-4" />;
      case 'announcement': return <Megaphone className="w-4 h-4" />;
      case 'news': return <Newspaper className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  const getColor = () => {
    switch (currentMessage.priority) {
      case 'urgent': return 'bg-red-500/10 border-red-500/40 text-primary';
      case 'high': return 'bg-orange-500/10 border-orange-500/40 text-primary';
      case 'normal': return 'bg-blue-500/10 border-blue-500/40 text-primary';
      default: return 'bg-surface border-subtle text-primary';
    }
  };

  return (
    <div className="border-b border-subtle bg-canvas overflow-hidden">
      <div className="w-full px-3 sm:px-4 lg:px-5 py-1">
        <div className={`flex items-center gap-3 px-3 py-1 rounded-lg border ${getColor()} transition-all duration-300`}>
          <div className="flex-shrink-0">{getIcon()}</div>
          <div className="flex-1 overflow-hidden relative">
            <div className="text-sm font-medium">{currentMessage.message}</div>
          </div>
          {messages.length > 1 && (
            <div className="flex-shrink-0 flex items-center gap-1">
              {messages.map((_, idx) => (
                <button key={idx} onClick={() => setCurrentIndex(idx)}
                  className={`w-2 h-2 rounded-full transition-all ${idx === currentIndex ? 'bg-current' : 'bg-current/30'}`}
                  aria-label={`View message ${idx + 1}`} />
              ))}
            </div>
          )}
          {isBirthday && (
            <button type="button" onClick={dismissBirthday} aria-label="Dismiss birthday greeting"
              className="flex-shrink-0 p-1 rounded hover:bg-black/10">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
