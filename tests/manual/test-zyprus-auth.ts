/**
 * Test Zyprus API Authentication
 * Uses credentials from env/zyprus.env
 */

const ZYPRUS_API_URL = "https://dev9.zyprus.com";
const ZYPRUS_CLIENT_ID = "5Al3Dbs3X9Oqbi8PAjPh5wUfcfrothnub7gI8nOvLig";
const ZYPRUS_CLIENT_SECRET = 'M7wH"%zuyf8")KZ';

async function testAuth() {
  console.log("Testing Zyprus OAuth2 authentication...\n");
  console.log("API URL:", ZYPRUS_API_URL);
  console.log("Client ID:", ZYPRUS_CLIENT_ID);
  console.log("Client Secret:", ZYPRUS_CLIENT_SECRET.substring(0, 4) + "***");
  console.log("");

  try {
    const response = await fetch(`${ZYPRUS_API_URL}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "SophiaAI",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: ZYPRUS_CLIENT_ID,
        client_secret: ZYPRUS_CLIENT_SECRET,
      }),
    });

    console.log("Response status:", response.status);
    console.log(
      "Response headers:",
      Object.fromEntries(response.headers.entries())
    );

    const text = await response.text();
    console.log("\nResponse body:");
    console.log(text);

    if (response.ok) {
      const data = JSON.parse(text);
      console.log("\n✅ Authentication successful!");
      console.log("Token type:", data.token_type);
      console.log("Expires in:", data.expires_in, "seconds");
      console.log(
        "Access token (first 20 chars):",
        data.access_token?.substring(0, 20) + "..."
      );

      // Test API endpoint with token
      console.log("\n--- Testing API with token ---");
      const apiTest = await fetch(
        `${ZYPRUS_API_URL}/jsonapi/taxonomy_term/property_type`,
        {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            Accept: "application/vnd.api+json",
            "User-Agent": "SophiaAI",
          },
        }
      );
      console.log("API test status:", apiTest.status);
      if (apiTest.ok) {
        const apiData = await apiTest.json();
        console.log("Property types count:", apiData.data?.length || 0);
      } else {
        console.log("API test error:", await apiTest.text());
      }
    } else {
      console.log("\n❌ Authentication failed!");
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
  }
}

testAuth();
