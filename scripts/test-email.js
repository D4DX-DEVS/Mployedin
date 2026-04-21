const path = require("path");
const fs = require("fs");

// Load .env manually
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const nodemailer = require("nodemailer");

const host = process.env.EMAIL_HOST || process.env.SMTP_HOST;
const port = parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT || "587");
const secure = (process.env.EMAIL_SECURE || process.env.SMTP_SECURE) === "true";
const user = process.env.EMAIL_USER || process.env.SMTP_USER;
const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
const from = process.env.EMAIL_FROM || `MPLOYEDIN <${user}>`;

console.log("Config:", { host, port, secure, user, from });
console.log("Sending test email to xbeatlover@gmail.com ...");

const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#0D6FD8;padding:24px;border-radius:8px 8px 0 0">
    <h1 style="color:white;margin:0;font-size:24px">MPLOYEDIN</h1>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p>Hello!</p>
    <p>This is a <strong>test notification email</strong> from the MPLOYEDIN platform.</p>
    <p>If you are reading this, the Nodemailer SMTP configuration is working correctly.</p>
    <div style="background:#f3f4f6;padding:12px;border-radius:6px;font-size:13px;color:#374151">
      <strong>SMTP Details:</strong><br>
      Host: ${host}:${port}<br>
      From: ${user}<br>
      Secure: ${secure}<br>
      Timestamp: ${new Date().toISOString()}
    </div>
    <p style="color:#6b7280;font-size:14px;margin-top:16px">
      Best regards,<br>The MPLOYEDIN Team
    </p>
  </div>
</div>
`;

transporter.sendMail({
  from,
  to: "xbeatlover@gmail.com",
  subject: "MPLOYEDIN — Nodemailer Test Notification",
  html,
}).then((info) => {
  console.log("SUCCESS! Message sent.");
  console.log("Message ID:", info.messageId);
  console.log("Response:", info.response);
  process.exit(0);
}).catch((err) => {
  console.error("FAILED:", err.message);
  if (err.code) console.error("Error code:", err.code);
  process.exit(1);
});
