/**
 * Sophia Memory Service
 *
 * Provides RAG-based user recognition, conversation memory, and knowledge base search.
 * Uses Supabase pgvector for semantic similarity search.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logger, LogCategory } from "../utils/logger.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Google AI API for embeddings (check both possible env var names)
const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY") || Deno.env.get("GEMINI_API_KEY");

// Embedding model configuration
const EMBEDDING_MODEL = "text-embedding-004";

// =====================================================
// Embedding Cache (LRU with TTL)
// =====================================================

interface CachedEmbedding {
  embedding: number[];
  timestamp: number;
}

const embeddingCache = new Map<string, CachedEmbedding>();
const CACHE_TTL_MS = 3600000; // 1 hour
const MAX_CACHE_SIZE = 1000;

/**
 * LRU-style cache eviction - remove oldest entries when cache is full
 */
function evictOldestCacheEntries(): void {
  if (embeddingCache.size < MAX_CACHE_SIZE) return;

  // Convert to array, sort by timestamp, remove oldest 10%
  const entries = Array.from(embeddingCache.entries());
  entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

  const toRemove = Math.ceil(MAX_CACHE_SIZE * 0.1);
  for (let i = 0; i < toRemove && i < entries.length; i++) {
    embeddingCache.delete(entries[i][0]);
  }
  logger.debug(`[Memory] Cache eviction: removed ${toRemove} oldest entries`, { category: LogCategory.CACHE });
}

// =====================================================
// Types
// =====================================================

export interface SophiaUserProfile {
  id: string;
  phone_number: string;
  name: string | null;
  preferred_language: "en" | "ar" | "el";
  communication_style: "casual" | "professional" | "formal";
  interests: Record<string, unknown>;
  metadata: Record<string, unknown>;
  first_contact: string;
  last_contact: string;
  total_messages: number;
}

export interface ConversationMemory {
  id: string;
  role: string;
  content: string;
  importance: number;
  topics: string[];
  created_at: string;
  similarity?: number;
}

export interface KnowledgeResult {
  id: string;
  category: string;
  title: string;
  content: string;
  similarity: number;
}

export interface UserContext {
  profile: SophiaUserProfile;
  recentMemories: ConversationMemory[];
  relevantKnowledge: KnowledgeResult[];
}

// =====================================================
// Embedding Generation
// =====================================================

/**
 * Generate embedding vector for text using Google's text-embedding-004 model.
 * Uses in-memory LRU cache with TTL to reduce API calls.
 * Falls back to null if API key not configured.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!GOOGLE_API_KEY) {
    logger.warn("[Memory] GOOGLE_API_KEY not set - embeddings disabled", { category: LogCategory.AI });
    return null;
  }

  // Check cache first (normalize text for consistent keys)
  const cacheKey = text.toLowerCase().trim();
  const cached = embeddingCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.debug("[Memory] Embedding cache HIT", { category: LogCategory.CACHE });
    return cached.embedding;
  }

  try {
    // P1 FIX: Move API key from URL query parameter to x-goog-api-key header
    // This prevents key exposure in server logs, proxy logs, and error reporting
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GOOGLE_API_KEY,
        },
        body: JSON.stringify({
          model: `models/${EMBEDDING_MODEL}`,
          content: {
            parts: [{ text }],
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[Memory] Embedding API error: ${response.status}`, new Error(errorText), { category: LogCategory.AI });
      return null;
    }

    const data = await response.json();
    const embedding = data.embedding?.values || null;

    // Cache the result
    if (embedding) {
      evictOldestCacheEntries();
      embeddingCache.set(cacheKey, {
        embedding,
        timestamp: Date.now(),
      });
      logger.debug(`[Memory] Embedding cached, cache size: ${embeddingCache.size}`, { category: LogCategory.CACHE });
    }

    return embedding;
  } catch (error) {
    logger.error("[Memory] Embedding generation failed", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.AI });
    return null;
  }
}

// =====================================================
// User Profile Management
// =====================================================

/**
 * Get or create a user profile by phone number.
 * Updates last_contact and increments message count.
 */
export async function getOrCreateUser(
  phoneNumber: string,
  name?: string
): Promise<SophiaUserProfile | null> {
  try {
    const { data, error } = await supabase.rpc("get_or_create_sophia_user", {
      p_phone_number: phoneNumber,
      p_name: name || null,
    });

    if (error) {
      logger.error("[Memory] Error getting/creating user", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
      return null;
    }

    return data as SophiaUserProfile;
  } catch (error) {
    logger.error("[Memory] Exception in getOrCreateUser", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
    return null;
  }
}

/**
 * Update user preferences (language, communication style, interests).
 */
export async function updateUserPreferences(
  userId: string,
  updates: {
    name?: string;
    preferred_language?: "en" | "ar" | "el";
    communication_style?: "casual" | "professional" | "formal";
    interests?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("update_sophia_user_preferences", {
      p_user_id: userId,
      p_name: updates.name || null,
      p_preferred_language: updates.preferred_language || null,
      p_communication_style: updates.communication_style || null,
      p_interests: updates.interests || null,
      p_metadata: updates.metadata || null,
    });

    if (error) {
      logger.error("[Memory] Error updating preferences", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("[Memory] Exception in updateUserPreferences", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
    return false;
  }
}

// =====================================================
// Conversation Memory
// =====================================================

/**
 * Store a message in conversation memory with embedding.
 */
export async function storeMemory(
  userId: string,
  role: "user" | "assistant",
  content: string,
  options: {
    importance?: number;
    topics?: string[];
    entities?: Record<string, unknown>;
  } = {}
): Promise<boolean> {
  try {
    // Generate embedding for the content
    const embedding = await generateEmbedding(content);

    const { error } = await supabase.from("sophia_conversation_memory").insert({
      user_id: userId,
      role,
      content,
      embedding,
      importance: options.importance || 0.5,
      topics: options.topics || [],
      entities: options.entities || {},
    });

    if (error) {
      logger.error("[Memory] Error storing memory", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("[Memory] Exception in storeMemory", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
    return false;
  }
}

/**
 * Search conversation memory for semantically similar content.
 */
export async function searchMemory(
  userId: string,
  query: string,
  options: {
    limit?: number;
    minImportance?: number;
  } = {}
): Promise<ConversationMemory[]> {
  try {
    const embedding = await generateEmbedding(query);

    if (!embedding) {
      // Fallback to recent messages if embedding fails
      return getRecentMemories(userId, options.limit || 5);
    }

    return searchMemoryWithEmbedding(userId, embedding, options);
  } catch (error) {
    logger.error("[Memory] Exception in searchMemory", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
    return [];
  }
}

/**
 * Search conversation memory with pre-computed embedding.
 * Used to avoid duplicate embedding API calls when searching multiple sources.
 */
export async function searchMemoryWithEmbedding(
  userId: string,
  embedding: number[],
  options: {
    limit?: number;
    minImportance?: number;
  } = {}
): Promise<ConversationMemory[]> {
  try {
    const { data, error } = await supabase.rpc("search_sophia_memory", {
      p_user_id: userId,
      query_embedding: embedding,
      match_count: options.limit || 5,
      min_importance: options.minImportance || 0.0,
    });

    if (error) {
      logger.error("[Memory] Error searching memory", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error("[Memory] Exception in searchMemoryWithEmbedding", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
    return [];
  }
}

/**
 * Get recent conversation memories (without semantic search).
 */
export async function getRecentMemories(
  userId: string,
  limit: number = 10
): Promise<ConversationMemory[]> {
  try {
    const { data, error } = await supabase.rpc("get_sophia_recent_context", {
      p_user_id: userId,
      message_count: limit,
    });

    if (error) {
      logger.error("[Memory] Error getting recent context", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error("[Memory] Exception in getRecentMemories", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
    return [];
  }
}

// =====================================================
// Knowledge Base Search
// =====================================================

/**
 * Search the knowledge base for relevant information.
 */
export async function searchKnowledge(
  query: string,
  options: {
    limit?: number;
    category?: string;
    language?: string;
  } = {}
): Promise<KnowledgeResult[]> {
  try {
    const embedding = await generateEmbedding(query);

    if (!embedding) {
      logger.warn("[Memory] Knowledge search skipped - no embedding", { category: LogCategory.AI });
      return [];
    }

    return searchKnowledgeWithEmbedding(embedding, options);
  } catch (error) {
    logger.error("[Memory] Exception in searchKnowledge", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
    return [];
  }
}

/**
 * Search knowledge base with pre-computed embedding.
 * Used to avoid duplicate embedding API calls when searching multiple sources.
 */
export async function searchKnowledgeWithEmbedding(
  embedding: number[],
  options: {
    limit?: number;
    category?: string;
    language?: string;
  } = {}
): Promise<KnowledgeResult[]> {
  try {
    const { data, error } = await supabase.rpc("search_sophia_knowledge", {
      query_embedding: embedding,
      match_count: options.limit || 5,
      filter_category: options.category || null,
      filter_language: options.language || null,
    });

    if (error) {
      logger.error("[Memory] Error searching knowledge", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error("[Memory] Exception in searchKnowledgeWithEmbedding", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
    return [];
  }
}

// =====================================================
// User Context Builder
// =====================================================

/**
 * Build complete user context for AI prompt enhancement.
 * Includes profile, relevant memories, and knowledge base results.
 *
 * P1 FIX: Parallelized operations to reduce latency from 700-1200ms to ~300-500ms
 * - Generate embedding ONCE and share across searches
 * - Run independent operations in parallel with Promise.all
 */
export async function buildUserContext(
  phoneNumber: string,
  currentMessage: string,
  userName?: string
): Promise<UserContext | null> {
  try {
    const startTime = Date.now();

    // PHASE 1: Generate embedding ONCE (will be reused for both searches)
    // This also benefits from the new cache
    const messageEmbedding = await generateEmbedding(currentMessage);

    // PHASE 2: Get user profile (needed before we can query their memories)
    const profile = await getOrCreateUser(phoneNumber, userName);

    if (!profile) {
      logger.warn("[Memory] Could not get/create user profile", { category: LogCategory.DATABASE });
      return null;
    }

    // PHASE 3: Parallelize semantic searches with shared embedding
    // Also fetch recent memories now that we have profile.id
    let relevantMemories: ConversationMemory[] = [];
    let relevantKnowledge: KnowledgeResult[] = [];
    let fetchedRecentMemories: ConversationMemory[] = [];

    if (messageEmbedding) {
      // Run semantic searches in parallel with recent memories fetch
      [relevantMemories, relevantKnowledge, fetchedRecentMemories] = await Promise.all([
        searchMemoryWithEmbedding(profile.id, messageEmbedding, {
          limit: 5,
          minImportance: 0.3,
        }),
        searchKnowledgeWithEmbedding(messageEmbedding, {
          limit: 3,
          language: profile.preferred_language,
        }),
        getRecentMemories(profile.id, 5),
      ]);
    } else {
      // Fallback: just get recent memories if embedding failed
      fetchedRecentMemories = await getRecentMemories(profile.id, 5);
    }

    // Combine and deduplicate memories
    const allMemories = [...relevantMemories];
    for (const recent of fetchedRecentMemories) {
      if (!allMemories.find((m) => m.id === recent.id)) {
        allMemories.push(recent);
      }
    }

    const duration = Date.now() - startTime;
    logger.debug(`[Memory] buildUserContext completed in ${duration}ms`, { category: LogCategory.DATABASE, duration });

    return {
      profile,
      recentMemories: allMemories.slice(0, 10),
      relevantKnowledge,
    };
  } catch (error) {
    logger.error("[Memory] Exception in buildUserContext", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
    return null;
  }
}

// =====================================================
// Context Formatting for Prompts
// =====================================================

/**
 * Format user context as a string to append to system prompt.
 *
 * P2 FIX: Removed phone number from context to prevent PII exposure to AI providers.
 * Phone numbers should not be sent to third-party AI APIs (OpenRouter/Gemini).
 */
export function formatContextForPrompt(context: UserContext): string {
  const lines: string[] = [];

  // User profile section
  lines.push("---");
  lines.push("## 🧠 PERSONALIZATION CONTEXT (RAG-Enhanced)");
  lines.push("");
  lines.push("### User Profile");
  lines.push(`- **Name**: ${context.profile.name || "Unknown"}`);
  // P2 FIX: Phone number removed - PII should not be sent to AI providers
  lines.push(`- **User ID**: ${context.profile.id.slice(0, 8)}...`);
  lines.push(`- **Preferred Language**: ${context.profile.preferred_language}`);
  lines.push(`- **Communication Style**: ${context.profile.communication_style}`);
  lines.push(`- **Total Messages**: ${context.profile.total_messages}`);
  lines.push(`- **First Contact**: ${context.profile.first_contact}`);

  // Interests if available
  if (Object.keys(context.profile.interests).length > 0) {
    lines.push(`- **Interests**: ${JSON.stringify(context.profile.interests)}`);
  }

  // Relevant memories section
  if (context.recentMemories.length > 0) {
    lines.push("");
    lines.push("### Relevant Past Conversations");
    lines.push("(Use these to personalize your response and maintain context)");
    lines.push("");

    for (const memory of context.recentMemories.slice(0, 5)) {
      const role = memory.role === "user" ? "User" : "SOPHIA";
      const preview = memory.content.length > 200
        ? memory.content.substring(0, 200) + "..."
        : memory.content;
      lines.push(`- **${role}**: "${preview}"`);
    }
  }

  // Relevant knowledge section
  if (context.relevantKnowledge.length > 0) {
    lines.push("");
    lines.push("### Relevant Knowledge Base Entries");
    lines.push("(Reference these when answering related questions)");
    lines.push("");

    for (const knowledge of context.relevantKnowledge) {
      lines.push(`**${knowledge.title}** (${knowledge.category})`);
      const preview = knowledge.content.length > 300
        ? knowledge.content.substring(0, 300) + "..."
        : knowledge.content;
      lines.push(`> ${preview}`);
      lines.push("");
    }
  }

  lines.push("---");

  return lines.join("\n");
}

// =====================================================
// Language Detection
// =====================================================

/**
 * Detect the language of a message.
 * Returns language code: 'en', 'ar', 'el'
 */
export function detectLanguage(text: string): "en" | "ar" | "el" {
  // Check for Arabic characters
  if (/[\u0600-\u06FF]/.test(text)) {
    return "ar";
  }

  // Check for Greek characters
  if (/[\u0370-\u03FF]/.test(text)) {
    return "el";
  }

  // Default to English
  return "en";
}

// =====================================================
// Topic Extraction
// =====================================================

/**
 * Extract topics from a message for tagging.
 */
export function extractTopics(text: string): string[] {
  const topics: string[] = [];
  const lowerText = text.toLowerCase();

  // Real estate topics
  const topicPatterns: Record<string, string[]> = {
    "property-search": ["looking for", "searching for", "want to buy", "want to rent"],
    "property-sale": ["selling", "sell my", "list my property", "want to sell"],
    "mortgage": ["mortgage", "loan", "financing", "bank"],
    "legal": ["lawyer", "solicitor", "contract", "title deed", "legal"],
    "tax": ["tax", "vat", "transfer fee", "capital gains"],
    "residency": ["residency", "pr", "permanent resident", "immigration"],
    "viewing": ["viewing", "visit", "see the property", "schedule"],
    "documents": ["document", "form", "agreement", "contract"],
    "pricing": ["price", "cost", "how much", "budget", "afford"],
    "location": ["nicosia", "limassol", "paphos", "larnaca", "famagusta", "ayia napa"],
    "property-type": ["apartment", "villa", "house", "land", "office", "shop"],
  };

  for (const [topic, patterns] of Object.entries(topicPatterns)) {
    for (const pattern of patterns) {
      if (lowerText.includes(pattern)) {
        topics.push(topic);
        break;
      }
    }
  }

  return [...new Set(topics)]; // Remove duplicates
}

/**
 * Calculate importance score for a message.
 * Higher for messages with important topics or explicit importance markers.
 */
export function calculateImportance(text: string, topics: string[]): number {
  let score = 0.5; // Base score

  // Important topics boost
  const importantTopics = ["legal", "tax", "residency", "mortgage", "property-sale"];
  for (const topic of topics) {
    if (importantTopics.includes(topic)) {
      score += 0.1;
    }
  }

  // Question marks indicate queries - moderately important
  if (text.includes("?")) {
    score += 0.1;
  }

  // Exclamation marks may indicate urgency
  if (text.includes("!")) {
    score += 0.05;
  }

  // Long messages are often more detailed
  if (text.length > 200) {
    score += 0.1;
  }

  // Cap at 1.0
  return Math.min(score, 1.0);
}

