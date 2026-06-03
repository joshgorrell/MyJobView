import { useEffect, useState } from 'react';
import { AlertCircle, Info, Megaphone, Newspaper } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CompanyMessage {
  id: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  type: 'news' | 'alert' | 'announcement' | 'info';
}

export function MessageTicker() {
  const [messages, setMessages] = useState<CompanyMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    loadMessages();

    const subscription = supabase
      .channel('company_messages_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'company_messages'
      }, () => {
        loadMessages();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadMessages = async () => {
    const { data } = await supabase
      .from('company_messages')
      .select('id, message, priority, type')
      .eq('is_active', true)
      .lte('start_date', new Date().toISOString())
      .or('end_date.is.null,end_date.gte.' + new Date().toISOString())
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (data) {
      setMessages(data);
      setCurrentIndex(0);
    }
  };

  useEffect(() => {
    if (messages.length > 1) {
      const interval = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % messages.length);
      }, 8000);

      return () => clearInterval(interval);
    }
  }, [messages.length]);

  if (messages.length === 0) {
    return null;
  }

  const currentMessage = messages[currentIndex];

  const getIcon = () => {
    switch (currentMessage.type) {
      case 'alert':
        return <AlertCircle className="w-4 h-4" />;
      case 'announcement':
        return <Megaphone className="w-4 h-4" />;
      case 'news':
        return <Newspaper className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getColor = () => {
    switch (currentMessage.priority) {
      case 'urgent':
        return 'bg-red-500/10 border-red-500/30 text-red-300';
      case 'high':
        return 'bg-orange-500/10 border-orange-500/30 text-orange-300';
      case 'normal':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-300';
      default:
        return 'bg-gray-500/10 border-gray-500/30 text-gray-300';
    }
  };

  return (
    <div className="border-b border-gray-700 bg-gray-900/50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className={`flex items-center gap-3 px-4 py-2 rounded-lg border ${getColor()} transition-all duration-300`}>
          <div className="flex-shrink-0">
            {getIcon()}
          </div>
          <div className="flex-1 overflow-hidden relative">
            <div className="text-sm font-medium">
              {currentMessage.message}
            </div>
          </div>
          {messages.length > 1 && (
            <div className="flex-shrink-0 flex items-center gap-1">
              {messages.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    idx === currentIndex ? 'bg-current' : 'bg-current/30'
                  }`}
                  aria-label={`View message ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
