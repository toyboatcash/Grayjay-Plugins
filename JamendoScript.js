// Jamendo API Configuration
const API_BASE = "https://api.jamendo.com/v3.0";
const CLIENT_ID = "0ed7affd"; // Client ID for API authentication
const ITEMS_PER_PAGE = 20;

// List of available client IDs to rotate if one gets rate-limited
const CLIENT_IDS = [
    "0ed7affd",  // Primary client ID
    "c6b1f8c4",  // Fallback 1
    "2c9bb9a5"   // Fallback 2
];
let currentClientIdIndex = 0;

// Helper function to get the current client ID
function getClientId() {
    return CLIENT_IDS[currentClientIdIndex] || CLIENT_IDS[0];
}

// Helper function to rotate to the next client ID
function rotateClientId() {
    currentClientIdIndex = (currentClientIdIndex + 1) % CLIENT_IDS.length;
    console.log(`Rotated to client ID index: ${currentClientIdIndex}`);
}

// Helper function to make API requests with retry logic
async function jamendoRequest(endpoint, params = {}, retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second
    
    try {
        // Add client_id to all requests
        const queryParams = new URLSearchParams({
            client_id: getClientId(),
            format: 'json',
            limit: ITEMS_PER_PAGE,
            ...params
        });

        const url = `${API_BASE}${endpoint}?${queryParams}`;
        console.log(`Making request to: ${url}`);
        
        try {
            const response = await Http.GET(url, {}, false);
            console.log(`Response status: ${response.code} ${response.status}`);
            
            // Check for rate limiting or authentication errors
            if (response.code === 429 || response.code === 401 || response.code === 403) {
                // If we have retries left and have other client IDs to try
                if (retryCount < MAX_RETRIES && CLIENT_IDS.length > 1) {
                    console.log(`API error (${response.code}), rotating client ID and retrying...`);
                    rotateClientId();
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                    return jamendoRequest(endpoint, params, retryCount + 1);
                }
                throw new ScriptException(`API request failed: ${response.code} - ${response.status}`);
            }
            
            if (response.code < 200 || response.code >= 300) {
                throw new ScriptException(`API request failed: ${response.code} - ${response.status}`);
            }
            
            let data;
            try {
                data = JSON.parse(response.body);
            } catch (e) {
                console.error('Failed to parse JSON response:', e);
                console.error('Response body:', response.body?.substring(0, 500));
                throw new ScriptException('Invalid JSON response from server');
            }
            
            // Check for API-level errors
            if (data?.headers?.status === 'failed') {
                const errorMsg = data.headers.error_message || 'Unknown API error';
                console.error('API error response:', errorMsg);
                
                // If we have retries left, try again with a different client ID
                if (retryCount < MAX_RETRIES && CLIENT_IDS.length > 1) {
                    console.log('API error, rotating client ID and retrying...');
                    rotateClientId();
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                    return jamendoRequest(endpoint, params, retryCount + 1);
                }
                
                throw new ScriptException(`API error: ${errorMsg}`);
            }
            
            if (!data) {
                throw new ScriptException('Empty response from server');
            }
            
            // Some endpoints might return results directly as an array
            if (Array.isArray(data)) {
                console.log('API returned array response, converting to results format');
                data = { results: data };
            }
            
            if (!data.results) {
                console.warn('No results in API response, using empty array');
                data.results = [];
            }
            
            return data;
            
        } catch (error) {
            console.error('Request failed:', error);
            throw error;
        }
        
    } catch (error) {
        console.error('Error in jamendoRequest:', {
            error: error.message,
            endpoint: endpoint,
            params: params,
            retryCount: retryCount
        });
        
        // If we have retries left, try again
        if (retryCount < MAX_RETRIES) {
            console.log(`Retrying request (${retryCount + 1}/${MAX_RETRIES})...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
            return jamendoRequest(endpoint, params, retryCount + 1);
        }
        
        throw error; // Re-throw if we've exhausted all retries
    }
}

// Convert Jamendo track to Grayjay video format
function trackToVideo(track) {
    try {
        if (!track) {
            console.error('Track is undefined or null');
            return null;
        }

        // Debug log the track object to see what we're working with
        console.log('Processing track:', {
            id: track.id,
            name: track.name,
            artist_id: track.artist_id,
            artist_name: track.artist_name,
            has_image: !!(track.album_image || track.image)
        });

        // Handle image URL - the API might return a function call that needs to be constructed
        let imageUrl = '';
        if (track.album_image) {
            // If it's a URL, use it directly, otherwise try to construct it
            imageUrl = track.album_image.startsWith('http') 
                ? track.album_image 
                : `https://imgproxy.ra.co/_/quality:75/plain/${encodeURIComponent(track.album_image)}`;
        } else if (track.image) {
            imageUrl = track.image.startsWith('http')
                ? track.image
                : `https://imgproxy.ra.co/_/quality:75/plain/${encodeURIComponent(track.image)}`;
        }

        const video = {
            id: track.id.toString(),
            name: track.name || 'Unknown Track',
            author: {
                id: track.artist_id?.toString() || 'unknown',
                name: track.artist_name || 'Unknown Artist',
                url: `https://www.jamendo.com/artist/${track.artist_id || 'unknown'}`,
                thumbnail: track.artist_image || ''
            },
            url: track.shareurl || `https://www.jamendo.com/track/${track.id}`,
            thumbnails: imageUrl ? [{ url: imageUrl, width: 300, height: 300 }] : [],
            duration: parseInt(track.duration || 0) * 1000, // Convert to milliseconds
            viewCount: (parseInt(track.downloads || 0) + parseInt(track.listens || 0)) || 0,
            isLive: false,
            shareUrl: track.shareurl || `https://www.jamendo.com/track/${track.id}`,
            datetime: track.releasedate ? new Date(track.releasedate).getTime() : Date.now(),
            description: track.musicinfo?.description || '',
            rating: {
                likes: parseInt(track.likes || 0),
                dislikes: 0
            }
        };

        return video;
    } catch (error) {
        console.error('Error in trackToVideo:', error, track);
        return null;
    }
}

// Convert Jamendo artist to Grayjay channel format
function artistToChannel(artist) {
    return {
        id: artist.id,
        name: artist.name,
        url: `https://www.jamendo.com/artist/${artist.id}`,
        thumbnail: artist.image || '',
        description: artist.website || '',
        subscribers: parseInt(artist.fans || 0)
    };
}

// Convert Jamendo album/playlist to Grayjay playlist format
function albumToPlaylist(album) {
    return {
        id: album.id,
        name: album.name,
        author: {
            id: album.artist_id,
            name: album.artist_name,
            url: `https://www.jamendo.com/artist/${album.artist_id}`
        },
        url: `https://www.jamendo.com/album/${album.id}`,
        thumbnail: album.image,
        videoCount: parseInt(album.tracks_count || 0),
        description: album.releasedate ? `Released: ${album.releasedate}` : ''
    };
}

// Source implementation
class JamendoSource {
    constructor() {
        this.name = "Jamendo";
        this.id = "jamendo";
    }

    // Homepage - Popular tracks
    async getHome(context) {
        try {
            console.log('Loading home feed...');
            const page = context?.page || 1;
            const offset = (page - 1) * ITEMS_PER_PAGE;
            
            console.log(`Fetching page ${page} with offset ${offset}`);
            
            // Simplified request with only essential parameters
            const data = await jamendoRequest('/tracks', {
                order: 'popularity_total',
                offset: offset,
                limit: ITEMS_PER_PAGE,
                audioformat: 'mp32',
                fields: 'id,name,duration,artist_id,artist_name,album_image,audio,shareurl,listens'
            });

            // If we don't get results, try a more basic request
            if (!data || !data.results || data.results.length === 0) {
                console.log('No results with full query, trying basic query...');
                const basicData = await jamendoRequest('/tracks', {
                    order: 'popularity_total',
                    limit: ITEMS_PER_PAGE
                });
                
                if (!basicData || !basicData.results) {
                    console.error('Still no results after basic query');
                    return { items: [] };
                }
                
                data.results = basicData.results;
            }

            console.log(`Received ${data.results.length} tracks`);
            
            // Filter out any null tracks (from failed conversions)
            const videos = data.results.map(trackToVideo).filter(video => video !== null);
            
            // If we have results but no headers, estimate hasMore
            const hasMore = data.results.length >= ITEMS_PER_PAGE;
            
            console.log(`Processed ${videos.length} videos, has more: ${hasMore}`);
            
            // If we didn't get any valid videos, return an empty result
            if (videos.length === 0) {
                console.warn('No valid videos found in the response');
                return { items: [] };
            }
            
            return {
                items: [{
                    type: 'videos',
                    title: 'Popular Tracks',
                    items: videos,
                    hasMore: hasMore,
                    nextPage: hasMore ? page + 1 : null
                }]
            };
        } catch (error) {
            console.error('Error in getHome:', {
                error: error.message,
                stack: error.stack,
                context: context
            });
            
            // Return a user-friendly error message with more details
            return {
                items: [{
                    type: 'message',
                    title: 'Error Loading Content',
                    message: `Could not load the home feed. ${error.message || 'Please try again later.'}`
                }]
            };
        }
    }

    // Search for tracks
    async search(query, context) {
        try {
            console.log(`Searching for: "${query}"`);
            const page = context?.page || 1;
            const offset = (page - 1) * ITEMS_PER_PAGE;
            
            // Only request the fields we actually need
            const data = await jamendoRequest('/tracks', {
                search: query,
                offset: offset,
                limit: ITEMS_PER_PAGE,
                include: 'musicinfo',
                fields: 'id,name,duration,artist_id,artist_name,artist_idstr,album_name,album_id,releasedate,album_image,audio,audiodownload,shareurl,musicinfo,likes,downloads,listens',
                audioformat: 'mp32'
            });

            if (!data || !Array.isArray(data.results)) {
                console.error('Invalid search results format:', data);
                return { items: [], hasMore: false };
            }

            console.log(`Found ${data.results.length} tracks for query: "${query}"`);
            
            // Filter out any null tracks (from failed conversions)
            const videos = data.results.map(trackToVideo).filter(video => video !== null);
            const totalResults = data.headers?.results_count || 0;
            const hasMore = totalResults > offset + videos.length;
            
            console.log(`Processed ${videos.length} videos, has more: ${hasMore}, total results: ${totalResults}`);
            
            return {
                items: videos,
                hasMore: hasMore,
                nextPage: hasMore ? page + 1 : null
            };
        } catch (error) {
            console.error('Error in search:', error);
            return {
                items: [],
                hasMore: false,
                error: 'Failed to perform search. Please try again.'
            };
        }
    }

    // Search for artists (channels)
    async searchChannels(query, context) {
        try {
            console.log(`Searching for channels: "${query}"`);
            const page = context?.page || 1;
            const offset = (page - 1) * ITEMS_PER_PAGE;
            
            const data = await jamendoRequest('/artists', {
                name: query,
                offset: offset,
                limit: ITEMS_PER_PAGE,
                fields: 'id,name,image,website,fans',
                hasimage: '1' // Only return artists with images
            });

            if (!data || !Array.isArray(data.results)) {
                console.error('Invalid channel search results format:', data);
                return { items: [], hasMore: false };
            }

            console.log(`Found ${data.results.length} channels for query: "${query}"`);
            
            // Filter out any null channels (from failed conversions)
            const channels = data.results.map(artistToChannel).filter(channel => channel !== null);
            const totalResults = data.headers?.results_count || 0;
            const hasMore = totalResults > offset + channels.length;
            
            console.log(`Processed ${channels.length} channels, has more: ${hasMore}, total results: ${totalResults}`);
            
            return {
                items: channels,
                hasMore: hasMore,
                nextPage: hasMore ? page + 1 : null
            };
        } catch (error) {
            console.error('Error in searchChannels:', error);
            return {
                items: [],
                hasMore: false,
                error: 'Failed to search for channels. Please try again.'
            };
        }
    }

    // Search for playlists (albums)
    async searchPlaylists(query, context) {
        try {
            console.log(`Searching for playlists: "${query}"`);
            const page = context?.page || 1;
            const offset = (page - 1) * ITEMS_PER_PAGE;
            
            const data = await jamendoRequest('/albums', {
                name: query,
                offset: offset,
                limit: ITEMS_PER_PAGE,
                fields: 'id,name,artist_id,artist_name,releasedate,image,tracks_count',
                hasimage: '1', // Only return albums with images
                order: 'releasedate_desc' // Show newest first
            });

            if (!data || !Array.isArray(data.results)) {
                console.error('Invalid playlist search results format:', data);
                return { items: [], hasMore: false };
            }

            console.log(`Found ${data.results.length} playlists for query: "${query}"`);
            
            // Filter out any null playlists (from failed conversions)
            const playlists = data.results.map(albumToPlaylist).filter(playlist => playlist !== null);
            const totalResults = data.headers?.results_count || 0;
            const hasMore = totalResults > offset + playlists.length;
            
            console.log(`Processed ${playlists.length} playlists, has more: ${hasMore}, total results: ${totalResults}`);
            
            return {
                items: playlists,
                hasMore: hasMore,
                nextPage: hasMore ? page + 1 : null
            };
        } catch (error) {
            console.error('Error in searchPlaylists:', error);
            return {
                items: [],
                hasMore: false,
                error: 'Failed to search for playlists. Please try again.'
            };
        }
    }

    // Get channel details and tracks
    async getChannel(channelId, context) {
        try {
            console.log(`Fetching channel details for ID: ${channelId}`);
            const page = context?.page || 1;
            const offset = (page - 1) * ITEMS_PER_PAGE;
            
            // Get artist info with only the fields we need
            const artistData = await jamendoRequest('/artists', {
                id: channelId,
                fields: 'id,name,image,website,fans,joindate,track_count,album_count',
                include: 'stats'
            });
            
            if (!artistData.results || artistData.results.length === 0) {
                console.error(`Artist not found with ID: ${channelId}`);
                throw new ScriptException('Artist not found');
            }
            
            const artist = artistData.results[0];
            console.log(`Found artist: ${artist.name} (${artist.id})`);
            
            // Get artist's tracks with only the fields we need
            const tracksData = await jamendoRequest('/artists/tracks', {
                id: channelId,
                offset: offset,
                limit: ITEMS_PER_PAGE,
                fields: 'id,name,duration,artist_id,artist_name,album_name,album_id,releasedate,album_image,audio,audiodownload,shareurl,likes,downloads,listens',
                order: 'popularity_total',
                audioformat: 'mp32'
            });
            
            if (!tracksData.results) {
                console.warn('No tracks found for artist:', artist.name);
                tracksData.results = [];
            }
            
            const videos = tracksData.results.map(trackToVideo).filter(video => video !== null);
            const totalTracks = tracksData.headers?.results_count || 0;
            const hasMore = totalTracks > offset + videos.length;
            
            console.log(`Found ${videos.length} tracks for artist ${artist.name}, has more: ${hasMore}, total tracks: ${totalTracks}`);
            
            // Format the response according to Grayjay's expected format
            return {
                id: artist.id.toString(),
                name: artist.name,
                description: `Joined ${artist.joindate || 'N/A'} • ${artist.track_count || 0} tracks • ${artist.album_count || 0} albums`,
                thumbnail: artist.image || '',
                subscribers: parseInt(artist.fans || 0),
                videos: {
                    items: videos,
                    hasMore: hasMore,
                    nextPage: hasMore ? page + 1 : null
                },
                links: artist.website ? [{
                    name: 'Website',
                    url: artist.website
                }] : []
            };
        } catch (error) {
            console.error('Error in getChannel:', error);
            throw new ScriptException(`Failed to load channel: ${error.message || 'Unknown error'}`);
        }
    }

    // Get playlist (album) details and tracks
    async getPlaylist(playlistId, context) {
        try {
            console.log(`Fetching playlist/album details for ID: ${playlistId}`);
            const page = context?.page || 1;
            const offset = (page - 1) * ITEMS_PER_PAGE;
            
            // Get album info with only the fields we need
            const albumData = await jamendoRequest('/albums', {
                id: playlistId,
                fields: 'id,name,artist_id,artist_name,releasedate,image,tracks_count,genre,tags,upc,artist_idstr',
                include: 'musicinfo,stats'
            });
            
            if (!albumData.results || albumData.results.length === 0) {
                console.error(`Album not found with ID: ${playlistId}`);
                throw new ScriptException('Album not found');
            }
            
            const album = albumData.results[0];
            console.log(`Found album: ${album.name} by ${album.artist_name} (${album.id})`);
            
            // Get album's tracks with only the fields we need
            const tracksData = await jamendoRequest('/albums/tracks', {
                id: playlistId,
                offset: offset,
                limit: ITEMS_PER_PAGE,
                fields: 'id,name,duration,artist_id,artist_name,album_name,album_id,releasedate,album_image,audio,audiodownload,shareurl,likes,downloads,listens',
                audioformat: 'mp32',
                order: 'track_num'
            });
            
            if (!tracksData.results) {
                console.warn('No tracks found for album:', album.name);
                tracksData.results = [];
            }
            
            const videos = tracksData.results.map(trackToVideo).filter(video => video !== null);
            const totalTracks = album.tracks_count || tracksData.headers?.results_count || 0;
            const hasMore = totalTracks > offset + videos.length;
            
            console.log(`Found ${videos.length} tracks for album ${album.name}, has more: ${hasMore}, total tracks: ${totalTracks}`);
            
            // Build description with album metadata
            let description = '';
            if (album.releasedate) description += `Released: ${album.releasedate}\n`;
            if (album.genre) description += `Genre: ${album.genre}\n`;
            if (album.tags) {
                const tags = Object.entries(album.tags)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([tag]) => `#${tag}`)
                    .join(' ');
                if (tags) description += `Tags: ${tags}\n`;
            }
            description = description.trim();
            
            // Format the response according to Grayjay's expected format
            return {
                id: album.id.toString(),
                name: album.name,
                description: description,
                thumbnail: album.image || '',
                videoCount: parseInt(album.tracks_count || 0),
                author: {
                    id: album.artist_id.toString(),
                    name: album.artist_name,
                    url: `https://www.jamendo.com/artist/${album.artist_idstr || album.artist_id}`,
                    thumbnail: '' // We don't have the artist image here
                },
                videos: {
                    items: videos,
                    hasMore: hasMore,
                    nextPage: hasMore ? page + 1 : null
                },
                // Additional metadata that might be useful
                metadata: {
                    releaseDate: album.releasedate,
                    genre: album.genre,
                    upc: album.upc
                }
            };
        } catch (error) {
            console.error('Error in getPlaylist:', error);
            throw new ScriptException(`Failed to load playlist: ${error.message || 'Unknown error'}`);
        }
    }

    // Get track details for playback
    async getContentDetails(url) {
        try {
            console.log(`Fetching content details for URL: ${url}`);
            
            // Extract track ID from URL
            const trackIdMatch = url.match(/track\/(\d+)/);
            if (!trackIdMatch) {
                throw new ScriptException('Invalid track URL. Expected format: .../track/123');
            }
            
            const trackId = trackIdMatch[1];
            console.log(`Extracted track ID: ${trackId}`);
            
            // Get track details with only the fields we need
            const data = await jamendoRequest('/tracks', {
                id: trackId,
                include: 'musicinfo,stats',
                fields: 'id,name,duration,artist_id,artist_name,artist_idstr,album_name,album_id,releasedate,album_image,artist_image,audio,audiodownload,shareurl,musicinfo,likes,downloads,listens,tags,lyrics',
                audioformat: 'mp32'
            });
            
            if (!data.results || data.results.length === 0) {
                console.error(`Track not found with ID: ${trackId}`);
                throw new ScriptException('Track not found');
            }
            
            const track = data.results[0];
            console.log(`Found track: ${track.name} by ${track.artist_name}`);
            
            // Check if track is a short (<= 60 seconds)
            const isShort = parseInt(track.duration) <= 60;
            
            // Build description with track metadata
            let description = '';
            if (track.musicinfo?.description) {
                description += `${track.musicinfo.description}\n\n`;
            }
            if (track.releasedate) {
                description += `Released: ${track.releasedate}\n`;
            }
            if (track.tags) {
                const tags = Object.entries(track.tags)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([tag]) => `#${tag}`)
                    .join(' ');
                if (tags) description += `Tags: ${tags}\n`;
            }
            if (track.lyrics && track.lyrics.lyrics) {
                description += `\nLyrics available`;
            }
            description = description.trim();
            
            // Format the response according to Grayjay's expected format
            return {
                id: track.id.toString(),
                name: track.name,
                description: description,
                duration: parseInt(track.duration) * 1000, // Convert to milliseconds
                author: {
                    id: track.artist_id.toString(),
                    name: track.artist_name,
                    url: `https://www.jamendo.com/artist/${track.artist_idstr || track.artist_id}`,
                    thumbnail: track.artist_image || ''
                },
                url: track.shareurl || `https://www.jamendo.com/track/${track.id}`,
                thumbnails: [
                    { 
                        url: track.album_image || track.image, 
                        width: 300, 
                        height: 300 
                    }
                ].filter(t => t.url && t.url.startsWith('http')),
                viewCount: parseInt(track.downloads || 0) + parseInt(track.listens || 0),
                isLive: false,
                shareUrl: track.shareurl || `https://www.jamendo.com/track/${track.id}`,
                datetime: track.releasedate ? new Date(track.releasedate).getTime() : Date.now(),
                rating: {
                    likes: parseInt(track.likes || 0),
                    dislikes: 0
                },
                // Include audio stream information for playback
                streams: [
                    {
                        url: track.audio || track.audiodownload,
                        format: 'mp3',
                        quality: 'high',
                        bitrate: 192 // Default bitrate, adjust based on actual quality if available
                    }
                ],
                // Additional metadata
                metadata: {
                    album: track.album_name ? {
                        id: track.album_id?.toString(),
                        name: track.album_name,
                        url: track.album_id ? `https://www.jamendo.com/album/${track.album_id}` : undefined
                    } : undefined,
                    isShort: isShort,
                    hasLyrics: !!(track.lyrics?.lyrics)
                }
            };
        } catch (error) {
            console.error('Error in getContentDetails:', error);
            throw new ScriptException(`Failed to get content details: ${error.message || 'Unknown error'}`);
        }
        
        return {
            audioSources: [{
                url: track.audio,
                format: 'audio/mp3',
                bitrate: 128000, // 128kbps default
                codec: 'mp3',
                duration: parseInt(track.duration)
            }],
            videoSources: []
        };
    }
}

// Source is registered via registerSourceClass(JamendoSource)
