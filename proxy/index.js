const http = require("http");
const https = require("https");

const TARGET = process.env.CX3_TARGET || "https://185.162.18.158:5001";
const PROXY_SECRET = process.env.PROXY_SECRET || "";
const PORT = process.env.PORT || 3000;

// Skip SSL verification for the 3CX server (expired cert)
const agent = new https.Agent({ rejectUnauthorized: false });

const server = http.createServer(async (req, res) => {
  // Auth check
  if (PROXY_SECRET && req.headers["x-proxy-secret"] !== PROXY_SECRET) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // Health check
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", target: TARGET }));
    return;
  }

  // Strip /proxy prefix if present
  const path = req.url.replace(/^\/proxy/, "") || "/";
  const targetUrl = `${TARGET}${path}`;

  // Collect request body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  // Forward to 3CX
  const parsedUrl = new URL(targetUrl);
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.pathname + parsedUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${parsedUrl.hostname}:${parsedUrl.port}`,
    },
    agent,
  };

  // Remove proxy-specific headers
  delete options.headers["x-proxy-secret"];

  const proxyReq = https.request(options, (proxyRes) => {
    // Forward response headers (skip transfer-encoding to avoid issues)
    const headers = { ...proxyRes.headers };
    delete headers["transfer-encoding"];
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Proxy error", message: err.message }));
  });

  if (body.length > 0) proxyReq.write(body);
  proxyReq.end();
});

server.listen(PORT, () => {
  console.log(`3CX proxy listening on port ${PORT}, target: ${TARGET}`);
});
