/**
 * Side-by-side comparison of Gemini models on OpenRouter
 * Run: pnpm exec tsx tests/manual/compare-gemini-models.ts
 */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// Load environment variables from various possible files
const envFiles = [
  ".env.local",
  ".env.production.local",
  ".env.production",
  ".env.vercel",
];
for (const file of envFiles) {
  dotenv.config({ path: path.resolve(process.cwd(), file) });
  if (process.env.OPENROUTER_API_KEY) {
    console.log(`✅ Loaded environment from ${file}`);
    break;
  }
}

const CURRENT_MODEL = "google/gemini-3-flash-preview";
const NEW_MODEL = "google/gemini-3.1-flash-lite-preview";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const SCENARIOS = [
  {
    name: "VAT Calculation",
    prompt:
      "Calculate VAT for a €300,000 property that is 150 square meters, primary residence in Cyprus.",
  },
  {
    name: "Property Upload Intent",
    prompt:
      "I want to upload a 3 bedroom apartment in Limassol for sale at €250,000. Here are the photos: [URL1], [URL2].",
  },
  {
    name: "JSON Adherence",
    prompt:
      'You MUST respond with EXACTLY this JSON format, no additional text: {"status":"ok","temperature":0, "model_test": "passed"}',
  },
  {
    name: "General Conversational Tone",
    prompt:
      "Hi Sophia, can you tell me about the current property market in Cyprus?",
  },
];

async function callOpenRouter(model: string, prompt: string) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is missing");
  }

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://sophia-ai.vercel.app",
        "X-Title": "SOPHIA Model Comparison",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 1000,
      }),
    }
  );

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "ERROR: No response";
}

async function main() {
  console.log(
    `🚀 Comparing Models:\n   1. ${CURRENT_MODEL}\n   2. ${NEW_MODEL}\n`
  );

  let report = `# Model Comparison Report: ${new Date().toISOString()}\n\n`;
  report += `| Scenario | ${CURRENT_MODEL} | ${NEW_MODEL} |\n`;
  report += "| --- | --- | --- |\n";

  for (const scenario of SCENARIOS) {
    console.log(`🧪 Testing Scenario: ${scenario.name}...`);

    const [resCurrent, resNew] = await Promise.all([
      callOpenRouter(CURRENT_MODEL, scenario.prompt),
      callOpenRouter(NEW_MODEL, scenario.prompt),
    ]);

    report += `| **${scenario.name}** | ${resCurrent.replace(/\n/g, "<br>")} | ${resNew.replace(/\n/g, "<br>")} |\n`;
    console.log("   ✅ Done.");
  }

  const reportPath = path.resolve(process.cwd(), "model_comparison_report.md");
  fs.writeFileSync(reportPath, report);
  console.log(`\n📊 Comparison complete! Report saved to: ${reportPath}`);
}

main().catch(console.error);
