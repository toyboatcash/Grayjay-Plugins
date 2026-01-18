// Archive.org Grayjay Plugin Script
const PLATFORM = "Archive.org";
const PLUGIN_ID = "archiveorg-uuid";

const URL_BASE = "https://archive.org";

const REGEX_DETAILS_URL = /.*/;
const REGEX_CHANNEL_URL = /.*/;

let localState = {};

source.enable = function(config, settings, savedState) {
    localState = savedState ? JSON.parse(savedState) : {};
};

source.saveState = function() {
    return JSON.stringify(localState);
};

source.getHome = function() {
    const query = "mediatype:(movies)&sort[]=-week&rows=20&output=json";
    const response = http.GET("https://archive.org/advancedsearch.php?" + query, {});

    if (!response.isOk) {
        return new VideoPager([], false, {});
    }

    const data = JSON.parse(response.body);
    const docs = data.response?.docs || [];
    const videos = docs.map(doc => docToVideo(doc));

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
    query = query?.trim();
    if(!query || query.length === 0) {
        return new VideoPager([], false);
    }

    const q = encodeURIComponent(query) + " mediatype:(movies OR video)";
    const searchQuery = "q=" + q + "&sort[]=downloads desc&rows=20&output=json";
    const response = http.GET("https://archive.org/advancedsearch.php?" + searchQuery, {});

    if (!response.isOk) {
        return new VideoPager([], false);
    }

    const data = JSON.parse(response.body);
    const docs = data.response?.docs || [];
    const videos = docs.map(doc => docToVideo(doc));

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
    const identifier = url.split('/').pop();
    if (!identifier) {
        throw new Error('Invalid Archive.org URL: missing identifier');
    }
    
    const response = http.GET("https://archive.org/metadata/" + identifier, {});

    if (!response.isOk) {
        throw new Error('Failed to fetch metadata from Archive.org');
    }

    const metadata = JSON.parse(response.body);
    const files = metadata.files || [];
    
    // Look for video files with various formats
    const videoFormats = ["MPEG4", "MP4", "H.264", "h.264", "Ogg Video", "WebM", "Matroska", "AVI", "MPEG2", "MPEG1"];
    const videoExtensions = [".mp4", ".webm", ".ogv", ".avi", ".mkv", ".mpeg", ".mpg", ".m4v"];
    
    const videoFiles = files.filter(f => {
        if (videoFormats.some(format => f.format && f.format.includes(format))) return true;
        if (f.name && videoExtensions.some(ext => f.name.toLowerCase().endsWith(ext))) return true;
        return false;
    });
    
    if (videoFiles.length === 0) {
        throw new Error('No video file found in Archive.org item. This item may be audio-only or a different media type.');
    }

    // Sort video files by preference: MP4/h.264 first, then MPEG4, then others
    videoFiles.sort((a, b) => {
        const getPriority = (f) => {
            const format = f.format || '';
            if (format.includes('h.264') || format.includes('MP4')) return 1;
            if (format.includes('MPEG4')) return 2;
            return 3;
        };
        return getPriority(a) - getPriority(b);
    });

    const videoSources = videoFiles.map(f => {
        const videoUrl = "https://" + metadata.d1 + metadata.dir + "/" + f.name;
        const width = parseInt(f.width) || 1920;
        const height = parseInt(f.height) || 1080;
        const container = f.name.toLowerCase().endsWith('.mp4') || f.name.toLowerCase().endsWith('.m4v') ? 'mp4' : 
                         f.name.toLowerCase().endsWith('.webm') ? 'webm' : 
                         f.name.toLowerCase().endsWith('.ogv') ? 'ogg' : 'mp4';
        const codec = container === 'mp4' ? 'h264' : 'vp8';
        const name = f.format || f.name.split('.').pop().toUpperCase();

        return new VideoUrlSource({
            url: videoUrl,
            width: width,
            height: height,
            container: container,
            codec: codec,
            name: name,
            bitrate: 0
        });
    });

    const videoSource = new VideoSourceDescriptor(videoSources);

    const doc = {
        identifier: identifier,
        title: metadata.metadata.title,
        thumb: metadata.metadata.thumb,
        creator: metadata.metadata.creator,
        description: metadata.metadata.description,
        downloads: metadata.item ? metadata.item.downloads : 0
    };
    const video = docToVideo(doc, metadata);
    video.video = videoSource;
    return video;
};

source.getComments = function(url) {
    return new CommentPager([], false, {});
};

source.getSubComments = function(comment) {
    return new CommentPager([], false, {});
};

function docToVideo(doc, metadata) {
    const thumbUrl = "https://" + metadata.d1 + metadata.dir + "/__ia_thumb.jpg";
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, doc.identifier, PLUGIN_ID),
        name: doc.title,
        thumbnails: new Thumbnails([new Thumbnail(thumbUrl, 0)]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, doc.creator || "", PLUGIN_ID),
            doc.creator || "Archive.org",
            "",
            ""
        ),
        datetime: 0,
        url: "https://archive.org/details/" + doc.identifier,
        duration: 0,
        viewCount: parseInt(doc.downloads) || 0,
        isLive: false,
        description: doc.description || "",
        video: new VideoSourceDescriptor([]),
    });
}

source.getChannelContents = function(url, type, order, filters) {
    try {
        const response = http.GET(url, {});
        if (!response.isOk) {
            return new VideoPager([], false, {});
        }

        const dom = DOMParser.parseFromString(response.body);
        const videoElements = dom.querySelectorAll('a[href*="/details/"], .video-item, .item, .card');

        let videos = [];
        for (let el of videoElements) {
            let href = el.getAttribute('href');
            if (href && href.includes('/details/')) {
                let videoUrl = href.startsWith('http') ? href : 'https://archive.org' + href;
                let title = el.querySelector('h3, .title, .item-title')?.textContent.trim() ||
                           el.querySelector('img')?.alt || el.textContent.trim();
                let thumbnail = el.querySelector('img')?.src || '';

                if (title && videoUrl) {
                    videos.push(new PlatformVideo({
                        id: new PlatformID(PLATFORM, videoUrl, PLUGIN_ID),
                        name: title,
                        thumbnails: new Thumbnails(thumbnail ? [new Thumbnail(thumbnail, 0)] : []),
                        author: new PlatformAuthorLink(
                            new PlatformID(PLATFORM, '', PLUGIN_ID),
                            'Internet Archive',
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
            }
        }

        return new VideoPager(videos, false, {});
    } catch (e) {
        return new VideoPager([], false, {});
    }
};

source.getChannelCapabilities = function() {
    return {
        types: [Type.Feed.Videos],
        sorts: [Type.Order.Chronological]
    };
};
