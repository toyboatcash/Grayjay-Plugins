// Pluto TV Grayjay Plugin Script
const PLATFORM = "Pluto TV";
const PLUGIN_ID = "plutotv-uuid";

const URL_BASE = "https://pluto.tv";

const REGEX_DETAILS_URL = /.*/;
const REGEX_CHANNEL_URL = /.*/;

let localState = {};

source.enable = function(config, settings, savedState) {
    localState = savedState ? JSON.parse(savedState) : {};
};

// Helper function to get content type setting
function getContentType() {
    // Default to showing both live and on-demand content since we can't use settings
    return "both";
}

// Helper function to get region setting
function getRegion() {
    // Default to US region since settings aren't supported in Grayjay
    return "us";
}

// Helper function to get authentication token
function getAuthToken() {
    try {
        return source.getAuthToken();
    } catch (e) {
        return null;
    }
}

// Helper function to make authenticated requests
function makeRequest(url, headers = {}) {
    const authToken = getAuthToken();
    if (authToken) {
        headers["authorization"] = `Bearer ${authToken}`;
    }
    return http.GET(url, headers);
}

source.saveState = function() {
    return JSON.stringify(localState);
};

source.getHome = function() {
    const contentType = getContentType();
    let videos = [];

    // Add live TV channels if setting allows
    if (contentType === "live" || contentType === "both") {
        let result = http.GET("https://api.pluto.tv/v2/channels.json", {});
        if (result.isOk) {
            let channels = JSON.parse(result.body);
            for (let channel of channels) {
                let url = `https://pluto.tv/${getRegion()}/live-tv/${channel.slug}`;
                videos.push(new PlatformVideo({
                    id: new PlatformID(PLATFORM, url, PLUGIN_ID),
                    name: channel.name,
                    thumbnails: new Thumbnails(channel.thumbnail?.path ? [{url: channel.thumbnail.path, quality: 0}] : []),
                    author: new PlatformAuthorLink(
                        new PlatformID(PLATFORM, '', PLUGIN_ID),
                        'Pluto TV',
                        '',
                        ''
                    ),
                    datetime: Math.floor(Date.now() / 1000),
                    url: url,
                    duration: 0,
                    viewCount: 0,
                    isLive: true,
                    description: channel.summary,
                    video: new VideoSourceDescriptor([]),
                    rating: null,
                    subtitles: []
                }));
                if (videos.length >= 50) break;
            }
        }
    }

    // Add on-demand content if setting allows and auth is available
    if ((contentType === "ondemand" || contentType === "both") && getAuthToken()) {
        try {
            // Try to get popular on-demand content
            const region = getRegion();
            let onDemandUrl = `https://pluto.tv/${region}/on-demand`;
            let result = http.GET(onDemandUrl, {});
            if (result.isOk) {
                const dom = DOMParser.parseFromString(result.body);
                const videoElements = dom.querySelectorAll('a[href*="/on-demand/"]');
                
                for (let el of videoElements) {
                    let href = el.getAttribute('href');
                    if (href && (href.includes('/movies/') || href.includes('/series/'))) {
                        let videoUrl = href.startsWith('http') ? href : `https://pluto.tv${href}`;
                        let title = el.querySelector('h3, .title, .video-title')?.textContent.trim() ||
                                   el.querySelector('img')?.alt || el.textContent.trim();
                        let thumbnail = el.querySelector('img')?.src || '';

                        if (title && videoUrl && !videos.find(v => v.url === videoUrl)) {
                            videos.push(new PlatformVideo({
                                id: new PlatformID(PLATFORM, videoUrl, PLUGIN_ID),
                                name: title,
                                thumbnails: new Thumbnails(thumbnail ? [{url: thumbnail, quality: 0}] : []),
                                author: new PlatformAuthorLink(
                                    new PlatformID(PLATFORM, '', PLUGIN_ID),
                                    'Pluto TV',
                                    '',
                                    ''
                                ),
                                datetime: 0,
                                url: videoUrl,
                                duration: 0,
                                viewCount: 0,
                                isLive: false,
                                description: '',
                                video: new VideoSourceDescriptor([]),
                                rating: null,
                                subtitles: []
                            }));
                        }
                        if (videos.length >= 100) break;
                    }
                }
            }
        } catch (e) {
            // On-demand content failed, continue with live content only
        }
    }

    return new VideoPager(videos, false, {});
};

source.searchSuggestions = function(query) {
    return [];
};

source.getSearchCapabilities = function() {
    return {
        types: [Type.Feed.Mixed],
        sorts: [Type.Order.Chronological],
        filters: []
    };
};

source.search = function(query, type, order, filters) {
    const contentType = getContentType();
    let videos = [];

    // Search live TV channels if setting allows
    if (contentType === "live" || contentType === "both") {
        let result = http.GET("https://api.pluto.tv/v2/channels.json", {});
        if (result.isOk) {
            let channels = JSON.parse(result.body);
            for (let channel of channels) {
                if (channel.name.toLowerCase().includes(query.toLowerCase()) || channel.summary.toLowerCase().includes(query.toLowerCase())) {
                    let url = `https://pluto.tv/${getRegion()}/live-tv/${channel.slug}`;
                    videos.push(new PlatformVideo({
                        id: new PlatformID(PLATFORM, url, PLUGIN_ID),
                        name: channel.name,
                        thumbnails: new Thumbnails(channel.thumbnail?.path ? [{url: channel.thumbnail.path, quality: 0}] : []),
                        author: new PlatformAuthorLink(
                            new PlatformID(PLATFORM, '', PLUGIN_ID),
                            'Pluto TV',
                            '',
                            ''
                        ),
                        datetime: Math.floor(Date.now() / 1000),
                        url: url,
                        duration: 0,
                        viewCount: 0,
                        isLive: true,
                        description: channel.summary,
                        video: new VideoSourceDescriptor([]),
                        rating: null,
                        subtitles: []
                    }));
                    if (videos.length >= 50) break;
                }
            }
        }
    }

    // Search on-demand content if setting allows and auth is available
    if ((contentType === "ondemand" || contentType === "both") && getAuthToken()) {
        try {
            const region = getRegion();
            let searchUrl = `https://pluto.tv/${region}/search?q=${encodeURIComponent(query)}`;
            let result = http.GET(searchUrl, {});
            if (result.isOk) {
                const dom = DOMParser.parseFromString(result.body);
                const videoElements = dom.querySelectorAll('a[href*="/on-demand/"]');
                
                for (let el of videoElements) {
                    let href = el.getAttribute('href');
                    if (href && (href.includes('/movies/') || href.includes('/series/'))) {
                        let videoUrl = href.startsWith('http') ? href : `https://pluto.tv${href}`;
                        let title = el.querySelector('h3, .title, .video-title')?.textContent.trim() ||
                                   el.querySelector('img')?.alt || el.textContent.trim();
                        let thumbnail = el.querySelector('img')?.src || '';

                        if (title && videoUrl && !videos.find(v => v.url === videoUrl)) {
                            videos.push(new PlatformVideo({
                                id: new PlatformID(PLATFORM, videoUrl, PLUGIN_ID),
                                name: title,
                                thumbnails: new Thumbnails(thumbnail ? [{url: thumbnail, quality: 0}] : []),
                                author: new PlatformAuthorLink(
                                    new PlatformID(PLATFORM, '', PLUGIN_ID),
                                    'Pluto TV',
                                    '',
                                    ''
                                ),
                                datetime: 0,
                                url: videoUrl,
                                duration: 0,
                                viewCount: 0,
                                isLive: false,
                                description: '',
                                video: new VideoSourceDescriptor([]),
                                rating: null,
                                subtitles: []
                            }));
                        }
                        if (videos.length >= 100) break;
                    }
                }
            }
        } catch (e) {
            // On-demand search failed, continue with live results only
        }
    }

    return new VideoPager(videos, false, {});
};

source.getSearchChannelContentsCapabilities = function() {
    return {
        types: [Type.Feed.Mixed],
        sorts: [Type.Order.Chronological],
        filters: []
    };
};

source.searchChannelContents = function(channelUrl, query, type, order, filters) {
    return new VideoPager([], false, {});
};

source.searchChannels = function(query) {
    return new ChannelPager([], false, {});
};

source.isChannelUrl = function(url) {
    return REGEX_CHANNEL_URL.test(url);
};

source.getChannel = function(url) {
    return new PlatformChannel({
        id: new PlatformID(PLATFORM, url, PLUGIN_ID),
        name: "Unknown Channel",
        thumbnail: "",
        banner: "",
        subscribers: 0,
        description: "",
        url: url,
        links: {}
    });
};

source.getChannelCapabilities = function() {
    return {
        types: [Type.Feed.Videos],
        sorts: []
    };
};

source.getChannelContents = function(url, type, order, filters) {
    return new VideoPager([], false, {});
};

source.isContentDetailsUrl = function(url) {
    return REGEX_DETAILS_URL.test(url);
};

source.getContentDetails = function(url) {
    // Handle live TV channels
    if (url.includes('/live-tv/')) {
        // Handle URL redirects - try to extract channel ID from various URL formats
        let channelId = null;

        // Check for direct channel ID in URL (e.g., /us/live-tv/51c75f7bb6f26ba1cd00002f)
        let channelMatch = url.match(/\/live-tv\/([a-f0-9]{24})/);
        if (channelMatch) {
            channelId = channelMatch[1];
        } else {
            // Try to find channel by slug from original API
            let slugMatch = url.match(/\/live-tv\/([^/?]+)/);
            if (slugMatch) {
                let slug = slugMatch[1];
                let result = http.GET("https://api.pluto.tv/v2/channels.json", {});
                if (result.isOk) {
                    let channels = JSON.parse(result.body);
                    let channel = channels.find(c => c.slug === slug);
                    if (channel) {
                        channelId = channel._id;
                    }
                }
            }
        }

        if (channelId) {
            // Get channel details and construct stream URL
            let result = http.GET("https://api.pluto.tv/v2/channels.json", {});
            if (result.isOk) {
                let channels = JSON.parse(result.body);
                let channel = channels.find(c => c._id === channelId || c.id === channelId);
                if (channel) {
                    let videoSources = [];
                    // Use the stitching service URL format provided by user
                    let streamUrl = `https://cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv/v2/stitch/hls/channel/${channelId}/master.m3u8?advertisingId=&appName=web&appVersion=9.18.0&clientDeviceType=0&deviceDNT=false&deviceMake=web&deviceType=web&serverSideAds=false`;

                    videoSources.push(new VideoUrlSource({
                        url: streamUrl,
                        width: 1920,
                        height: 1080,
                        container: "application/x-mpegURL",
                        codec: "h264",
                        name: "Live Stream",
                        bitrate: 0
                    }));

                    return new PlatformVideoDetails({
                        id: new PlatformID(PLATFORM, url, PLUGIN_ID),
                        name: channel.name,
                        thumbnails: new Thumbnails(channel.thumbnail?.path ? [{url: channel.thumbnail.path, quality: 0}] : []),
                        author: new PlatformAuthorLink(
                            new PlatformID(PLATFORM, '', PLUGIN_ID),
                            'Pluto TV',
                            '',
                            ''
                        ),
                        datetime: Math.floor(Date.now() / 1000),
                        url: url,
                        duration: 0,
                        viewCount: 0,
                        isLive: true,
                        description: channel.summary || channel.description || '',
                        video: new VideoSourceDescriptor(videoSources),
                        rating: new RatingLikes({likes: 0}),
                        subtitles: []
                    });
                }
            }
        }
    }
    // Handle on-demand content
    else if (url.includes('/on-demand/')) {
        const authToken = getAuthToken();
        if (!authToken) {
            // Return empty video details if no auth token for on-demand
            return new PlatformVideoDetails({
                id: new PlatformID(PLATFORM, url, PLUGIN_ID),
                name: "Authentication Required",
                thumbnails: new Thumbnails([]),
                author: new PlatformAuthorLink(
                    new PlatformID(PLATFORM, "", PLUGIN_ID),
                    "Pluto TV",
                    "",
                    ""
                ),
                datetime: 0,
                url: url,
                duration: 0,
                viewCount: 0,
                isLive: false,
                description: "Please provide a Pluto TV Bearer token in settings to access on-demand content.",
                video: new VideoSourceDescriptor([]),
                rating: new RatingLikes({likes: 0}),
                subtitles: []
            });
        }

        try {
            // Extract slug from URL (e.g., /movies/la-confidential-1997-1-1 or /series/king-of-queens)
            let slugMatch = url.match(/\/on-demand\/(?:movies|series)\/([^/?]+)/);
            if (slugMatch) {
                let slug = slugMatch[1];
                
                // Try to get video details from the /v4/vod/items API
                let itemsUrl = `https://service-vod.clusters.pluto.tv/v4/vod/items?ids=${encodeURIComponent(slug)}`;
                let result = makeRequest(itemsUrl);
                
                if (result.isOk) {
                    let itemData = JSON.parse(result.body);
                    if (itemData && itemData.length > 0) {
                        let item = itemData[0];
                        
                        // Get stream URL using the /v4/start endpoint
                        let startUrl = `https://boot.pluto.tv/v4/start?appName=web&appVersion=9&clientID=9&clientModelNumber=9&drmCapabilities=widevine:L3&episodeSlugs=${encodeURIComponent(slug)}`;
                        let startResult = makeRequest(startUrl);
                        
                        let videoSources = [];
                        if (startResult.isOk) {
                            let startData = JSON.parse(startResult.body);
                            if (startData && startData.sources) {
                                for (let source of startData.sources) {
                                    if (source.type === "hls" || source.type === "dash") {
                                        videoSources.push(new VideoUrlSource({
                                            url: source.url,
                                            width: 1920,
                                            height: 1080,
                                            container: source.type === "hls" ? "application/x-mpegURL" : "application/dash+xml",
                                            codec: "h264",
                                            name: source.type.toUpperCase(),
                                            bitrate: 0
                                        }));
                                    }
                                }
                            }
                        }
                        
                        return new PlatformVideoDetails({
                            id: new PlatformID(PLATFORM, url, PLUGIN_ID),
                            name: item.name || item.title,
                            thumbnails: new Thumbnails(item.thumbnail ? [{url: item.thumbnail, quality: 0}] : []),
                            author: new PlatformAuthorLink(
                                new PlatformID(PLATFORM, '', PLUGIN_ID),
                                'Pluto TV',
                                '',
                                ''
                            ),
                            datetime: item.created ? new Date(item.created).getTime() / 1000 : 0,
                            url: url,
                            duration: item.duration || 0,
                            viewCount: 0,
                            isLive: false,
                            description: item.description || item.summary || '',
                            video: new VideoSourceDescriptor(videoSources),
                            rating: new RatingLikes({likes: 0}),
                            subtitles: []
                        });
                    }
                }
                
                // Fallback: try to scrape from the webpage
                let pageResult = http.GET(url, {});
                if (pageResult.isOk) {
                    const dom = DOMParser.parseFromString(pageResult.body);
                    let title = dom.querySelector('h1, .title')?.textContent.trim() || 'Unknown Title';
                    let description = dom.querySelector('.description, .summary')?.textContent.trim() || '';
                    let thumbnail = dom.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
                    
                    return new PlatformVideoDetails({
                        id: new PlatformID(PLATFORM, url, PLUGIN_ID),
                        name: title,
                        thumbnails: new Thumbnails(thumbnail ? [{url: thumbnail, quality: 0}] : []),
                        author: new PlatformAuthorLink(
                            new PlatformID(PLATFORM, '', PLUGIN_ID),
                            'Pluto TV',
                            '',
                            ''
                        ),
                        datetime: 0,
                        url: url,
                        duration: 0,
                        viewCount: 0,
                        isLive: false,
                        description: description,
                        video: new VideoSourceDescriptor([]), // Stream URLs may be loaded later
                        rating: new RatingLikes({likes: 0}),
                        subtitles: []
                    });
                }
            }
        } catch (e) {
            // On-demand parsing failed
        }
    }

    // Fallback for unknown URLs
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, url, PLUGIN_ID),
        name: "Unknown Content",
        thumbnails: new Thumbnails([]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, "", PLUGIN_ID),
            "Pluto TV",
            "",
            ""
        ),
        datetime: 0,
        url: url,
        duration: 0,
        viewCount: 0,
        isLive: false,
        description: "",
        video: new VideoSourceDescriptor([]),
        rating: new RatingLikes({likes: 0}),
        subtitles: []
    });
};

source.getComments = function(url) {
    return new CommentPager([], false, {});
};

source.getSubComments = function(comment) {
    return new CommentPager([], false, {});
};

source.getLiveStreams = function() {
    const contentType = getContentType();
    
    // Only return live streams if setting allows
    if (contentType === "ondemand") {
        return new VideoPager([], false, {});
    }
    
    let result = http.GET("https://api.pluto.tv/v2/channels.json", {});
    if (result.isOk) {
        let channels = JSON.parse(result.body);
        let videos = [];
        for (let channel of channels) {
            let url = `https://pluto.tv/${getRegion()}/live-tv/${channel.slug}`;
            videos.push(new PlatformVideo({
                id: new PlatformID(PLATFORM, url, PLUGIN_ID),
                name: channel.name,
                thumbnails: new Thumbnails(channel.thumbnail?.path ? [{url: channel.thumbnail.path, quality: 0}] : []),
                author: new PlatformAuthorLink(
                    new PlatformID(PLATFORM, '', PLUGIN_ID),
                    'Pluto TV',
                    '',
                    ''
                ),
                datetime: Math.floor(Date.now() / 1000),
                url: url,
                duration: 0,
                viewCount: 0,
                isLive: true,
                description: channel.summary,
                video: new VideoSourceDescriptor([]),
                rating: null,
                subtitles: []
            }));
            if (videos.length >= 50) break;
        }
        return new VideoPager(videos, false, {});
    } else {
        return new VideoPager([], false, {});
    }
};
