/**
 * Quick test for Resend email functionality
 * Run: RESEND_API_KEY=your_key pnpm exec tsx tests/manual/test-resend-email.ts
 */

import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  console.error("❌ RESEND_API_KEY not set");
  console.log("Run with: RESEND_API_KEY=re_xxxx pnpm exec tsx tests/manual/test-resend-email.ts");
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);

const sendTestEmail = async () => {
  console.log("📧 Sending test email from sofia@zyprus.com...\n");

  try {
    const { data, error } = await resend.emails.send({
      from: "SOFIA <sofia@zyprus.com>",
      to: "fawzi.ygoussous@gmail.com",
      subject: "Test Email from SOFIA - Domain Verification Successful! 🎉",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c5282;">Hello Fawzi!</h2>

          <p style="color: #333; line-height: 1.6;">
            This is a test email from <strong>SOFIA</strong>, your AI assistant at Zyprus Property Group.
          </p>

          <div style="background: #f0fff4; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #48bb78;">
            <h3 style="color: #276749; margin-top: 0;">✅ Domain Verification Successful!</h3>
            <p style="color: #333; margin-bottom: 0;">
              The <code>zyprus.com</code> domain has been verified with Resend.
              SOFIA can now send emails directly to clients!
            </p>
          </div>

          <p style="color: #444;">
            <strong>What this means:</strong>
          </p>
          <ul style="color: #555;">
            <li>WhatsApp users can ask SOFIA to email documents</li>
            <li>DOCX attachments work (property docs, contracts, etc.)</li>
            <li>Emails come from <code>sofia@zyprus.com</code></li>
          </ul>

          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0 20px 0;" />

          <p style="color: #666; font-size: 14px;">
            Best regards,<br/>
            <strong>SOFIA</strong><br/>
            AI Assistant - Zyprus Property Group
          </p>

          <p style="color: #999; font-size: 11px; margin-top: 20px;">
            Test sent at: ${new Date().toISOString()}
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("❌ Resend error:", error);
      return;
    }

    console.log("✅ Email sent successfully!");
    console.log("📬 Message ID:", data?.id);
    console.log("\n📥 Check fawzi.ygoussous@gmail.com for the test email.");
  } catch (err) {
    console.error("❌ Error:", err);
  }
};

sendTestEmail();
