/**
 * WhatsApp communication adapter
 *
 * Supports two providers:
 * 1. Twilio (WHATSAPP_PROVIDER=twilio)
 * 2. WhatsApp Business Cloud API (WHATSAPP_PROVIDER=meta, default)
 */

export interface WhatsAppMessage {
  to: string; // E.164 format e.g. +971501234567
  body: string;
  templateName?: string;
  templateParams?: string[];
}

export interface WhatsAppResult {
  messageId: string;
  status: string;
}

/**
 * Send a WhatsApp message via Meta Cloud API or Twilio
 */
export async function sendWhatsApp(msg: WhatsAppMessage): Promise<WhatsAppResult> {
  const provider = process.env.WHATSAPP_PROVIDER ?? "meta";

  if (provider === "twilio") {
    return sendViaTwilio(msg);
  }
  return sendViaMeta(msg);
}

async function sendViaMeta(msg: WhatsAppMessage): Promise<WhatsAppResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.warn("[WhatsApp] Meta credentials not configured. Message not sent.");
    return { messageId: "mock-" + Date.now(), status: "mock" };
  }

  const body = msg.templateName
    ? {
        messaging_product: "whatsapp",
        to: msg.to,
        type: "template",
        template: {
          name: msg.templateName,
          language: { code: "en_US" },
          components: msg.templateParams?.length
            ? [{ type: "body", parameters: msg.templateParams.map((p) => ({ type: "text", text: p })) }]
            : undefined,
        },
      }
    : {
        messaging_product: "whatsapp",
        to: msg.to,
        type: "text",
        text: { body: msg.body },
      };

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Meta WhatsApp API error: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return { messageId: data.messages?.[0]?.id ?? "unknown", status: "sent" };
}

async function sendViaTwilio(msg: WhatsAppMessage): Promise<WhatsAppResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886"; // Twilio sandbox default

  if (!accountSid || !authToken) {
    console.warn("[WhatsApp] Twilio credentials not configured. Message not sent.");
    return { messageId: "mock-" + Date.now(), status: "mock" };
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      From: from,
      To: `whatsapp:${msg.to}`,
      Body: msg.body,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Twilio API error: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return { messageId: data.sid, status: data.status };
}

// WhatsApp message templates
export const WhatsAppTemplates = {
  applicationConfirmation: (name: string, jobTitle: string) =>
    `Hi ${name}! ✅ Your application for *${jobTitle}* on MPLOYEDIN has been received. We'll keep you updated here. Good luck!`,

  interviewReminder: (name: string, jobTitle: string, dateTime: string) =>
    `📅 Reminder: You have an interview for *${jobTitle}* scheduled at *${dateTime}*. Log in to MPLOYEDIN for details. Good luck!`,

  statusUpdate: (name: string, jobTitle: string, status: string) =>
    `Hi ${name}! Your application for *${jobTitle}* has been updated to: *${status.toUpperCase()}*. Check your MPLOYEDIN dashboard for more info.`,
};
