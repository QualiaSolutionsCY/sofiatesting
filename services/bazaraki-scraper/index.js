const http = require("http");
const { chromium } = require("playwright");

const PORT = process.env.PORT || 3000;
const SECRET = process.env.SCRAPER_SECRET || "";

let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
  }
  return browser;
}

async function scrapeBazaraki(url) {
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "en-US",
    viewport: { width: 1920, height: 1080 },
    // Stealth: make headless browser look more real
    javaScriptEnabled: true,
    bypassCSP: true,
    extraHTTPHeaders: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    },
  });

  const page = await context.newPage();

  // Stealth: Override navigator properties to look like a real browser
  await page.addInitScript(() => {
    // Hide webdriver flag
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    // Fake plugins
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
    // Fake languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
    // Override permissions query
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (params) =>
        params.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(params);
    }
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Handle Cloudflare challenge — wait for it to resolve
    let pageText = await page.textContent("body").catch(() => "");
    if (pageText && (pageText.includes("security service") || pageText.includes("Checking your browser"))) {
      console.log("[Scrape] Cloudflare challenge detected, waiting up to 20s for resolution...");
      // Wait for the challenge to auto-solve — look for real page content appearing
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(2000);
        pageText = await page.textContent("body").catch(() => "");
        if (pageText && !pageText.includes("security service") && !pageText.includes("Checking your browser")) {
          console.log(`[Scrape] Cloudflare resolved after ${(i + 1) * 2}s`);
          break;
        }
      }
    }

    // Wait for key content to render
    await page
      .waitForSelector("h1, [class*=price], [class*=announcement]", { timeout: 10000 })
      .catch(() => {});

    const data = await page.evaluate(() => {
      const result = {
        title: "",
        price: null,
        currency: "EUR",
        location: "",
        description: "",
        imageUrls: [],
        bedrooms: null,
        bathrooms: null,
        coveredArea: null,
        plotSize: null,
        propertyType: "",
        listingType: "",
        features: [],
        yearBuilt: null,
        condition: "",
        furnishing: "",
        energyClass: "",
        parking: "",
        airConditioning: "",
        hasTitleDeeds: false,
      };

      // Title
      const h1 = document.querySelector("h1");
      if (h1) result.title = h1.textContent.trim();

      // Price — try data-price attribute first (most reliable), then text
      const priceDataEl = document.querySelector("[data-price]");
      if (priceDataEl) {
        const dp = priceDataEl.getAttribute("data-price");
        if (dp) result.price = parseInt(dp, 10);
      }
      if (!result.price) {
        // Try the price display element — look for the actual number with €
        const priceEl =
          document.querySelector(".announcement-price__cost") ||
          document.querySelector("[class*=price] span") ||
          document.querySelector("[class*=price]");
        if (priceEl) {
          // Get only direct text (exclude child elements like "per month")
          let priceText = "";
          for (const node of priceEl.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              priceText += node.textContent;
            }
          }
          if (!priceText) priceText = priceEl.textContent || "";
          // Extract number: "€420,000" or "€ 420 000" or "420.000 €"
          const cleaned = priceText.replace(/[^\d.,]/g, "");
          // Handle European format (420.000) vs US format (420,000)
          // If has dots and no commas, dots are thousands separators
          if (cleaned.includes(".") && !cleaned.includes(",")) {
            result.price = parseInt(cleaned.replace(/\./g, ""), 10);
          } else if (cleaned.includes(",") && !cleaned.includes(".")) {
            result.price = parseInt(cleaned.replace(/,/g, ""), 10);
          } else {
            result.price = parseInt(cleaned.replace(/[.,]/g, ""), 10);
          }
          // Sanity check: Cyprus property prices should be < 50M
          if (result.price && result.price > 50000000) result.price = null;
        }
      }

      // Location — try specific location element, then breadcrumbs
      // Bazaraki shows location near the map/address area
      const locEl =
        document.querySelector(".announcement-meta__location") ||
        document.querySelector("[class*=location] a") ||
        document.querySelector(".announcement-location") ||
        document.querySelector('[itemprop="address"]');
      if (locEl) {
        result.location = locEl.textContent.trim().replace(/\s+/g, " ");
      }

      // If no dedicated location element, try breadcrumbs (skip generic ones)
      if (!result.location) {
        const breadcrumbs = document.querySelectorAll(
          ".breadcrumbs a, [class*=breadcrumb] a"
        );
        const parts = [];
        const skipWords = [
          "home",
          "bazaraki",
          "real estate",
          "houses",
          "apartments",
          "sale",
          "rent",
          "all adverts",
          "cyprus",
        ];
        breadcrumbs.forEach((bc) => {
          const text = bc.textContent.trim();
          if (
            text &&
            !skipWords.some((w) => text.toLowerCase().includes(w))
          ) {
            parts.push(text);
          }
        });
        if (parts.length > 0) result.location = parts.join(", ");
      }

      // Description — get the actual listing text
      const descContainer = document.querySelector(
        ".announcement-body__description, .js-description, [class*=description]"
      );
      if (descContainer) {
        // Try to get only the actual description text, not UI chrome
        const descText = descContainer.textContent || "";
        // Clean up: remove "Translate to: ..." prefix and extra whitespace
        const cleaned = descText
          .replace(
            /Translate to:[\s\S]*?Show original\s*/i,
            ""
          )
          .replace(/\s+/g, " ")
          .trim();
        if (cleaned.length > 20) result.description = cleaned;
      }

      // Images — gallery images (full-size from data-default-src or data-src)
      const seenUrls = new Set();
      // Try gallery/slider images first
      const galleryImgs = document.querySelectorAll(
        ".announcement-images img, [class*=gallery] img, .swiper-slide img, .carousel img, [class*=slider] img, [data-fancybox] img"
      );
      galleryImgs.forEach((img) => {
        // Prefer largest image variant
        const src =
          img.getAttribute("data-default-src") ||
          img.getAttribute("data-src") ||
          img.getAttribute("data-lazy") ||
          img.getAttribute("src");
        if (
          src &&
          src.startsWith("http") &&
          !src.includes("logo") &&
          !src.includes("avatar") &&
          !src.includes("icon") &&
          !seenUrls.has(src)
        ) {
          seenUrls.add(src);
          result.imageUrls.push(src);
        }
      });

      // Also check og:image as fallback
      if (result.imageUrls.length === 0) {
        document
          .querySelectorAll('meta[property="og:image"]')
          .forEach((meta) => {
            const url = meta.getAttribute("content");
            if (url && !seenUrls.has(url)) {
              seenUrls.add(url);
              result.imageUrls.push(url);
            }
          });
      }

      // Also grab thumbnail links that point to full images
      document
        .querySelectorAll(
          "a[href*='cdn1.bazaraki.com'], a[href*='cdn.bazaraki.com']"
        )
        .forEach((a) => {
          const href = a.getAttribute("href");
          if (
            href &&
            href.match(/\.(jpg|jpeg|png|webp)/i) &&
            !seenUrls.has(href)
          ) {
            seenUrls.add(href);
            result.imageUrls.push(href);
          }
        });

      // Property attributes from characteristics table/list
      const attrRows = document.querySelectorAll(
        ".announcement-characteristics li, .announcement-characteristics__item, [class*=characteristic] li, [class*=params] li, [class*=attributes] li, [class*=detail] li"
      );
      attrRows.forEach((row) => {
        const text = row.textContent.toLowerCase().trim();

        // Bedrooms
        if (text.includes("bedroom") && !text.includes("bathroom")) {
          const num = text.match(/(\d+)/);
          if (num) result.bedrooms = parseInt(num[1], 10);
        }
        // Bathrooms
        if (text.includes("bathroom") || (text.includes("bath") && !text.includes("bedroom"))) {
          const num = text.match(/(\d+)/);
          if (num) result.bathrooms = parseInt(num[1], 10);
        }
        // Covered/property area — Bazaraki uses "Property area" label
        if (
          (text.includes("property area") || text.includes("covered area") ||
           text.includes("indoor area") || text.includes("internal area") ||
           text.includes("living area")) &&
          text.match(/\d/)
        ) {
          const num = text.match(/(\d[\d,.]*)\s*m/);
          if (num)
            result.coveredArea = parseInt(num[1].replace(/[,.]/g, ""), 10);
        }
        // Plot size
        if (
          (text.includes("plot") || text.includes("land size") || text.includes("land area")) &&
          text.match(/\d/)
        ) {
          const num = text.match(/(\d[\d,.]*)\s*m/);
          if (num)
            result.plotSize = parseInt(num[1].replace(/[,.]/g, ""), 10);
        }
        // Property type (from "Type" row)
        if ((text.startsWith("type") || text.includes("type:")) && !text.includes("property type")) {
          const val = text.split(/type:?\s*/i).pop().trim();
          if (val && val.length < 50) result.propertyType = val;
        }
        // Construction year
        if (text.includes("construction year") || text.includes("year built")) {
          const num = text.match(/((?:19|20)\d{2})/);
          if (num) result.yearBuilt = parseInt(num[1], 10);
        }
        // Condition
        if (text.includes("condition")) {
          const val = text.split(/condition:?\s*/i).pop().trim();
          if (val && val.length < 30) result.condition = val;
        }
        // Furnishing
        if (text.includes("furnishing") || text.includes("furnished")) {
          const val = text.split(/furnish\w*:?\s*/i).pop().trim();
          if (val && val.length < 50) result.furnishing = val;
        }
        // Energy efficiency
        if (text.includes("energy")) {
          const val = text.match(/[:\s]([a-g])\b/i);
          if (val) result.energyClass = val[1].toUpperCase();
        }
        // Parking
        if (text.includes("parking")) {
          const val = text.split(/parking:?\s*/i).pop().trim();
          if (val && val.length < 30) result.parking = val;
        }
        // Included features
        if (text.includes("included") || text.includes("features")) {
          const val = text.split(/(?:included|features):?\s*/i).pop().trim();
          if (val) {
            val.split(/,\s*/).forEach((f) => {
              const feat = f.trim();
              if (feat && feat.length < 40) result.features.push(feat);
            });
          }
        }
        // Location from characteristics (e.g., "Location: Limassol – Episkopi Lemesou")
        if (text.startsWith("location") && text.includes(":")) {
          const val = row.textContent.split(/location:?\s*/i).pop().trim();
          if (val && val.length > 3 && val.length < 100) {
            result.location = val;
          }
        }
        // Air conditioning
        if (text.includes("air conditioning") || text.includes("a/c")) {
          const val = text.split(/(?:air conditioning|a\/c):?\s*/i).pop().trim();
          if (val && val.length < 50) result.airConditioning = val;
        }
      });

      // Location fallback — search all text nodes for "Location:" pattern
      // Bazaraki often shows "Location: Limassol – Episkopi Lemesou" outside the characteristics list
      if (!result.location || result.location.toLowerCase().includes("all adverts")) {
        const allText = document.body.innerText || "";
        const locMatch = allText.match(/Location:\s*(.+?)(?:\n|$)/i);
        if (locMatch) {
          const locVal = locMatch[1].trim();
          if (locVal && locVal.length > 3 && locVal.length < 100 &&
              !locVal.toLowerCase().includes("all adverts")) {
            result.location = locVal;
          }
        }
      }

      // Furnishing fallback — also search page text
      if (!result.furnishing) {
        const allText = document.body.innerText || "";
        const furnMatch = allText.match(/Furnishing:\s*(.+?)(?:\n|$)/i);
        if (furnMatch) {
          const val = furnMatch[1].trim();
          if (val && val.length < 50) result.furnishing = val;
        }
      }

      // Listing type from URL
      const pageUrl = window.location.href.toLowerCase();
      if (pageUrl.includes("-for-sale") || pageUrl.includes("/sale"))
        result.listingType = "sale";
      else if (pageUrl.includes("-for-rent") || pageUrl.includes("/rent"))
        result.listingType = "rent";

      // Title deed detection from description
      const fullPageText = document.body.textContent.toLowerCase();
      if (
        fullPageText.includes("with title deeds") ||
        fullPageText.includes("title deeds available") ||
        fullPageText.includes("has title deeds") ||
        fullPageText.includes("full title deeds") ||
        fullPageText.includes("separate title deed")
      ) {
        result.hasTitleDeeds = true;
      }

      return result;
    });

    // Post-process: clean up description
    if (data.description) {
      // Remove leading/trailing noise
      data.description = data.description
        .replace(/^[\s\n]+|[\s\n]+$/g, "")
        .substring(0, 2000); // Cap at 2000 chars
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    await context.close();
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Scraper-Secret"
  );

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (SECRET && req.headers["x-scraper-secret"] !== SECRET) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/scrape") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "POST /scrape only" }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const { url } = body;
  if (!url || !url.includes("bazaraki.com")) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "URL must be a bazaraki.com link" }));
    return;
  }

  console.log(`[Scrape] ${url}`);
  const start = Date.now();
  const result = await scrapeBazaraki(url);
  const elapsed = Date.now() - start;
  console.log(
    `[Scrape] ${result.success ? "OK" : "FAIL"} in ${elapsed}ms — ${result.data?.title || result.error || "no title"} — ${result.data?.imageUrls?.length || 0} images`
  );

  res.writeHead(result.success ? 200 : 500, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(result));
});

server.listen(PORT, () => {
  console.log(`Bazaraki scraper listening on port ${PORT}`);
  getBrowser().then(() => console.log("Browser ready"));
});

process.on("SIGTERM", async () => {
  if (browser) await browser.close();
  process.exit(0);
});
