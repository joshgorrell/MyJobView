import { useEffect, useRef, useState } from 'react';
import Flow from '../Flow/Flow';
import { FlowWaveIcon } from '../Flow/FlowWaveIcon';
import { AtSign, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DiscussionFeed } from './DiscussionFeed';
import { DiscussionPostForm } from './DiscussionPostForm';

interface MasterFeedProps {
  onLeadClick: (leadId: string) => void;
}

function LegacyDiscussionFeed({ onLeadClick, focusPostId }: MasterFeedProps & { focusPostId?: string | null }) {
  const [selectedHashtag, setSelectedHashtag] = useState<string | undefined>();
  const [trendingHashtags, setTrendingHashtags] = useState<Array<{ hashtag: string; count: number }>>([]);
  const [showOnlyMentions, setShowOnlyMentions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMentionsSection, setShowMentionsSection] = useState(true);
  const hashtagReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadTrendingHashtags();

    const channel = supabase
      .channel('master_feed_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discussion_posts' }, () => {
        if (hashtagReloadTimer.current) clearTimeout(hashtagReloadTimer.current);
        hashtagReloadTimer.current = setTimeout(() => loadTrendingHashtags(), 2000);
      })
      .subscribe();

    return () => {
      if (hashtagReloadTimer.current) clearTimeout(hashtagReloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadTrendingHashtags() {
    try {
      // Use the stored hashtags array column instead of parsing full content
      const { data } = await supabase
        .from('discussion_posts')
        .select('hashtags')
        .not('hashtags', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);

      const hashtagCounts: Record<string, number> = {};

      (data || []).forEach((post) => {
        if (Array.isArray(post.hashtags)) {
          post.hashtags.forEach((tag: string) => {
            const normalized = tag.toLowerCase();
            hashtagCounts[normalized] = (hashtagCounts[normalized] || 0) + 1;
          });
        }
      });

      const sorted = Object.entries(hashtagCounts)
        .map(([hashtag, count]) => ({ hashtag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setTrendingHashtags(sorted);
    } catch (error) {
      console.error('Error loading trending hashtags:', error);
    }
  }

  function handleHashtagClick(hashtag: string) {
    if (selectedHashtag === hashtag) {
      setSelectedHashtag(undefined);
    } else {
      setSelectedHashtag(hashtag);
    }
  }

  return (
    <div className="space-y-4">
      <DiscussionPostForm onSuccess={() => {}} />

          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 space-y-4">
              <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search discussions, @users, or #topics..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <button
                    onClick={() => setShowMentionsSection(!showMentionsSection)}
                    className="w-full px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-between gap-2 bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200"
                  >
                    <div className="flex items-center gap-2">
                      <AtSign className="w-4 h-4" />
                      <span className="text-sm">My Mentions</span>
                    </div>
                    {showMentionsSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showMentionsSection && (
                    <div className="mt-2">
                      <button
                        onClick={() => {
                          setShowOnlyMentions(!showOnlyMentions);
                          if (!showOnlyMentions) {
                            setSelectedHashtag(undefined);
                          }
                        }}
                        className={`w-full px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                          showOnlyMentions
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <AtSign className="w-4 h-4" />
                        {showOnlyMentions ? 'Showing My Mentions' : 'Show My Mentions'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <DiscussionFeed
                onLeadClick={onLeadClick}
                focusPostId={focusPostId}
                selectedHashtag={selectedHashtag}
                onHashtagClick={handleHashtagClick}
                showOnlyMentions={showOnlyMentions}
                searchQuery={searchQuery}
              />
            </div>

            {trendingHashtags.length > 0 && (
              <div className="lg:w-80 space-y-4">
                <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-lg p-4 border border-cyan-200 sticky top-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Hash className="w-5 h-5 text-cyan-600" />
                    <h3 className="font-semibold text-gray-900">Trending Topics</h3>
                  </div>
                  <div className="space-y-2">
                    {trendingHashtags.map((item) => (
                      <button
                        key={item.hashtag}
                        onClick={() => {
                          handleHashtagClick(item.hashtag);
                          setShowOnlyMentions(false);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                          selectedHashtag === item.hashtag
                            ? 'bg-cyan-600 text-white'
                            : 'bg-white text-cyan-700 hover:bg-cyan-100 border border-cyan-300'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Hash className="w-4 h-4" />
                          {item.hashtag}
                        </span>
                        <span className="text-xs opacity-75">{item.count}</span>
                      </button>
                    ))}
                  </div>
                  {selectedHashtag && (
                    <div className="mt-3 pt-3 border-t border-cyan-200">
                      <button
                        onClick={() => setSelectedHashtag(undefined)}
                        className="text-xs text-cyan-700 hover:text-cyan-900 flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        Clear filter
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
    </div>
  );
}

export function MasterFeed({ onLeadClick }: MasterFeedProps) {
  const focusPostId = new URLSearchParams(window.location.search).get('postId');
  const [view, setView] = useState<'flow' | 'discussions'>(focusPostId ? 'discussions' : 'flow');
  return <div className="space-y-3">
    <div className="flex gap-2" aria-label="Feed view">
      <button onClick={() => setView('flow')} aria-pressed={view === 'flow'} className={`px-4 py-2 rounded-lg text-sm font-medium ${view === 'flow' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200'} flex items-center gap-2`}><FlowWaveIcon className="text-base" />Flow</button>
      <button onClick={() => setView('discussions')} aria-pressed={view === 'discussions'} className={`px-4 py-2 rounded-lg text-sm font-medium ${view === 'discussions' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}>Discussions</button>
    </div>
    {view === 'flow' ? <Flow /> : <LegacyDiscussionFeed onLeadClick={onLeadClick} focusPostId={focusPostId} />}
  </div>;
}
