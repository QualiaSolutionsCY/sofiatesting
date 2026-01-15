import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Skip initialization during build time - return stub when config is missing
const hasConfig = !!supabaseUrl && !!supabaseServiceKey;

export const supabaseAdmin: SupabaseClient = hasConfig
  ? createClient(supabaseUrl, supabaseServiceKey)
  : (null as unknown as SupabaseClient);

/**
 * Upload a file to Supabase Storage
 */
export async function uploadToSupabaseStorage({
  file,
  bucket,
  path,
  contentType,
}: {
  file: Buffer | Uint8Array;
  bucket: string;
  path: string;
  contentType: string;
}) {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, file, {
        contentType,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Supabase storage upload error:", error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);

    return {
      success: true,
      path: data.path,
      publicUrl,
    };
  } catch (error) {
    console.error("Storage upload failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate a unique file path for uploads
 */
export function generateFilePath({
  chatId,
  fileName,
  fileType = "document",
}: {
  chatId: string;
  fileName: string;
  fileType?: string;
}): string {
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `${fileType}/${chatId}/${timestamp}_${sanitizedFileName}`;
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteFromSupabaseStorage({
  bucket,
  path,
}: {
  bucket: string;
  path: string;
}) {
  try {
    const { error } = await supabaseAdmin.storage.from(bucket).remove([path]);

    if (error) {
      console.error("Supabase storage delete error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Storage delete failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
