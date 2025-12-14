/**
 * Template Audit Script
 * Checks all 43 templates in sophia-ai-assistant-instructions.md for common formatting issues
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const INSTRUCTIONS_PATH = join(
  process.cwd(),
  "docs/knowledge/sophia-ai-assistant-instructions.md"
);

interface TemplateIssue {
  template: string;
  line: number;
  issue: string;
  context: string;
}

function auditTemplates() {
  const content = readFileSync(INSTRUCTIONS_PATH, "utf8");
  const lines = content.split("\n");
  const issues: TemplateIssue[] = [];

  let currentTemplate = "";
  let templateStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Detect template headers
    const templateMatch = line.match(/^(?:📌 )?Template (\d+):\s*(.+)/);
    if (templateMatch) {
      currentTemplate = `Template ${templateMatch[1]}: ${templateMatch[2]}`;
      templateStartLine = lineNum;
    }

    if (!currentTemplate) continue;

    // Check 1: Labels not bolded before colon (e.g., "Registration Details:" should be "**Registration Details:**")
    const labelPattern =
      /^(Registration Details|Fees|Viewing Arranged for|Property|My Mobile|Client Phone|Date|Time|Address):\s/;
    if (labelPattern.test(line) && !line.includes("**")) {
      issues.push({
        template: currentTemplate,
        line: lineNum,
        issue: "Label before colon not bolded",
        context: line.substring(0, 80),
      });
    }

    // Check 2: Wrong fee format (should be "5%+ VAT" not "5% + VAT" or "5%VAT")
    if (line.includes("5%VAT") && !line.includes("5%+ VAT")) {
      issues.push({
        template: currentTemplate,
        line: lineNum,
        issue: "Fee format wrong - should be '5%+ VAT' not '5%VAT'",
        context: line.substring(0, 80),
      });
    }
    if (line.includes("5% + VAT")) {
      issues.push({
        template: currentTemplate,
        line: lineNum,
        issue: "Fee format wrong - should be '5%+ VAT' not '5% + VAT'",
        context: line.substring(0, 80),
      });
    }

    // Check 3: Value bolded instead of label (e.g., "Fees: **5%**" wrong, "**Fees:** 5%" correct)
    const wrongBoldPattern = /^([A-Za-z\s]+):\s*\*\*[^*]+\*\*/;
    const correctBoldPattern = /^\*\*[A-Za-z\s]+:\*\*/;
    if (wrongBoldPattern.test(line) && !correctBoldPattern.test(line)) {
      // Skip if it's bolding 30% in "first **30%** payment" which is correct
      if (
        !line.includes("first **30%** payment") &&
        !line.includes("**Yes I confirm**")
      ) {
        issues.push({
          template: currentTemplate,
          line: lineNum,
          issue:
            "Value bolded instead of label (label before colon should be bold)",
          context: line.substring(0, 80),
        });
      }
    }

    // Check 4: Missing "EXACT EMAIL FORMAT" header for email templates
    if (line.includes("Email Body:") && i > 0) {
      const prevLines = lines.slice(Math.max(0, i - 10), i).join("\n");
      if (
        !prevLines.includes("EXACT EMAIL FORMAT") &&
        !prevLines.includes("EXACT FORMAT")
      ) {
        // Only flag for templates 01-08, 14, 17-43 (email templates)
        const templateNum = currentTemplate.match(/Template (\d+)/)?.[1];
        if (templateNum) {
          const num = Number.parseInt(templateNum);
          const isEmailTemplate =
            (num >= 1 && num <= 8) || num === 14 || (num >= 17 && num <= 43);
          if (isEmailTemplate) {
            issues.push({
              template: currentTemplate,
              line: lineNum,
              issue:
                "Missing 'EXACT EMAIL FORMAT (COPY CHARACTER BY CHARACTER):' header",
              context: "Email Body: appears without format instruction",
            });
          }
        }
      }
    }

    // Check 5: Placeholder not replaced (e.g., [CLIENT_NAMES] still in example)
    // Skip this in "Required Fields" section
    if (
      line.includes("[CLIENT_NAMES]") ||
      line.includes("[PROPERTY]") ||
      line.includes("[DATE]")
    ) {
      // This is expected in templates, but flag if in "Example Output" section
      if (
        lines
          .slice(Math.max(0, i - 20), i)
          .join("\n")
          .includes("Example Output")
      ) {
        issues.push({
          template: currentTemplate,
          line: lineNum,
          issue: "Placeholder found in Example Output section",
          context: line.substring(0, 80),
        });
      }
    }

    // Check 6: "Yes I confirm" not bolded (handles both '' and "" quotes)
    if (line.includes("Yes I confirm") || line.includes("Yes I Confirm")) {
      const isBolded =
        line.includes('**"Yes I confirm"**') ||
        line.includes("**''Yes I confirm''**") ||
        line.includes('**"Yes I Confirm"**') ||
        line.includes("**''Yes I Confirm''**") ||
        line.includes("**Yes I confirm**") ||
        line.includes("**Yes I Confirm**");
      if (!isBolded) {
        issues.push({
          template: currentTemplate,
          line: lineNum,
          issue: "'Yes I confirm' should be bolded",
          context: line.substring(0, 80),
        });
      }
    }

    // Check 7: Subject line formatting
    if (line.startsWith("Subject:") && line.includes("**")) {
      issues.push({
        template: currentTemplate,
        line: lineNum,
        issue: "Subject line should NOT contain bold formatting",
        context: line.substring(0, 80),
      });
    }
  }

  // Print results
  console.log("\n🔍 TEMPLATE AUDIT RESULTS\n");
  console.log(`Found ${issues.length} potential issues:\n`);

  // Group by template
  const byTemplate = new Map<string, TemplateIssue[]>();
  for (const issue of issues) {
    if (!byTemplate.has(issue.template)) {
      byTemplate.set(issue.template, []);
    }
    byTemplate.get(issue.template)!.push(issue);
  }

  for (const [template, templateIssues] of byTemplate) {
    console.log(`\n📄 ${template}`);
    for (const issue of templateIssues) {
      console.log(`   Line ${issue.line}: ${issue.issue}`);
      console.log(`   Context: "${issue.context}"`);
    }
  }

  if (issues.length === 0) {
    console.log("✅ No issues found!");
  }

  return issues;
}

auditTemplates();
