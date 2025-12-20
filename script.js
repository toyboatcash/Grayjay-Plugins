const PLATFORM_ID = "Suno";

class SunoSource {
  constructor() {
  }

  enable(settings) {
    this.settings = settings;
    return true;
  }

  disable() {
    return true;
  }

  isEnabled() {
    return true;
  }

  getHome() {
    const results = [];
    
    try {
      const popularResponse = http.GET("https://studio-api.prod.suno.com/api/search/?q=&type=song&limit=30", {});
      const popularData = JSON.parse(popularResponse.body);
      
      if (popularData.clips && Array.isArray(popularData.clips)) {
        for (const clip of popularData.clips) {
          results.push(this._clipToVideo(clip));
        }
      }
    } catch (e) {
      log("Error fetching popular songs: " + e);
      // Return mock data for testing if API is unavailable
      results.push(new PlatformVideo({
        id: new PlatformID(PLATFORM_ID, "mock-home-1"),
        title: "Welcome to Suno",
        description: "AI-generated music platform. Search for songs, creators, and playlists.",
        duration: 30,
        author: new PlatformAuthorLink(new PlatformAuthor({
          name: "Suno",
          id: "suno",
          thumbnail: null,
          url: "https://suno.com"
        })),
        uploadDate: Date.now(),
        thumbnail: "https://via.placeholder.com/360x360?text=Suno",
        rating: null,
        viewCount: 0,
        url: "https://suno.com",
        isLive: false,
        isShort: false
      }));
    }

    return results;
  }

  search(query, type, order, filters) {
    const results = [];
    
    try {
      let searchUrl = "https://studio-api.prod.suno.com/api/search/?q=" + encodeURIComponent(query) + "&limit=30";
      
      if (type === "music" || type === "video") {
        searchUrl += "&type=song";
      } else if (type === "channel") {
        searchUrl += "&type=user";
      } else if (type === "playlist") {
        searchUrl += "&type=playlist";
      }

      const response = http.GET(searchUrl, {});
      const data = JSON.parse(response.body);

      if (data.clips && Array.isArray(data.clips)) {
        for (const clip of data.clips) {
          results.push(this._clipToVideo(clip));
        }
      }

      if (data.users && Array.isArray(data.users) && (type === "channel" || !type)) {
        for (const user of data.users) {
          results.push(this._userToChannel(user));
        }
      }

      if (data.playlists && Array.isArray(data.playlists) && (type === "playlist" || !type)) {
        for (const playlist of data.playlists) {
          results.push(this._playlistToPlaylist(playlist));
        }
      }
    } catch (e) {
      log("Error searching: " + e);
      // Return mock data for testing if API is unavailable
      if (!type || type === "music" || type === "video") {
        results.push(new PlatformVideo({
          id: new PlatformID(PLATFORM_ID, "mock-song-1"),
          title: "Sample: " + query,
          description: "This is a sample song matching your search for '" + query + "'",
          duration: 30,
          author: new PlatformAuthorLink(new PlatformAuthor({
            name: "Suno Creator",
            id: "sample-creator",
            thumbnail: null,
            url: "https://suno.com/@sample"
          })),
          uploadDate: Date.now(),
          thumbnail: "https://via.placeholder.com/360x360?text=Suno+Song",
          rating: null,
          viewCount: 0,
          url: "https://suno.com/song/mock-song-1",
          isLive: false,
          isShort: false
        }));
      }
    }

    return results;
  }

  getSearchCapabilities() {
    return {
      types: ["music", "channel", "playlist"],
      sorts: [],
      filters: []
    };
  }

  searchSuggestions(query) {
    return [];
  }

  getPlaylist(id) {
    try {
      const response = http.GET("https://studio-api.prod.suno.com/api/playlists/" + id + "/", {});
      const data = JSON.parse(response.body);

      const videos = [];
      if (data.clips && Array.isArray(data.clips)) {
        for (const clip of data.clips) {
          videos.push(this._clipToVideo(clip));
        }
      }

      return new PlatformPlaylist({
        id: data.id,
        name: data.name,
        description: data.description || "",
        author: new PlatformAuthorLink(new PlatformAuthor({
          name: data.user?.display_name || "Unknown",
          id: data.user?.id || "",
          thumbnail: data.user?.avatar_url || null,
          url: "https://suno.com/@" + (data.user?.handle || data.user?.id)
        })),
        thumbnail: data.image_url || null,
        videoCount: videos.length,
        videos: videos
      });
    } catch (e) {
      log("Error getting playlist: " + e);
      // Return empty playlist on error
      return new PlatformPlaylist({
        id: id,
        name: "Playlist",
        description: "Unable to load playlist",
        author: new PlatformAuthorLink(new PlatformAuthor({
          name: "Unknown",
          id: "",
          thumbnail: null,
          url: null
        })),
        thumbnail: null,
        videoCount: 0,
        videos: []
      });
    }
  }

  getChannel(id) {
    try {
      const response = http.GET("https://studio-api.prod.suno.com/api/profiles/" + id + "/recent_clips", {});
      const data = JSON.parse(response.body);

      const videos = [];
      if (Array.isArray(data)) {
        for (const clip of data) {
          videos.push(this._clipToVideo(clip));
        }
      }

      return new PlatformChannel({
        id: id,
        name: id,
        description: "",
        thumbnail: null,
        banner: null,
        subscribers: -1,
        isVerified: false,
        videos: videos
      });
    } catch (e) {
      log("Error getting channel: " + e);
      // Return empty channel on error
      return new PlatformChannel({
        id: id,
        name: id,
        description: "Unable to load creator profile",
        thumbnail: null,
        banner: null,
        subscribers: -1,
        isVerified: false,
        videos: []
      });
    }
  }

  getChannelContents(id, type) {
    return new PlatformPlaylist({
      id: id,
      name: id,
      description: "",
      author: new PlatformAuthorLink(new PlatformAuthor({
        name: id,
        id: id,
        thumbnail: null,
        url: "https://suno.com/@" + id
      })),
      thumbnail: null,
      videoCount: 0,
      videos: []
    });
  }

  getVideo(id) {
    try {
      const response = http.GET("https://studio-api.prod.suno.com/api/clips/" + id + "/", {});
      const data = JSON.parse(response.body);
      return this._clipToVideo(data);
    } catch (e) {
      log("Error getting video: " + e);
      // Return mock video on error
      return new PlatformVideo({
        id: new PlatformID(PLATFORM_ID, id),
        title: "Song",
        description: "Unable to load song details",
        duration: 0,
        author: new PlatformAuthorLink(new PlatformAuthor({
          name: "Unknown",
          id: "",
          thumbnail: null,
          url: null
        })),
        uploadDate: 0,
        thumbnail: null,
        rating: null,
        viewCount: 0,
        url: "https://suno.com/song/" + id,
        isLive: false,
        isShort: false
      });
    }
  }

  getVideos(ids) {
    const results = [];
    for (const id of ids) {
      try {
        results.push(this.getVideo(id));
      } catch (e) {
        log("Error getting video " + id + ": " + e);
      }
    }
    return results;
  }

  getComments(id) {
    return new PlatformCommentPager([], null);
  }

  getSubtitles(id) {
    return [];
  }

  getPlaylistPager(id) {
    return new PlatformPlaylistPager(this, id);
  }

  getChannelPager(id) {
    return new PlatformChannelPager(this, id);
  }

  getChannelContentsTypePager(id, type) {
    return new PlatformChannelContentsTypePager(this, id, type);
  }

  getSearchPager(query, type, order, filters) {
    return new PlatformSearchPager(this, query, type, order, filters);
  }

  getSearchSuggestionsPager(query) {
    return new PlatformSearchSuggestionsPager(this, query);
  }

  getHomePager() {
    return new PlatformHomePager(this);
  }

  _clipToVideo(clip) {
    const imageUrl = clip.image_url || (clip.id ? "https://cdn2.suno.ai/image_" + clip.id + ".jpeg?width=360" : null);
    
    return new PlatformVideo({
      id: new PlatformID(PLATFORM_ID, clip.id),
      title: clip.title || "Untitled",
      description: clip.metadata?.prompt || clip.gpt_description_prompt || "",
      duration: clip.duration || 0,
      author: new PlatformAuthorLink(new PlatformAuthor({
        name: clip.user?.display_name || "Unknown",
        id: clip.user?.id || clip.user?.handle || "",
        thumbnail: clip.user?.avatar_url || null,
        url: clip.user?.handle ? "https://suno.com/@" + clip.user.handle : null
      })),
      uploadDate: clip.created_at ? new Date(clip.created_at).getTime() : 0,
      thumbnail: imageUrl,
      rating: null,
      viewCount: clip.play_count || 0,
      url: "https://suno.com/song/" + clip.id,
      isLive: false,
      isShort: false
    });
  }

  _userToChannel(user) {
    return new PlatformChannel({
      id: user.id,
      name: user.display_name || user.handle || "Unknown",
      description: user.bio || "",
      thumbnail: user.avatar_url || null,
      banner: null,
      subscribers: -1,
      isVerified: false,
      videos: []
    });
  }

  _playlistToPlaylist(playlist) {
    return new PlatformPlaylist({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description || "",
      author: new PlatformAuthorLink(new PlatformAuthor({
        name: playlist.user?.display_name || "Unknown",
        id: playlist.user?.id || "",
        thumbnail: playlist.user?.avatar_url || null,
        url: playlist.user?.handle ? "https://suno.com/@" + playlist.user.handle : null
      })),
      thumbnail: playlist.image_url || null,
      videoCount: playlist.clip_count || 0,
      videos: []
    });
  }
}

class PlatformSearchPager {
  constructor(source, query, type, order, filters) {
    this.source = source;
    this.query = query;
    this.type = type;
    this.order = order;
    this.filters = filters;
    this.offset = 0;
  }

  hasMore() {
    return true;
  }

  nextPage() {
    const results = this.source.search(this.query, this.type, this.order, this.filters);
    this.offset += 30;
    return results;
  }

  getResults() {
    return this.source.search(this.query, this.type, this.order, this.filters);
  }
}

class PlatformPlaylistPager {
  constructor(source, id) {
    this.source = source;
    this.id = id;
    this.offset = 0;
  }

  hasMore() {
    return false;
  }

  nextPage() {
    return [];
  }

  getResults() {
    try {
      const playlist = this.source.getPlaylist(this.id);
      return playlist.videos || [];
    } catch (e) {
      return [];
    }
  }
}

class PlatformChannelPager {
  constructor(source, id) {
    this.source = source;
    this.id = id;
  }

  hasMore() {
    return false;
  }

  nextPage() {
    return [];
  }

  getResults() {
    try {
      const channel = this.source.getChannel(this.id);
      return channel.videos || [];
    } catch (e) {
      return [];
    }
  }
}

class PlatformChannelContentsTypePager {
  constructor(source, id, type) {
    this.source = source;
    this.id = id;
    this.type = type;
  }

  hasMore() {
    return false;
  }

  nextPage() {
    return [];
  }

  getResults() {
    return [];
  }
}

class PlatformSearchSuggestionsPager {
  constructor(source, query) {
    this.source = source;
    this.query = query;
  }

  hasMore() {
    return false;
  }

  nextPage() {
    return [];
  }

  getResults() {
    return [];
  }
}

class PlatformHomePager {
  constructor(source) {
    this.source = source;
  }

  hasMore() {
    return false;
  }

  nextPage() {
    return [];
  }

  getResults() {
    return this.source.getHome();
  }
}

const source = new SunoSource();
