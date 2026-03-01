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

  // Fetch all users (paginate if needed)
  let nextUrl: string | null =
    `${apiUrl}/jsonapi/user/user?filter[status]=1&page[limit]=100`;
  const users: Array<{ email: string; uuid: string; name: string }> = [];

  while (nextUrl) {
    const usersRes = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    });

    const data = await usersRes.json();

    console.log(`Page returned ${data.data?.length || 0} users`);

    for (const user of data.data || []) {
      const email = user.attributes?.mail?.toLowerCase();
      const name = user.attributes?.display_name || user.attributes?.name || "";
      console.log(`  - ${email || "(no email)"}: ${name}`);
      if (email) {
        users.push({
          email,
          uuid: user.id,
          name,
        });
      }
    }

    nextUrl = data.links?.next?.href || null;

    // Safety limit
    if (users.length > 500) {
      console.log("Hit safety limit of 500 users");
      break;
    }
  }

  console.log(`Found ${users.length} total users\n`);

  // Print users with zyprus.com emails
  console.log("=== ZYPRUS STAFF ===\n");
  const zyprusUsers = users.filter((u) => u.email.includes("zyprus"));
  for (const user of zyprusUsers.sort((a, b) =>
    a.email.localeCompare(b.email)
  )) {
    console.log(`"${user.email}": "${user.uuid}", // ${user.name}`);
  }

  // Key emails we need
  console.log("\n=== KEY EMAILS FOR FALLBACKS ===\n");
  const keyEmails = [
    "listings@zyprus.com",
    "requestpaphos@zyprus.com",
    "requestlimassol@zyprus.com",
    "requestlarnaca@zyprus.com",
    "requestnicosia@zyprus.com",
    "requestfamagusta@zyprus.com",
    "michelle@zyprus.com",
    "demetra@zyprus.com",
    "azinas@zyprus.com",
  ];

  for (const email of keyEmails) {
    const user = users.find((u) => u.email === email);
    if (user) {
      console.log(`"${email}": "${user.uuid}", // ${user.name}`);
    } else {
      console.log(`"${email}": NOT FOUND`);
    }
  }
}

main();
