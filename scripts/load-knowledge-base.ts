/**
 * Load PowerPoint presentations into Sophia's RAG knowledge base
 *
 * Usage: npx tsx scripts/load-knowledge-base.ts
 *
 * Requires:
 * - GOOGLE_API_KEY env var (for embeddings)
 * - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// For reading PPTX files
import JSZip from "jszip";
// @ts-ignore - xml2js types
import { parseStringPromise } from "xml2js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vceeheaxcrhmpqueudqx.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!SUPABASE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!GOOGLE_API_KEY) {
  console.error("Missing GOOGLE_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const KNOWLEDGE_DIR = path.join(__dirname, "../docs/knowledge/presentations");
const EMBEDDING_MODEL = "text-embedding-004";

interface KnowledgeChunk {
  category: string;
  title: string;
  content: string;
  tags: string[];
  language: string;
}

/**
 * Extract text from a PowerPoint file
 */
async function extractTextFromPptx(filePath: string): Promise<string[]> {
  const slides: string[] = [];

  try {
    const data = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);

    // Get all slide XML files
    const slideFiles = Object.keys(zip.files)
      .filter(name => name.match(/ppt\/slides\/slide\d+\.xml/))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] || "0");
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] || "0");
        return numA - numB;
      });

    for (const slideFile of slideFiles) {
      const xmlContent = await zip.files[slideFile].async("string");
      const parsed = await parseStringPromise(xmlContent);

      // Extract text from the slide
      const texts: string[] = [];
      extractTextsFromNode(parsed, texts);

      if (texts.length > 0) {
        slides.push(texts.join("\n"));
      }
    }
  } catch (error) {
    console.error(`Error extracting from ${filePath}:`, error);
  }

  return slides;
}

/**
 * Recursively extract text nodes from XML
 */
function extractTextsFromNode(node: any, texts: string[]): void {
  if (!node) return;

  if (typeof node === "string") {
    const trimmed = node.trim();
    if (trimmed) texts.push(trimmed);
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      extractTextsFromNode(item, texts);
    }
    return;
  }

  if (typeof node === "object") {
    // Check for text content in common PPTX text elements
    if (node["a:t"]) {
      extractTextsFromNode(node["a:t"], texts);
    }

    // Recursively process all properties
    for (const key of Object.keys(node)) {
      extractTextsFromNode(node[key], texts);
    }
  }
}

/**
 * Generate embedding using Google's text-embedding-004
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GOOGLE_API_KEY!,
        },
        body: JSON.stringify({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
        }),
      }
    );

    if (!response.ok) {
      console.error("Embedding API error:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.embedding?.values || null;
  } catch (error) {
    console.error("Embedding generation error:", error);
    return null;
  }
}

/**
 * Chunk slides into meaningful sections
 */
function chunkContent(slides: string[], title: string): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];

  // Derive category and tags from filename
  const category = deriveCategory(title);
  const tags = deriveTags(title);

  // Group slides into chunks (2-3 slides per chunk for context)
  const SLIDES_PER_CHUNK = 2;

  for (let i = 0; i < slides.length; i += SLIDES_PER_CHUNK) {
    const slideGroup = slides.slice(i, i + SLIDES_PER_CHUNK);
    const content = slideGroup.join("\n\n---\n\n");

    if (content.trim().length > 50) { // Skip very short chunks
      chunks.push({
        category,
        title: `${title} (Slides ${i + 1}-${Math.min(i + SLIDES_PER_CHUNK, slides.length)})`,
        content: content.trim(),
        tags,
        language: "en",
      });
    }
  }

  return chunks;
}

/**
 * Derive category from filename
 */
function deriveCategory(filename: string): string {
  const lower = filename.toLowerCase();

  if (lower.includes("vat")) return "taxation";
  if (lower.includes("tax")) return "taxation";
  if (lower.includes("pr") || lower.includes("residency")) return "immigration";
  if (lower.includes("yield") || lower.includes("investment")) return "investment";
  if (lower.includes("division") || lower.includes("land") || lower.includes("plot")) return "land-development";
  if (lower.includes("sqm") || lower.includes("development")) return "development-regulations";
  if (lower.includes("zoning") || lower.includes("density")) return "zoning";

  return "general";
}

/**
 * Derive tags from filename
 */
function deriveTags(filename: string): string[] {
  const tags: string[] = ["cyprus", "real-estate"];
  const lower = filename.toLowerCase();

  if (lower.includes("vat")) tags.push("vat", "taxation");
  if (lower.includes("tax")) tags.push("taxation", "property-tax");
  if (lower.includes("pr")) tags.push("permanent-residency", "immigration");
  if (lower.includes("residency")) tags.push("tax-residency", "residency");
  if (lower.includes("yield")) tags.push("yield", "roi", "investment");
  if (lower.includes("investment")) tags.push("investment", "returns");
  if (lower.includes("division")) tags.push("land-division", "subdivision");
  if (lower.includes("land")) tags.push("land", "plot");
  if (lower.includes("sqm")) tags.push("building-regulations", "sqm");
  if (lower.includes("development")) tags.push("development", "construction");
  if (lower.includes("zoning")) tags.push("zoning", "regulations");
  if (lower.includes("density")) tags.push("density", "building-coefficient");

  return [...new Set(tags)]; // Remove duplicates
}

/**
 * Insert chunk into knowledge base with embedding
 */
async function insertKnowledge(chunk: KnowledgeChunk): Promise<boolean> {
  // Generate embedding
  const embedding = await generateEmbedding(chunk.content);

  if (!embedding) {
    console.error(`Failed to generate embedding for: ${chunk.title}`);
    return false;
  }

  // Insert into database
  const { error } = await supabase
    .from("sophia_knowledge_base")
    .insert({
      category: chunk.category,
      title: chunk.title,
      content: chunk.content,
      embedding: embedding,
      tags: chunk.tags,
      language: chunk.language,
      metadata: { source: "pptx", loaded_at: new Date().toISOString() },
    });

  if (error) {
    console.error(`Failed to insert: ${chunk.title}`, error);
    return false;
  }

  return true;
}

/**
 * Main function
 */
async function main() {
  console.log("Loading knowledge base from PowerPoint files...\n");

  // Get all PPTX files
  const files = fs.readdirSync(KNOWLEDGE_DIR)
    .filter(f => f.endsWith(".pptx"));

  console.log(`Found ${files.length} PowerPoint files:\n`);
  files.forEach(f => console.log(`  - ${f}`));
  console.log();

  let totalChunks = 0;
  let successCount = 0;

  for (const file of files) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    const title = file.replace(".pptx", "").replace(/_/g, " ");

    console.log(`\nProcessing: ${file}`);

    // Extract text from slides
    const slides = await extractTextFromPptx(filePath);
    console.log(`  Extracted ${slides.length} slides`);

    if (slides.length === 0) {
      console.log(`  Skipping - no text content found`);
      continue;
    }

    // Chunk the content
    const chunks = chunkContent(slides, title);
    console.log(`  Created ${chunks.length} chunks`);

    // Insert each chunk
    for (const chunk of chunks) {
      const success = await insertKnowledge(chunk);
      if (success) {
        successCount++;
        process.stdout.write(".");
      } else {
        process.stdout.write("x");
      }
      totalChunks++;

      // Rate limit - 1 request per 100ms
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log();
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Knowledge base loading complete!`);
  console.log(`  Total chunks: ${totalChunks}`);
  console.log(`  Successful: ${successCount}`);
  console.log(`  Failed: ${totalChunks - successCount}`);
  console.log(`${"=".repeat(50)}\n`);

  // Verify
  const { count } = await supabase
    .from("sophia_knowledge_base")
    .select("*", { count: "exact", head: true });

  console.log(`Total entries in knowledge base: ${count}`);
}

main().catch(console.error);
