/**
 * Image Persistence Service
 * Re-uploads decrypted WhatsApp images to Supabase Storage for stable URLs
 *
 * Problem: WaSenderAPI decrypted URLs expire after ~1 hour
 * Solution: Persist images to Supabase Storage immediately after decryption
 *
 * This solves LIST-06 where delayed/retried Zyprus uploads fail due to expired URLs
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Persist a single image to Supabase Storage
 *
 * @param url - Temporary decrypted URL from WaSenderAPI
 * @param index - Image index for logging and filename generation
 * @returns Public Supabase Storage URL or null on failure
 */
export async function persistImage(url: string, index: number): Promise<string | null> {
  try {
    // Fetch from temporary URL
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[ImagePersist] Failed to fetch image ${index}: ${response.status}`);
      return null;
    }

    // Determine extension from content-type
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

    // Get image data
    const imageBlob = await response.blob();
    const imageBuffer = await imageBlob.arrayBuffer();

    // Generate unique filename
    const filename = `whatsapp-images/wa_img_${Date.now()}_${index}.${ext}`;

    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from("documents")
      .upload(filename, imageBuffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error(`[ImagePersist] Upload failed for image ${index}:`, error);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("documents")
      .getPublicUrl(filename);

    console.log(`[ImagePersist] Persisted image ${index} to: ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (err) {
    console.error(`[ImagePersist] Error for image ${index}:`, err);
    return null;
  }
}

/**
 * Persist multiple images to Supabase Storage in parallel
 *
 * @param urls - Array of temporary decrypted URLs from WaSenderAPI
 * @returns Array of public Supabase Storage URLs (failures filtered out)
 */
export async function persistImages(urls: string[]): Promise<string[]> {
  if (urls.length === 0) return [];

  console.log(`[ImagePersist] Persisting ${urls.length} images to Supabase Storage...`);

  const results = await Promise.all(
    urls.map((url, index) => persistImage(url, index))
  );

  // Filter out failures
  const persisted = results.filter((url): url is string => url !== null);

  console.log(`[ImagePersist] Successfully persisted ${persisted.length}/${urls.length} images`);
  return persisted;
}
