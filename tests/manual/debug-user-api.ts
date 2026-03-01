import { config } from "dotenv";

config({ path: ".env.local" });

const apiUrl = process.env.ZYPRUS_API_URL;
const clientId = process.env.ZYPRUS_CLIENT_ID;
const clientSecret = process.env.ZYPRUS_CLIENT_SECRET;

async function main() {
  if (!apiUrl || !clientId || !clientSecret) {
    console.error("Missing env vars");
    return;
  }

  console.log("API URL:", apiUrl);

  // Get token
  const tokenRes = await fetch(`${apiUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "User-Agent": "SophiaAI",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const { access_token } = await tokenRes.json();
  console.log("Got token\n");

  // Try different endpoints
  const endpoints = [
    "/jsonapi/user/user?page[limit]=10",
    "/jsonapi/user/user?filter[status]=1&page[limit]=10",
    "/jsonapi/user/user",
  ];

  for (const endpoint of endpoints) {
    console.log(`\n=== Testing: ${endpoint} ===`);
    const res = await fetch(`${apiUrl}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    });

    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Data count:", data.data?.length || 0);

    if (data.data?.[0]) {
      console.log("\nFirst user raw:");
      console.log(JSON.stringify(data.data[0], null, 2));
    }

    if (data.errors) {
      console.log("Errors:", JSON.stringify(data.errors, null, 2));
    }
  }
}

main();
