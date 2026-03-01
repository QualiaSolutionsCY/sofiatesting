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

  // Try with sparse fieldsets to request mail explicitly
  const endpoints = [
    "/jsonapi/user/user?fields[user--user]=display_name,mail,name&page[limit]=10",
    "/jsonapi/user/user?include=roles&page[limit]=10",
    "/jsonapi/user/user?page[limit]=50", // Just get more users and see all attributes
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

    // Look for a user that's not Anonymous
    const nonAnon = data.data?.find(
      (u: any) =>
        u.attributes?.display_name !== "Anonymous" &&
        u.attributes?.display_name !== ""
    );

    if (nonAnon) {
      console.log("\nNon-anonymous user found:");
      console.log(JSON.stringify(nonAnon, null, 2));
    } else if (data.data?.[0]) {
      console.log("\nFirst user (all Anonymous?):");
      console.log(
        "Attributes keys:",
        Object.keys(data.data[0].attributes || {})
      );
    }

    if (data.errors) {
      console.log("Errors:", JSON.stringify(data.errors, null, 2));
    }
  }

  // Get all users and list non-anonymous ones
  console.log("\n\n=== Getting all users ===");
  let nextUrl: string | null = `${apiUrl}/jsonapi/user/user?page[limit]=50`;
  const allUsers: any[] = [];

  while (nextUrl && allUsers.length < 300) {
    const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    });
    const data = await res.json();

    for (const user of data.data || []) {
      if (
        user.attributes?.display_name &&
        user.attributes.display_name !== "Anonymous" &&
        user.attributes.display_name !== ""
      ) {
        allUsers.push({
          id: user.id,
          name: user.attributes.display_name,
          mail: user.attributes?.mail || "(not exposed)",
          allAttrs: Object.keys(user.attributes || {}),
        });
      }
    }

    nextUrl = data.links?.next?.href || null;
  }

  console.log(`\nFound ${allUsers.length} non-anonymous users:`);
  for (const u of allUsers) {
    console.log(`  ${u.name}: ${u.id} | mail: ${u.mail}`);
  }
}

main();
