import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

/**
 * Generate a DOCX document from text content
 * Converts markdown-style formatting to Word document format
 */
export async function generateDocx(content: string): Promise<Buffer> {
  // Parse content into paragraphs
  const lines = content.split("\n");
  const paragraphs: Paragraph[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      // Empty line = paragraph break
      paragraphs.push(new Paragraph({ text: "" }));
      continue;
    }

    // Check for headings (lines starting with #)
    if (line.trim().startsWith("# ")) {
      paragraphs.push(
        new Paragraph({
          text: line.trim().substring(2),
          heading: HeadingLevel.HEADING_1,
        })
      );
      continue;
    }

    if (line.trim().startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          text: line.trim().substring(3),
          heading: HeadingLevel.HEADING_2,
        })
      );
      continue;
    }

    if (line.trim().startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          text: line.trim().substring(4),
          heading: HeadingLevel.HEADING_3,
        })
      );
      continue;
    }

    // Parse bold text (**text**)
    const textRuns: TextRun[] = [];
    let remainingText = line;
    let boldStart = remainingText.indexOf("**");

    while (boldStart !== -1) {
      // Add text before bold
      if (boldStart > 0) {
        textRuns.push(new TextRun(remainingText.substring(0, boldStart)));
      }

      // Find end of bold
      const boldEnd = remainingText.indexOf("**", boldStart + 2);
      if (boldEnd === -1) {
        // Unclosed bold, treat as regular text
        textRuns.push(new TextRun(remainingText.substring(boldStart)));
        break;
      }

      // Add bold text
      const boldText = remainingText.substring(boldStart + 2, boldEnd);
      textRuns.push(
        new TextRun({
          text: boldText,
          bold: true,
        })
      );

      // Continue with remaining text
      remainingText = remainingText.substring(boldEnd + 2);
      boldStart = remainingText.indexOf("**");
    }

    // Add any remaining text
    if (remainingText.length > 0) {
      textRuns.push(new TextRun(remainingText));
    }

    // If no text runs (shouldn't happen), add the whole line
    if (textRuns.length === 0) {
      textRuns.push(new TextRun(line));
    }

    paragraphs.push(new Paragraph({ children: textRuns }));
  }

  // Create document
  const doc = new Document({
    sections: [
      {
        children: paragraphs,
      },
    ],
  });

  // Generate buffer
  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
