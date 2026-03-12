import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.vceeheaxcrhmpqueudqx:Zambelis123%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
);

async function testKnowledgeSearch() {
  try {
    console.log(
      "Testing search_sophia_knowledge with a zero vector (valid dimension 768)..."
    );

    // Create a dummy array of 768 zeros stringified for SQL
    const dummyVector = "[" + Array(768).fill(0).join(",") + "]";

    // Attempt to call search_sophia_knowledge
    const result = await sql`
      SELECT * FROM public.search_sophia_knowledge(${dummyVector}::vector, 3)
    `;

    console.log(`Success! Retrieved ${result.length} rows.`);
    console.log("Vector operator works correctly.");
  } catch (err) {
    console.error("Knowledge Search Failed:", err.message);
  }
}

async function testMemorySearch() {
  try {
    console.log("\nTesting search_sophia_memory with a zero vector...");

    const dummyVector = "[" + Array(768).fill(0).join(",") + "]";
    const dummyUuid = "00000000-0000-0000-0000-000000000000";

    // Attempt to call search_sophia_memory
    const result = await sql`
      SELECT * FROM public.search_sophia_memory(${dummyUuid}::uuid, ${dummyVector}::vector, 3)
    `;

    console.log(`Success! Retrieved ${result.length} rows.`);
    console.log("Vector operator works correctly.");
  } catch (err) {
    console.error("Memory Search Failed:", err.message);
  }
}

async function runTests() {
  await testKnowledgeSearch();
  await testMemorySearch();
  process.exit(0);
}

runTests();
