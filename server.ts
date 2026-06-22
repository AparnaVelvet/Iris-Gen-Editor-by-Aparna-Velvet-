import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Serve PWA web app manifest
  app.get("/manifest.json", (req, res) => {
    res.json({
      name: "Iris Gen Editor by Aparna Velvet",
      short_name: "Iris Gen",
      description: "Generate and automate cyberpunk B-rolls from subtitles with smart AI keyword tagging.",
      start_url: "/",
      display: "standalone",
      background_color: "#0d0d11",
      theme_color: "#D10068",
      orientation: "any",
      icons: [
        {
          src: "https://images.pexels.com/photos/3129957/pexels-photo-3129957.jpeg?auto=compress&cs=tinysrgb&w=192",
          sizes: "192x192",
          type: "image/jpeg",
          purpose: "any maskable"
        },
        {
          src: "https://images.pexels.com/photos/3129957/pexels-photo-3129957.jpeg?auto=compress&cs=tinysrgb&w=512",
          sizes: "512x512",
          type: "image/jpeg"
        }
      ]
    });
  });

  // Serve PWA offline Service Worker stream
  app.get("/sw.js", (req, res) => {
    res.set("Content-Type", "application/javascript");
    res.send(`
      const CACHE_NAME = 'iris-gen-cache-v1.2';
      const urlsToCache = [
        '/',
        '/index.html',
        '/src/main.tsx',
        '/src/App.tsx',
        '/src/index.css',
        '/src/data.ts',
        '/src/types.ts',
        '/manifest.json'
      ];

      self.addEventListener('install', event => {
        event.waitUntil(
          caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
        );
      });

      self.addEventListener('activate', event => {
        event.waitUntil(
          caches.keys().then(cacheNames => {
            return Promise.all(
              cacheNames.map(cacheName => {
                if (cacheName !== CACHE_NAME) {
                  return caches.delete(cacheName);
                }
              })
            );
          }).then(() => self.clients.claim())
        );
      });

      self.addEventListener('fetch', event => {
        // Skip API routes caching for real-time requests
        if (event.request.url.includes('/api/')) {
          return;
        }
        event.respondWith(
          caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              return fetch(event.request).then(response => {
                // Cache dynamic static bundles on the fly
                if (response.status === 200 && response.type === 'basic') {
                  const responseClone = response.clone();
                  caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                  });
                }
                return response;
              }).catch(() => {
                // Fallback for navigation
                if (event.request.mode === 'navigate') {
                  return caches.match('/');
                }
              });
            })
        );
      });
    `);
  });

  // Safe initialization of Gemini client
  let ai: GoogleGenAI | null = null;
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } catch (err) {
      console.error("Failed to initialize GoogleGenAI client:", err);
    }
  }

  // API: Get keywords from subtitle subtitle blocks
  app.post("/api/gemini/keywords", async (req, res) => {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Missing 'text' in body." });
    }

    // Fallback dictionary for typical cyberpunk/tech themes if API key is not configured or fails
    const defaultKeywords = [
      "hacker green terminal typing fast close up vertical",
      "cyberpunk fuchsia neon city lights street horizontal",
      "digital network data streams flowing vertical",
      "abstract glowing binary code rain dark background",
      "motherboard circuitry pulses electricity pink neon horizontal",
      "futuristic server rack flashing fuchsia lights",
      "retro tech vaporwave screen grid waving",
    ];

    if (!ai) {
      // Simulate keyword generation with a smart fallback based on matching content
      console.log("No GEMINI_API_KEY configured. Using local deterministic fallback keywords.");
      const words = text.toLowerCase();
      let selected: string[] = [];
      if (words.includes("hack") || words.includes("code") || words.includes("terminal")) {
        selected = ["cyber terminal typing", "hacker coding glowing monitor"];
      } else if (words.includes("city") || words.includes("world") || words.includes("neon")) {
        selected = ["cyberpunk fuchsia neon street", "neon futuristic metropolis skyline"];
      } else if (words.includes("computer") || words.includes("chip") || words.includes("hardware")) {
        selected = ["circuitry board electricity pink", "cyber mainframe processor close-up"];
      } else if (words.includes("data") || words.includes("stream") || words.includes("network")) {
        selected = ["digital network fiber data", "cyberpunk floating binary matrix"];
      } else {
        // Pick random ones
        const idx1 = Math.floor(Math.random() * defaultKeywords.length);
        const idx2 = (idx1 + 1) % defaultKeywords.length;
        selected = [defaultKeywords[idx1], defaultKeywords[idx2]];
      }
      return res.json({ keywords: selected, simulated: true });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Analyze this dialogue text from a video subtitle block: "${text}".
Generate 2 to 3 visual keywords or search phrases (comma-separated, extremely visual, simple, direct descriptive) suitable to search for free stock video footage on Pexels/Pixabay that represents the core theme. Avoid abstract concepts, prefer concrete physical objects or scenes (e.g. "cyberpunk fuchsia neon city", "typing on keyboard close-up", "binary code flow screen"). Maximum 4 words per phrase.`,
        config: {
          systemInstruction: "You are a visual video editor matching subtitles to high-quality stock video clip concepts. Return exactly a JSON array of strings containing 2-3 visual search terms.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              keywords: {
                type: Type.ARRAY,
                items: {
                  type: Type.STRING,
                },
                description: "List of 2-3 high-quality stock footage visual search keywords.",
              },
            },
            required: ["keywords"],
          },
        },
      });

      const resultText = response.text || "{}";
      const parsed = JSON.parse(resultText);
      return res.json({ keywords: parsed.keywords || ["cyberpunk pink grid"], simulated: false });
    } catch (err: any) {
      console.error("Gemini API Error:", err);
      // Fallback
      return res.json({
        keywords: ["cyberpunk fuchsia visual", "neon computing code matrix"],
        simulated: true,
        error: err.message,
      });
    }
  });

  // API Route to fetch Pexels Stock Videos
  // Supports a provided client key, server-side key or predefined stock fallback assets in fuchsia/tech theme
  app.post("/api/video-search", async (req, res) => {
    const { keyword, isVertical, clientKey } = req.body;
    
    // Cyberpunk/Hacker themed fallback stock footage clips on Pexels (using free high-quality public links/embeds or safe-to-use background visualizers)
    const presetVideos = [
      {
        id: 1,
        url: "https://videos.pexels.com/video-files/3129957/3129957-uhd_1920_1080_25fps.mp4",
        name: "cyberpunk_neon_city_lines",
        preview: "https://images.pexels.com/photos/3129957/pexels-photo-3129957.jpeg?auto=compress&cs=tinysrgb&w=400",
        width: 1920,
        height: 1080,
      },
      {
        id: 2,
        url: "https://videos.pexels.com/video-files/3209828/3209828-uhd_1920_1080_25fps.mp4",
        name: "neon_glowing_grids_cyberpunk",
        preview: "https://images.pexels.com/photos/3209828/pexels-photo-3209828.jpeg?auto=compress&cs=tinysrgb&w=400",
        width: 1920,
        height: 1080,
      },
      {
        id: 3,
        url: "https://videos.pexels.com/video-files/853805/853805-hd_1920_1080_25fps.mp4",
        name: "digital_circuitry_network_data",
        preview: "https://images.pexels.com/photos/853805/pexels-photo-853805.jpeg?auto=compress&cs=tinysrgb&w=400",
        width: 1920,
        height: 1080,
      },
      {
        id: 4,
        url: "https://videos.pexels.com/video-files/5198159/5198159-uhd_1080_1920_25fps.mp4",
        name: "cyber_terminal_rain_vertical",
        preview: "https://images.pexels.com/photos/5198159/pexels-photo-5198159.jpeg?auto=compress&cs=tinysrgb&w=400",
        width: 1080,
        height: 1920,
      },
      {
        id: 5,
        url: "https://videos.pexels.com/video-files/3130223/3130223-uhd_1920_1080_25fps.mp4",
        name: "network_abstract_code_glitch",
        preview: "https://images.pexels.com/photos/3130223/pexels-photo-3130223.jpeg?auto=compress&cs=tinysrgb&w=400",
        width: 1920,
        height: 1080,
      },
      {
        id: 6,
        url: "https://videos.pexels.com/video-files/3129654/3129654-uhd_1920_1080_30fps.mp4",
        name: "futuristic_server_fuchsia_magenta",
        preview: "https://images.pexels.com/photos/3129654/pexels-photo-3129654.jpeg?auto=compress&cs=tinysrgb&w=400",
        width: 1920,
        height: 1080,
      }
    ];

    const pexelsKey = clientKey || process.env.PEXELS_API_KEY;

    if (!pexelsKey) {
      // Return a predetermined cyberpunk themed stock footage video based on keywords
      const lower = (keyword || "").toLowerCase();
      let matched = presetVideos[0];
      if (isVertical) {
        matched = presetVideos[3]; // Vertical matrix rain
      } else {
        if (lower.includes("circuit") || lower.includes("cpu") || lower.includes("hardware")) {
          matched = presetVideos[2];
        } else if (lower.includes("grid") || lower.includes("abstract") || lower.includes("matrix")) {
          matched = presetVideos[1];
        } else if (lower.includes("server") || lower.includes("pink") || lower.includes("fuchsia")) {
          matched = presetVideos[5];
        } else if (lower.includes("glitch") || lower.includes("terminal") || lower.includes("hacker")) {
          matched = presetVideos[4];
        } else {
          // select random horizontal
          const horizontalPreset = presetVideos.filter(v => v.width > v.height);
          matched = horizontalPreset[Math.floor(Math.random() * horizontalPreset.length)] || presetVideos[0];
        }
      }
      return res.json({
        video: matched,
        simulated: true,
        message: "No specific API Key provided. Loading premium hacker preset background asset."
      });
    }

    try {
      // Real fetch to Pexels if API Key is available
      const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=10`;
      const response = await fetch(url, {
        headers: {
          Authorization: pexelsKey,
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: "Pexels API request failed." });
      }

      const data = await response.json();
      const videosList = data.videos || [];

      if (videosList.length === 0) {
        return res.json({ video: null, error: "No video found for keyword: " + keyword });
      }

      // STRICT RESOLUTION FILTER LOGIC SIMULATION IN SERVER:
      // Loop through all videos to find the one that matches 1920x1080 (horizontal) or 1080x1920 (vertical)
      // or closest 1080p, and exclude other 4K/2K or too low SD files.
      let bestVideoFile: any = null;
      let matchedVideoItem: any = null;

      for (const vid of videosList) {
        const isVidVertical = vid.width < vid.height;
        // Check matching orientation filter
        if (isVertical !== isVidVertical) continue;

        // Try to find a video file with exactly 1080p height/width
        const files = vid.video_files || [];
        // Look for HD/Full HD
        const hdFile = files.find((f: any) => {
          // height should be 1080 for horizontal or width 1080 for vertical
          const is1080p = isVertical ? f.width === 1080 : f.height === 1080;
          return is1080p;
        }) || files.find((f: any) => {
          // If perfect 1080p is not found, get HD which is height 720/1080 or width 720/1080, and skip UHD (4K)
          const isHD = isVertical ? (f.width >= 720 && f.width <= 1080) : (f.height >= 720 && f.height <= 1080);
          return isHD;
        });

        if (hdFile) {
          bestVideoFile = hdFile;
          matchedVideoItem = vid;
          break;
        }
      }

      // If we couldn't find a strict matches orientation/resolution, search again ignoring orientation but picking HD
      if (!bestVideoFile && videosList.length > 0) {
        const fallbackVid = videosList[0];
        const files = fallbackVid.video_files || [];
        const hdFile = files.find((f: any) => f.height >= 720 && f.height <= 2000) || files[0];
        if (hdFile) {
          bestVideoFile = hdFile;
          matchedVideoItem = fallbackVid;
        }
      }

      if (bestVideoFile && matchedVideoItem) {
        return res.json({
          video: {
            id: matchedVideoItem.id,
            url: bestVideoFile.link,
            name: matchedVideoItem.user?.name || "Pexels Stock Video",
            preview: matchedVideoItem.image || presetVideos[0].preview,
            width: bestVideoFile.width,
            height: bestVideoFile.height,
          },
          simulated: false,
        });
      } else {
        // Fallback to preset
        return res.json({
          video: presetVideos[0],
          simulated: true,
          message: "Could not locate a precise 1080p match in Pexels results. Returned cyberpunk themed asset.",
        });
      }
    } catch (err: any) {
      console.error("Pexels fetch error", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Serve static files in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
