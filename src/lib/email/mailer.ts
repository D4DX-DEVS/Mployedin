import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT ?? 587),
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const FROM = process.env.EMAIL_FROM ?? "MPLOYEDIN <noreply@mployedin.vercel.app>";

export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  await transporter.sendMail({
    from: FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
}
