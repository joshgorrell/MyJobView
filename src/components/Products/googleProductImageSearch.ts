export interface GoogleProductImage {
  url: string;
  preview: string;
  title: string;
  source: string;
  page: string | null;
}

type ResultsListener = (query: string, images: GoogleProductImage[]) => void;
let loading: Promise<void> | null = null;
let listener: ResultsListener | null = null;

function googleSearch() {
  return (window as any).google?.search?.cse?.element;
}

export async function mountGoogleProductImageSearch(cx: string, containerId: string, onResults: ResultsListener) {
  listener = onResults;
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      (window as any).__gcse = {
        parsetags: 'explicit',
        initializationCallback: () => resolve(),
        searchCallbacks: {
          image: {
            ready: (_name: string, query: string, _promos: unknown[], results: any[]) => {
              const images = (results || []).flatMap(result => {
                const url = result.image?.url;
                if (typeof url !== 'string' || !url.startsWith('https://')) return [];
                return [{
                  url,
                  preview: url,
                  title: String(result.titleNoFormatting || result.title || ''),
                  source: String(result.visibleUrl || ''),
                  page: typeof result.contextUrl === 'string' ? result.contextUrl : null,
                }];
              });
              listener?.(query, images);
              return false; // Let Google render its results and any ads normally.
            },
          },
        },
      };
      const script = document.createElement('script');
      script.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(cx)}`;
      script.async = true;
      script.onerror = () => { loading = null; reject(new Error('Google image search could not load.')); };
      document.head.appendChild(script);
    });
  }
  await loading;
  if (!document.getElementById(containerId)) return;
  googleSearch()?.render({
    div: containerId,
    tag: 'searchresults-only',
    gname: 'productphotos',
    attributes: { enableImageSearch: true, defaultToImageSearch: true, disableWebSearch: true, safeSearch: 'active' },
  });
}

export function searchGoogleProductImages(query: string) {
  const element = googleSearch()?.getElement('productphotos');
  if (!element) throw new Error('Google image search is not ready.');
  element.execute(query);
}

export function stopGoogleProductImageSearch() {
  listener = null;
}
