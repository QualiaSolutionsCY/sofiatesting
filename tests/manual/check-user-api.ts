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

  // Try different user endpoints
  const endpoints = [
    "/jsonapi/user/user?filter[status]=1&page[limit]=10",
    "/jsonapi/user/user?page[limit]=10",
    "/jsonapi/user--user?page[limit]=10",
  ];

  for (const endpoint of endpoints) {
    console.log(`\nTrying: ${endpoint}`);
    const res = await fetch(`${apiUrl}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    });

    console.log(`Status: ${res.status}`);

    if (res.ok) {
      const data = await res.json();
      console.log(`Data count: ${data.data?.length || 0}`);
      console.log("Meta:", data.meta);
      if (data.data?.[0]) {
        console.log("First user sample:", {
          id: data.data[0].id,
          type: data.data[0].type,
          attributes: Object.keys(data.data[0].attributes || {}),
        });
      }
    } else {
      const text = await res.text();
      console.log("Error:", text.substring(0, 200));
    }
  }

  // Try to find a specific user by email
  console.log("\n\n=== Trying email filter ===");
  const emailRes = await fetch(
    `${apiUrl}/jsonapi/user/user?filter[mail]=listings@zyprus.com`,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    }
  );
  console.log(`Status: ${emailRes.status}`);
  const emailData = await emailRes.json();
  console.log(`Found: ${emailData.data?.length || 0}`);
  if (emailData.data?.[0]) {
    console.log("User:", emailData.data[0]);
  }
}

main();
