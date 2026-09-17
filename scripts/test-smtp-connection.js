require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('Environment SMTP config:');
console.log('  EMAIL_HOST:', process.env.EMAIL_HOST);
console.log('  EMAIL_PORT:', process.env.EMAIL_PORT);
console.log('  EMAIL_USER:', process.env.EMAIL_USER);
console.log('  EMAIL_PASS length:', process.env.EMAIL_PASS?.length);
console.log('  GMAIL_CLIENT_ID:', !!process.env.GMAIL_CLIENT_ID);
console.log('  ETHEREAL_USER:', process.env.ETHEREAL_USER);

// Try to create the transporter like the code does
let transporter;

if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) {
  console.log('\nUsing Gmail OAuth2...');
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.GMAIL_USER,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    },
  });
} else if (process.env.SMTP_HOST || process.env.EMAIL_HOST) {
  console.log('\nUsing generic SMTP...');
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? process.env.EMAIL_HOST,
    port: parseInt(process.env.SMTP_PORT ?? process.env.EMAIL_PORT ?? "587"),
    secure: (process.env.SMTP_SECURE ?? process.env.EMAIL_SECURE) === "true",
    auth: {
      user: process.env.SMTP_USER ?? process.env.EMAIL_USER,
      pass: process.env.SMTP_PASS ?? process.env.EMAIL_PASS,
    },
  });
} else {
  console.log('\nFalling back to Ethereal...');
  transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    auth: {
      user: process.env.ETHEREAL_USER ?? "test@ethereal.email",
      pass: process.env.ETHEREAL_PASS ?? "testpass",
    },
  });
}

(async () => {
  try {
    console.log('\nTesting transporter...');
    const verified = await transporter.verify();
    console.log('✓ Transporter verified:', verified);
  } catch (err) {
    console.log('✗ Transporter verification failed:', err.message);
  }
})();
