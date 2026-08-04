// Bush Hills Church of Christ - Live stream status + recent videos (Cloudflare Worker)
//
// Two jobs, both scoped to the church's own YouTube channel:
//   1. Is the channel live right now, and if so what's the video ID?
//   2. What are the 3 most recent uploads (for a "recent videos" section)?
// Both results are cached together for 5 minutes.
//
// Requires one environment variable, set in the Cloudflare dashboard
// (Settings -> Variables -> add as "Secret", not plain text):
//   YOUTUBE_API_KEY = <your YouTube Data API v3 key>
//
// When the church channel is NOT live, isLive/videoId come back false/null
// and the Footer Code script leaves the existing Video block untouched -
// so the fallback shown between services is just whatever static video is
// set there in Durable (e.g. a welcome video or a recent sermon).

const CHANNEL_ID = 'UCk5g_eEcpDzTRHcmoM1UFcA'; // Bush Hills Church of Christ
// YouTube convention: a channel's "uploads" playlist ID is always the
// channel ID with the UC prefix swapped for UU. Avoids an extra API call.
const UPLOADS_PLAYLIST_ID = 'UU' + CHANNEL_ID.slice(2);
const ALLOWED_ORIGIN = 'https://bushhillschurch.com';
const CACHE_SECONDS = 300; // 5 minutes

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const cache = caches.default;
    const cacheKey = new Request('https://bhcoc-live-check.internal/status');

    const cached = await cache.match(cacheKey);
    if (cached) {
      const cachedBody = await cached.text();
      return new Response(cachedBody, { headers: corsHeaders });
    }

    let result = { isLive: false, videoId: null, recentVideos: [] };

    try {
      const liveURL =
        'https://www.googleapis.com/youtube/v3/search' +
        '?part=snippet&type=video&eventType=live' +
        '&channelId=' + CHANNEL_ID +
        '&key=' + env.YOUTUBE_API_KEY;

      const recentURL =
        'https://www.googleapis.com/youtube/v3/playlistItems' +
        '?part=snippet&maxResults=3' +
        '&playlistId=' + UPLOADS_PLAYLIST_ID +
        '&key=' + env.YOUTUBE_API_KEY;

      const [liveResponse, recentResponse] = await Promise.all([
        fetch(liveURL),
        fetch(recentURL),
      ]);
      const liveData = await liveResponse.json();
      const recentData = await recentResponse.json();

      if (liveData.items && liveData.items.length > 0 && liveData.items[0].id && liveData.items[0].id.videoId) {
        result.isLive = true;
        result.videoId = liveData.items[0].id.videoId;
      }

      if (recentData.items) {
        result.recentVideos = recentData.items
          .filter(function (item) { return item.snippet && item.snippet.resourceId; })
          .map(function (item) {
            const thumb = item.snippet.thumbnails || {};
            return {
              videoId: item.snippet.resourceId.videoId,
              title: item.snippet.title,
              thumbnail: (thumb.medium || thumb.default || {}).url || '',
            };
          });
      }
    } catch (err) {
      result = { isLive: false, videoId: null, recentVideos: [] };
    }

    const responseBody = JSON.stringify(result);
    const response = new Response(responseBody, { headers: corsHeaders });

    const cacheableResponse = new Response(responseBody, {
      headers: { 'Cache-Control': 'public, max-age=' + CACHE_SECONDS },
    });
    ctx.waitUntil(cache.put(cacheKey, cacheableResponse));

    return response;
  },
};
