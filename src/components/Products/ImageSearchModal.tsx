import React, { useState, useEffect } from 'react';
import { X, Search, Image as ImageIcon, Loader2, ExternalLink } from 'lucide-react';

interface ImageSearchModalProps {
  searchQuery: string;
  onClose: () => void;
  onSelectImage: (imageUrl: string) => void;
}

interface ImageResult {
  url: string;
  thumbnail: string;
  description: string;
  source: string;
}

export default function ImageSearchModal({ searchQuery, onClose, onSelectImage }: ImageSearchModalProps) {
  const [query, setQuery] = useState(searchQuery);
  const [images, setImages] = useState<ImageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (searchQuery) {
      handleSearch(searchQuery);
    }
  }, []);

  async function handleSearch(searchTerm: string = query) {
    if (!searchTerm.trim()) {
      setError('Please enter a search term');
      return;
    }

    setLoading(true);
    setError(null);
    setImages([]);

    try {
      // Use multiple sources for better results
      const results = await searchMultipleSources(searchTerm);

      if (results.length === 0) {
        setError('No images found. Try a different search term.');
      } else {
        setImages(results);
      }
    } catch (err) {
      console.error('Image search error:', err);
      setError('Failed to search for images. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function searchMultipleSources(searchTerm: string): Promise<ImageResult[]> {
    const results: ImageResult[] = [];

    // Search using Pexels API (no auth required for basic usage)
    try {
      const pexelsResults = await searchPexels(searchTerm);
      results.push(...pexelsResults);
    } catch (error) {
      console.error('Pexels search failed:', error);
    }

    // If no results, try Pixabay as fallback
    if (results.length === 0) {
      try {
        const pixabayResults = await searchPixabay(searchTerm);
        results.push(...pixabayResults);
      } catch (error) {
        console.error('Pixabay search failed:', error);
      }
    }

    return results;
  }

  async function searchPexels(searchTerm: string): Promise<ImageResult[]> {
    try {
      // Pexels API - Free tier, no key required for basic searches
      const apiKey = '563492ad6f91700001000001f8d87f13d1404ec6a7bf8e7f5f3f1c5c';
      const perPage = 20;

      const response = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchTerm)}&per_page=${perPage}&orientation=landscape`,
        {
          headers: {
            'Authorization': apiKey
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Pexels API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.photos || data.photos.length === 0) {
        return [];
      }

      return data.photos.map((photo: any) => ({
        url: photo.src.large,
        thumbnail: photo.src.medium,
        description: photo.alt || searchTerm,
        source: 'Pexels'
      }));
    } catch (error) {
      console.error('Error searching Pexels:', error);
      return [];
    }
  }

  async function searchPixabay(searchTerm: string): Promise<ImageResult[]> {
    try {
      // Pixabay API - Free, public API key
      const apiKey = '45607-6e0e6b28d4a6de4a1f5d85c14';
      const perPage = 20;

      const response = await fetch(
        `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(searchTerm)}&image_type=photo&per_page=${perPage}&orientation=horizontal`
      );

      if (!response.ok) {
        throw new Error(`Pixabay API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.hits || data.hits.length === 0) {
        return [];
      }

      return data.hits.map((hit: any) => ({
        url: hit.largeImageURL,
        thumbnail: hit.webformatURL,
        description: hit.tags || searchTerm,
        source: 'Pixabay'
      }));
    } catch (error) {
      console.error('Error searching Pixabay:', error);
      return [];
    }
  }

  function handleSelectImage(image: ImageResult, index: number) {
    setSelectedIndex(index);
    onSelectImage(image.url);
    setTimeout(() => onClose(), 300);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ImageIcon className="w-6 h-6 text-blue-600" />
              Search Product Images
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Find the perfect image for your product
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g., Samsung TV, Sonos Speaker, Control4 Controller"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-base"
              />
            </div>
            <button
              onClick={() => handleSearch()}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Search
                </>
              )}
            </button>
          </div>

          {/* Search Tips */}
          <div className="mt-3 text-xs text-gray-500">
            <span className="font-medium">Tip:</span> Include manufacturer and model number for best results
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto p-6">
          {loading && images.length === 0 && (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-3" />
                <p className="text-gray-600">Searching for images...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {!loading && !error && images.length === 0 && (
            <div className="text-center py-20">
              <ImageIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">Enter a search term to find images</p>
              <p className="text-gray-400 text-sm mt-2">
                Try manufacturer name + model number for best results
              </p>
            </div>
          )}

          {images.length > 0 && (
            <>
              <div className="mb-4 text-sm text-gray-600">
                Found {images.length} images - Click to select
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectImage(image, index)}
                    className={`group relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all ${
                      selectedIndex === index
                        ? 'border-blue-600 ring-2 ring-blue-600 ring-offset-2'
                        : 'border-gray-200 hover:border-blue-400'
                    }`}
                  >
                    <img
                      src={image.thumbnail}
                      alt={image.description}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                    {/* Overlay on hover */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-2 left-2 right-2">
                        <p className="text-white text-xs font-medium truncate">
                          {image.description}
                        </p>
                        <p className="text-white/80 text-xs">
                          {image.source}
                        </p>
                      </div>
                    </div>
                    {/* Selected indicator */}
                    {selectedIndex === index && (
                      <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              <p className="flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                Images are sourced from Pexels and Pixabay (free stock photos)
              </p>
              <p className="mt-1">
                All images are free to use for commercial purposes
              </p>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
