import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import Parser from "rss-parser";

const parser = new Parser();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Proxy fetching based on 10-tier priority logic
  // Priority: 1. GitHub API 2. Registries 3. RSS 4. HTML Changelogs 5. Blogs 6. Downloads 7. Socials 8. Aggregators 9. Email 10. Forums
  app.get("/api/proxy", async (req, res) => {
    const { url, type } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      const headers = { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
      };

      if (type === "rss") {
        const response = await axios.get(url, { headers, responseType: 'text' });
        let xmlData = response.data;
        
        try {
          const feed = await parser.parseString(xmlData);
          return res.json(feed);
        } catch (parseError: any) {
          // Attempt to fix common XML entity errors like stray ampersands
          const sanitizedXml = xmlData.replace(/&(?!(?:[a-z]+|#[0-9]+|#x[0-9a-f]+);)/gi, '&amp;');
          try {
            const feed = await parser.parseString(sanitizedXml);
            return res.json(feed);
          } catch (secondError) {
            throw parseError; // Rethrow original error if sanitization didn't help
          }
        }
      } else if (type === "custom_script") {
        const response = await axios.get(url, { headers });
        const $ = cheerio.load(response.data);
        const updates: any[] = [];
        const seen = new Set();
        
        // Scan all potential version containers
        $('h1, h2, h3, h4, h5, p, b, strong, li, td').each((i, el) => {
          const text = $(el).text().trim();
          
          // Must contain a version-like number and not be too long (to avoid containers)
          if (!text.match(/[0-9]+\.[0-9]+/) || text.length > 300) return;
          
          const parts = text.split(/\+/);
          let baseDetailsParsed = false;
          let details = "";
          
          for (let p of parts) {
              const versionMatch = p.match(/(?:FL Studio)?\s*([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\s(?:RC|Beta|build|[a-zA-Z]+|\s*)[0-9]*)*)\s*\((.*?)\)/i) || 
                                   p.match(/^([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\s(?:RC|Beta|build|[a-zA-Z]+|\s*)[0-9]*)*)\s*\((.*?)\)/i);
              
              if (versionMatch) {
                let version = versionMatch[1] || versionMatch[3] || "";
                version = version.trim();
                let rawDate = versionMatch[2] || versionMatch[4] || "";

                if (!version.toLowerCase().includes("flex:") && !seen.has(version)) {
                   seen.add(version);

                   // Extract details ONLY for the first version in a block, or if we haven't found them yet
                   if (!baseDetailsParsed) {
                       let nextEl = $(el).is('li, td') ? $(el).parent().next() : $(el).next();
                       // If we are in a list item, details might be better found in sub-items or following paras
                       let searchCount = 0;
                       while (nextEl.length && !nextEl.is('h1, h2, h3, h4, h5') && searchCount < 15) {
                         if (nextEl.is('ul, ol')) {
                            nextEl.find('li').each((_, li) => {
                              details += "- " + $(li).text().trim() + "\\n";
                            });
                         } else if (nextEl.is('p, div')) {
                            const pText = nextEl.text().trim();
                            if (pText.length > 0 && !pText.match(/^[0-9]+\.[0-9]+/)) {
                               details += pText + "\\n";
                            }
                         }
                         nextEl = nextEl.next();
                         searchCount++;
                       }
                       baseDetailsParsed = true;
                   }

                   let dateStr = new Date().toISOString();
                   try {
                      let cleanedDate = rawDate.replace(/\//g, ' ').replace(/\s+/g, ' ');
                      // Handle "2026 / March / 09" -> "March 09 2026"
                      if (cleanedDate.match(/\d{4}\s+[a-zA-Z]+\s+\d{2}/)) {
                          const dp = cleanedDate.split(/\s+/);
                          cleanedDate = `${dp[1]} ${dp[2]} ${dp[0]}`;
                      }
                      
                      let pDate = new Date(cleanedDate);
                      if (!isNaN(pDate.getTime())) {
                         dateStr = pDate.toISOString();
                      }
                   } catch(e) {}

                   let category = "Feature Updates";
                   if (version.match(/^[0-9]+\.[0-9]+$/)) category = "Major Milestone Update"; 
                   else if (details.toLowerCase().includes("bug") || details.toLowerCase().includes("fix")) category = "Bug Fixes";

                   updates.push({
                     version,
                     releaseDate: dateStr,
                     category,
                     summary: details.substring(0, 5000) || "Minor updates and features.",
                     isGenuineUpdate: true,
                     rawData: details.substring(0, 500)
                   });
                }
              }
          }
        });
        
        return res.json({ scriptData: updates });
      } else if (type === "html") {
        const response = await axios.get(url, { headers });
        return res.json({ html: response.data.substring(0, 500000) });
      } else if (type === "github" || url.includes("api.github.com")) {
        const response = await axios.get(url, { 
          headers: { 
            ...headers,
            'Accept': 'application/vnd.github.v3+json' 
          } 
        });
        return res.json(response.data);
      } else {
        const response = await axios.get(url, { headers });
        return res.json(response.data);
      }
    } catch (error: any) {
      const status = error.response?.status || 500;
      if (status !== 404) {
        console.error(`Proxy Error [${type || 'default'}]: ${error.message} - ${url}`);
      }
      const message = error.response?.data?.message || error.message;
      res.status(status).json({ error: message, status });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
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
