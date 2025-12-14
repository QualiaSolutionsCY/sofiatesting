import {
  AlignmentType,
  Document,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import fs from "fs";
import path from "path";

// Top-level regex patterns for DOCX generation (performance optimization)
const BOLD_TEXT_PATTERN = /\*\*([^*]+)\*\*/g;
const BOLD_START_PATTERN = /^\*\*/;
const BOLD_END_PATTERN = /\*\*$/;

// Logo path - resolves from project root
const LOGO_PATH = path.join(
  process.cwd(),
  "public",
  "assets",
  "zyprus-logo.png"
);

/**
 * Get logo image data if available
 */
function getLogoImageData(): Buffer | null {
  try {
    if (fs.existsSync(LOGO_PATH)) {
      return fs.readFileSync(LOGO_PATH);
    }
    console.warn("[DOCX] Logo file not found at:", LOGO_PATH);
    return null;
  } catch (error) {
    console.error("[DOCX] Error reading logo:", error);
    return null;
  }
}

/**
 * Parse text with bold markers (**text**) into segments
 */
type TextSegment = {
  text: string;
  bold: boolean;
};

function parseBoldText(line: string): TextSegment[] {
  const parts: TextSegment[] = [];
  // Create a fresh regex instance for each call (avoids lastIndex issues)
  const regex = new RegExp(BOLD_TEXT_PATTERN.source, BOLD_TEXT_PATTERN.flags);
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(line);

  while (match !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      const textBefore = line.slice(lastIndex, match.index);
      if (textBefore) {
        parts.push({ text: textBefore, bold: false });
      }
    }
    // Add the bold text
    parts.push({ text: match[1], bold: true });
    lastIndex = match.index + match[0].length;
    match = regex.exec(line);
  }

  // Add remaining text
  if (lastIndex < line.length) {
    parts.push({ text: line.slice(lastIndex), bold: false });
  }

  // If no parts were added, return the original line
  if (parts.length === 0) {
    parts.push({ text: line, bold: false });
  }

  return parts;
}

/**
 * Generate a DOCX document from text content
 *
 * Handles:
 * - Bold text (**text**)
 * - Line breaks
 * - Basic formatting
 */
export async function generateDocx(content: string): Promise<Buffer> {
  const lines = content.split("\n");
  const children: Paragraph[] = [];

  for (const line of lines) {
    // Skip empty lines but add spacing
    if (!line.trim()) {
      children.push(new Paragraph({ text: "" }));
      continue;
    }

    // Check if line is a header (starts with ** and ends with **)
    if (
      line.startsWith("**") &&
      line.endsWith("**") &&
      !line.includes("**", 2)
    ) {
      // This is a title/header
      const headerText = line
        .replace(BOLD_START_PATTERN, "")
        .replace(BOLD_END_PATTERN, "");
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: headerText,
              bold: true,
              size: 28, // 14pt
            }),
          ],
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
        })
      );
      continue;
    }

    // Handle lines with bold text mixed in
    if (line.includes("**")) {
      const segments = parseBoldText(line);
      children.push(
        new Paragraph({
          children: segments.map(
            (segment) =>
              new TextRun({
                text: segment.text,
                bold: segment.bold,
                size: 24, // 12pt
              })
          ),
          spacing: { after: 100 },
        })
      );
    } else {
      // Plain text line
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              size: 24, // 12pt
            }),
          ],
          spacing: { after: 100 },
        })
      );
    }
  }

  // Create header with Zyprus logo (if available)
  const logoData = getLogoImageData();
  const headerChildren: Paragraph[] = [];

  if (logoData) {
    headerChildren.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: logoData,
            transformation: {
              width: 150, // Logo width in pixels
              height: 45, // Proportional height
            },
            type: "png",
          }),
        ],
        spacing: { after: 200 },
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: headerChildren,
          }),
        },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
