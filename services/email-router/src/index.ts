/**
 * SOPHIA Email Router — Entry Point
 *
 * Polls info@zyprus.com via IMAP every 30 minutes.
 * Forwards emails to agents by region, creates draft replies from templates.
 *
 * Railway deployment: runs as HTTP server (health check) + interval timer.
 */

import http from "node:http";
import { config } from "./config.js";
import { fetchUnreadEmails, forwardEmail, markAsRead } from "./gmail.js";
import { shouldSkipEmail } from "./filter.js";
import { routeEmail } from "./router.js";
import { createDraftReply } from "./drafter.js";
import { getActiveAgents, isEmailProcessed, logEmailForward, updateRotation } from "./db.js";

let lastRunAt: Date | null = null;
let lastRunStats = { processed: 0, forwarded: 0, skipped: 0, drafts: 0 };
let isRunning = false;

/**
 * Main polling loop — process unread emails
 */
async function processEmails(): Promise<void> {
  if (isRunning) {
    console.log("Previous run still in progress, skipping");
    return;
  }

  isRunning = true;
  const stats = { processed: 0, forwarded: 0, skipped: 0, drafts: 0, errors: 0 };

  try {
    console.log(`[${new Date().toISOString()}] Starting email processing...`);

    // Fetch all active agents (for filtering and routing)
    const agents = await getActiveAgents();
    console.log(`Loaded ${agents.length} active agents`);

    // Fetch unread emails
    const emails = await fetchUnreadEmails();
    console.log(`Found ${emails.length} unread emails`);

    for (const email of emails) {
      try {
        stats.processed++;

        // Deduplication: skip if already processed
        const alreadyProcessed = await isEmailProcessed(email.messageId);
        if (alreadyProcessed) {
          console.log(`Skipping duplicate: "${email.subject}"`);
          await markAsRead(email.uid);
          continue;
        }

        // Filter: skip emails with city names or agent names
        const filterResult = shouldSkipEmail(email.subject, email.textBody, agents);

        if (filterResult.skip) {
          console.log(`Skipping: "${email.subject}" — ${filterResult.reason}`);
          stats.skipped++;

          await logEmailForward({
            gmail_message_id: email.messageId,
            from_email: email.from,
            subject: email.subject,
            body_preview: email.textBody.substring(0, 500),
            forwarded_to_agent_id: null,
            forwarded_to_email: null,
            region: null,
            routing_reason: null,
            draft_created: false,
            draft_template_name: null,
            skipped: true,
            skip_reason: filterResult.reason,
          });

          await markAsRead(email.uid);
          continue;
        }

        // Route: determine which agent gets this email
        const route = await routeEmail(email.subject, email.textBody, email.from, agents);

        if (!route) {
          console.warn(`No route found for: "${email.subject}"`);
          await logEmailForward({
            gmail_message_id: email.messageId,
            from_email: email.from,
            subject: email.subject,
            body_preview: email.textBody.substring(0, 500),
            forwarded_to_agent_id: null,
            forwarded_to_email: null,
            region: null,
            routing_reason: "No route found",
            draft_created: false,
            draft_template_name: null,
            skipped: true,
            skip_reason: "No matching route",
          });
          await markAsRead(email.uid);
          continue;
        }

        // Forward the email
        const forwarded = await forwardEmail(
          email,
          route.agent.communication_email,
          route.agent.full_name
        );

        if (forwarded) {
          stats.forwarded++;
          await updateRotation(route.region, route.agent.id);
        }

        // Create a draft reply using best-matching template
        const draftResult = await createDraftReply(email);
        if (draftResult.created) {
          stats.drafts++;
        }

        // Log to database
        await logEmailForward({
          gmail_message_id: email.messageId,
          from_email: email.from,
          subject: email.subject,
          body_preview: email.textBody.substring(0, 500),
          forwarded_to_agent_id: route.agent.id,
          forwarded_to_email: route.agent.communication_email,
          region: route.region,
          routing_reason: route.reason,
          draft_created: draftResult.created,
          draft_template_name: draftResult.templateName,
          skipped: false,
          skip_reason: null,
        });

        // Mark as read after successful processing
        await markAsRead(email.uid);

        console.log(
          `Processed: "${email.subject}" → ${route.agent.full_name} (${route.agent.communication_email}) [${route.reason}]${draftResult.created ? ` + draft (${draftResult.templateName})` : ""}`
        );
      } catch (emailErr) {
        stats.errors++;
        console.error(`Error processing email "${email.subject}":`, emailErr);
      }
    }

    lastRunAt = new Date();
    lastRunStats = stats;
    console.log(
      `[${lastRunAt.toISOString()}] Done. Processed: ${stats.processed}, Forwarded: ${stats.forwarded}, Skipped: ${stats.skipped}, Drafts: ${stats.drafts}, Errors: ${stats.errors}`
    );
  } catch (err) {
    console.error("Email processing failed:", err);
  } finally {
    isRunning = false;
  }
}

/**
 * HTTP health check server (Railway needs this)
 */
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "sophia-email-router",
        lastRun: lastRunAt?.toISOString() || null,
        lastStats: lastRunStats,
        isRunning,
        nextRunIn: lastRunAt
          ? `${Math.max(0, Math.round((config.polling.intervalMs - (Date.now() - lastRunAt.getTime())) / 1000))}s`
          : "starting soon",
      })
    );
    return;
  }

  // Manual trigger endpoint
  if (req.url === "/trigger" && req.method === "POST") {
    if (isRunning) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Already running" }));
      return;
    }
    processEmails().catch(console.error);
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "triggered" }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

// Start server
server.listen(config.port, () => {
  console.log(`SOPHIA Email Router listening on port ${config.port}`);
  console.log(`Polling interval: ${config.polling.intervalMs / 1000}s`);

  // Run immediately on startup
  processEmails().catch(console.error);

  // Then run on interval
  setInterval(() => {
    processEmails().catch(console.error);
  }, config.polling.intervalMs);
});
