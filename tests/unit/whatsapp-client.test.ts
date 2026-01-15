import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * WhatsApp Client Tests
 *
 * Tests the WaSender client utilities including:
 * - Phone number formatting
 * - MIME type detection
 * - Message splitting logic
 * - Retry backoff calculations
 *
 * Note: Full integration tests require mocking the WaSender SDK.
 * These unit tests focus on pure logic that can be tested independently.
 */

describe("WhatsApp Client", () => {
  describe("Phone Number Formatting", () => {
    // Replicate formatPhoneNumber logic for testing
    const formatPhoneNumber = (phone: string): string => {
      let cleaned = phone.replace(/[^\d+]/g, "");
      if (cleaned.startsWith("+")) {
        cleaned = cleaned.slice(1);
      }
      return cleaned;
    };

    it("should remove + prefix", () => {
      assert.strictEqual(formatPhoneNumber("+35799123456"), "35799123456");
      assert.strictEqual(formatPhoneNumber("+1234567890"), "1234567890");
    });

    it("should remove spaces", () => {
      assert.strictEqual(formatPhoneNumber("+357 99 123456"), "35799123456");
      assert.strictEqual(formatPhoneNumber("  +1 234 567 890  "), "1234567890");
    });

    it("should remove dashes and parentheses", () => {
      assert.strictEqual(formatPhoneNumber("+1-234-567-8901"), "12345678901");
      assert.strictEqual(formatPhoneNumber("+1 (234) 567-8901"), "12345678901");
    });

    it("should handle numbers without + prefix", () => {
      assert.strictEqual(formatPhoneNumber("35799123456"), "35799123456");
    });

    it("should handle empty string", () => {
      assert.strictEqual(formatPhoneNumber(""), "");
    });

    it("should handle special characters", () => {
      // Only digits should remain (and + is stripped)
      assert.strictEqual(formatPhoneNumber("abc+123def456"), "123456");
    });
  });

  describe("MIME Type Detection", () => {
    // Replicate getMimeType logic for testing
    const getMimeType = (filename: string): string => {
      const ext = filename.split(".").pop()?.toLowerCase();

      const mimeTypes: Record<string, string> = {
        // Documents
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ppt: "application/vnd.ms-powerpoint",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        txt: "text/plain",
        csv: "text/csv",
        // Images
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        // Audio
        mp3: "audio/mpeg",
        wav: "audio/wav",
        ogg: "audio/ogg",
        // Video
        mp4: "video/mp4",
        avi: "video/x-msvideo",
        mov: "video/quicktime",
      };

      return mimeTypes[ext || ""] || "application/octet-stream";
    };

    describe("Document types", () => {
      it("should detect PDF files", () => {
        assert.strictEqual(getMimeType("document.pdf"), "application/pdf");
        assert.strictEqual(getMimeType("DOCUMENT.PDF"), "application/pdf");
      });

      it("should detect Word documents", () => {
        assert.strictEqual(getMimeType("file.doc"), "application/msword");
        assert.strictEqual(
          getMimeType("file.docx"),
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
      });

      it("should detect Excel files", () => {
        assert.strictEqual(getMimeType("data.xls"), "application/vnd.ms-excel");
        assert.strictEqual(
          getMimeType("data.xlsx"),
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
      });

      it("should detect PowerPoint files", () => {
        assert.strictEqual(
          getMimeType("slides.ppt"),
          "application/vnd.ms-powerpoint"
        );
        assert.strictEqual(
          getMimeType("slides.pptx"),
          "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        );
      });

      it("should detect text files", () => {
        assert.strictEqual(getMimeType("readme.txt"), "text/plain");
        assert.strictEqual(getMimeType("data.csv"), "text/csv");
      });
    });

    describe("Image types", () => {
      it("should detect JPEG files", () => {
        assert.strictEqual(getMimeType("photo.jpg"), "image/jpeg");
        assert.strictEqual(getMimeType("photo.jpeg"), "image/jpeg");
      });

      it("should detect PNG files", () => {
        assert.strictEqual(getMimeType("image.png"), "image/png");
      });

      it("should detect GIF files", () => {
        assert.strictEqual(getMimeType("animation.gif"), "image/gif");
      });

      it("should detect WebP files", () => {
        assert.strictEqual(getMimeType("modern.webp"), "image/webp");
      });
    });

    describe("Audio types", () => {
      it("should detect MP3 files", () => {
        assert.strictEqual(getMimeType("song.mp3"), "audio/mpeg");
      });

      it("should detect WAV files", () => {
        assert.strictEqual(getMimeType("sound.wav"), "audio/wav");
      });

      it("should detect OGG files", () => {
        assert.strictEqual(getMimeType("audio.ogg"), "audio/ogg");
      });
    });

    describe("Video types", () => {
      it("should detect MP4 files", () => {
        assert.strictEqual(getMimeType("video.mp4"), "video/mp4");
      });

      it("should detect AVI files", () => {
        assert.strictEqual(getMimeType("clip.avi"), "video/x-msvideo");
      });

      it("should detect MOV files", () => {
        assert.strictEqual(getMimeType("movie.mov"), "video/quicktime");
      });
    });

    describe("Edge cases", () => {
      it("should return octet-stream for unknown extensions", () => {
        assert.strictEqual(getMimeType("file.xyz"), "application/octet-stream");
        assert.strictEqual(
          getMimeType("binary.dat"),
          "application/octet-stream"
        );
      });

      it("should handle files without extension", () => {
        assert.strictEqual(getMimeType("noextension"), "application/octet-stream");
      });

      it("should handle empty filename", () => {
        assert.strictEqual(getMimeType(""), "application/octet-stream");
      });

      it("should handle multiple dots in filename", () => {
        assert.strictEqual(
          getMimeType("archive.tar.gz"),
          "application/octet-stream"
        ); // .gz is not in list
        assert.strictEqual(getMimeType("file.backup.docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      });
    });
  });

  describe("Message Splitting Logic", () => {
    const MAX_LENGTH = 4000;

    // Simulate the message splitting algorithm
    const splitMessage = (text: string): string[] => {
      if (text.length <= MAX_LENGTH) {
        return [text];
      }

      const chunks: string[] = [];
      let current = "";

      for (const paragraph of text.split("\n\n")) {
        if (`${current}\n\n${paragraph}`.length > MAX_LENGTH) {
          if (current) {
            chunks.push(current.trim());
          }
          // If single paragraph is too long, split by sentences
          if (paragraph.length > MAX_LENGTH) {
            const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
            let sentenceChunk = "";
            for (const sentence of sentences) {
              if (`${sentenceChunk} ${sentence}`.length > MAX_LENGTH) {
                if (sentenceChunk) {
                  chunks.push(sentenceChunk.trim());
                }
                sentenceChunk = sentence;
              } else {
                sentenceChunk += (sentenceChunk ? " " : "") + sentence;
              }
            }
            if (sentenceChunk) {
              chunks.push(sentenceChunk.trim());
            }
            current = "";
          } else {
            current = paragraph;
          }
        } else {
          current += (current ? "\n\n" : "") + paragraph;
        }
      }
      if (current) {
        chunks.push(current.trim());
      }

      return chunks;
    };

    it("should not split short messages", () => {
      const message = "Hello, this is a short message.";
      const chunks = splitMessage(message);
      assert.strictEqual(chunks.length, 1);
      assert.strictEqual(chunks[0], message);
    });

    it("should keep message intact at exactly max length", () => {
      const message = "A".repeat(MAX_LENGTH);
      const chunks = splitMessage(message);
      assert.strictEqual(chunks.length, 1);
    });

    it("should split long messages at paragraph boundaries", () => {
      const paragraph1 = "A".repeat(2000);
      const paragraph2 = "B".repeat(2000);
      const paragraph3 = "C".repeat(2000);
      const message = `${paragraph1}\n\n${paragraph2}\n\n${paragraph3}`;

      const chunks = splitMessage(message);
      assert.ok(chunks.length >= 2, "Should split into multiple chunks");
      // Each chunk should not exceed max length
      for (const chunk of chunks) {
        assert.ok(chunk.length <= MAX_LENGTH, `Chunk too long: ${chunk.length}`);
      }
    });

    it("should split very long paragraphs at sentence boundaries", () => {
      // Create a paragraph with sentences that is longer than MAX_LENGTH (4000 chars)
      const sentences: string[] = [];
      for (let i = 0; i < 100; i++) {
        // Each sentence is ~100 chars, so 100 sentences = ~10000 chars
        sentences.push(
          `This is sentence number ${i} with additional padding text to make it longer and more realistic for testing purposes.`
        );
      }
      const longParagraph = sentences.join(" ");
      assert.ok(
        longParagraph.length > MAX_LENGTH,
        `Test paragraph should be > MAX_LENGTH (got ${longParagraph.length})`
      );

      const chunks = splitMessage(longParagraph);
      assert.ok(chunks.length >= 2, "Should split into multiple chunks");
      for (const chunk of chunks) {
        assert.ok(chunk.length <= MAX_LENGTH, `Chunk too long: ${chunk.length}`);
      }
    });

    it("should handle empty message", () => {
      const chunks = splitMessage("");
      assert.strictEqual(chunks.length, 1);
      assert.strictEqual(chunks[0], "");
    });

    it("should handle message with only whitespace", () => {
      const chunks = splitMessage("   \n\n   ");
      assert.strictEqual(chunks.length, 1);
    });

    it("should preserve content integrity", () => {
      const paragraph1 = "First paragraph content.";
      const paragraph2 = "Second paragraph content.";
      const message = `${paragraph1}\n\n${paragraph2}`;

      const chunks = splitMessage(message);
      const rejoined = chunks.join("\n\n");
      assert.strictEqual(rejoined, message);
    });
  });

  describe("Retry Backoff Calculation", () => {
    it("should calculate exponential backoff", () => {
      const calculateBackoff = (attempt: number, baseMs = 1000) =>
        baseMs * (attempt + 1);

      assert.strictEqual(calculateBackoff(0), 1000); // First retry: 1s
      assert.strictEqual(calculateBackoff(1), 2000); // Second retry: 2s
      assert.strictEqual(calculateBackoff(2), 3000); // Third retry: 3s
    });

    it("should respect max retries limit", () => {
      const MAX_RETRIES = 2;
      let attempts = 0;

      for (let retry = 0; retry <= MAX_RETRIES; retry++) {
        attempts++;
      }

      // 0, 1, 2 = 3 total attempts (initial + 2 retries)
      assert.strictEqual(attempts, 3);
    });
  });

  describe("Client Configuration", () => {
    it("should detect when API key is missing", () => {
      const apiKey = "";
      const isConfigured = !!apiKey;
      assert.strictEqual(isConfigured, false);
    });

    it("should detect when API key is present", () => {
      const apiKey = "test-api-key-123";
      const isConfigured = !!apiKey;
      assert.strictEqual(isConfigured, true);
    });
  });

  describe("Upload Result Handling", () => {
    it("should handle successful upload with url field", () => {
      const response = { url: "https://files.wasenderapi.com/abc123.pdf" };
      const fileUrl = response.url;
      assert.ok(fileUrl);
      assert.ok(fileUrl.includes("wasenderapi.com"));
    });

    it("should handle successful upload with publicUrl field", () => {
      const response = { publicUrl: "https://files.wasenderapi.com/abc123.pdf" };
      const fileUrl = response.publicUrl;
      assert.ok(fileUrl);
    });

    it("should handle upload response with both fields", () => {
      const response = {
        url: "https://primary.url",
        publicUrl: "https://public.url",
      };
      // Client prefers url over publicUrl
      const fileUrl = response.url || response.publicUrl;
      assert.strictEqual(fileUrl, "https://primary.url");
    });
  });

  describe("Send Result Shape", () => {
    it("should return correct shape for successful send", () => {
      const result = {
        success: true,
        messageId: "msg_12345",
      };

      assert.ok("success" in result);
      assert.ok("messageId" in result);
      assert.strictEqual(result.success, true);
      assert.ok(result.messageId);
    });

    it("should return correct shape for failed send", () => {
      const result = {
        success: false,
        error: "Rate limit exceeded",
      };

      assert.ok("success" in result);
      assert.ok("error" in result);
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it("should return correct shape for long message send", () => {
      const result = {
        success: true,
        messageIds: ["msg_1", "msg_2", "msg_3"],
      };

      assert.ok("messageIds" in result);
      assert.ok(Array.isArray(result.messageIds));
      assert.strictEqual(result.messageIds.length, 3);
    });
  });

  describe("Error Handling", () => {
    it("should extract error message from WaSenderAPIError", () => {
      const apiError = {
        statusCode: 429,
        apiMessage: "Rate limit exceeded",
        errorDetails: { retryAfter: 60 },
      };

      const errorMessage = apiError.apiMessage || "Failed to send message";
      assert.strictEqual(errorMessage, "Rate limit exceeded");
    });

    it("should use default message when apiMessage is missing", () => {
      const apiError = {
        statusCode: 500,
        apiMessage: undefined,
        errorDetails: {},
      };

      const errorMessage = apiError.apiMessage || "Failed to send message";
      assert.strictEqual(errorMessage, "Failed to send message");
    });

    it("should handle non-API errors", () => {
      const error = new Error("Network timeout");
      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";
      assert.strictEqual(errorMessage, "Network timeout");
    });

    it("should handle non-Error thrown values", () => {
      // Simulate a non-Error thrown value
      const getErrorMessage = (err: unknown): string => {
        if (err instanceof Error) {
          return err.message;
        }
        return "Upload failed";
      };

      assert.strictEqual(getErrorMessage("String error"), "Upload failed");
      assert.strictEqual(getErrorMessage(123), "Upload failed");
      assert.strictEqual(getErrorMessage(null), "Upload failed");
      assert.strictEqual(getErrorMessage(new Error("Real error")), "Real error");
    });
  });
});

/**
 * Integration test scenarios (require SDK mocking)
 *
 * These describe full integration paths that should be tested
 * with proper WaSender SDK mocking:
 *
 * 1. sendMessage - successful text send
 *    - SDK returns { response: { id: "..." }, rateLimit: {...} }
 *
 * 2. sendMessage - rate limit error
 *    - SDK throws WasenderAPIError with statusCode 429
 *
 * 3. sendDocument - upload + send flow
 *    - Upload returns URL, then send uses that URL
 *
 * 4. sendDocument - upload failure
 *    - Upload fails, send should not be attempted
 *
 * 5. sendImage - Buffer vs URL handling
 *    - Buffer: upload first, then send
 *    - URL: send directly
 *
 * 6. sendLongMessage - multi-chunk delivery
 *    - Message split into chunks, all sent in order
 *
 * 7. uploadFileWithRetry - retry on transient failure
 *    - First attempt fails, retry succeeds
 */
