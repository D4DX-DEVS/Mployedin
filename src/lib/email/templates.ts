const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.vercel.app";

const baseStyle = `
  font-family: Arial, sans-serif;
  max-width: 600px;
  margin: 0 auto;
  background: #ffffff;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
`;

const header = `
  <div style="background: #0a2a6e; padding: 28px 32px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px;">MPLOYEDIN</h1>
    <p style="color: #93c5fd; margin: 6px 0 0; font-size: 13px;">AI-Powered International Recruitment</p>
  </div>
`;

const footer = `
  <div style="background: #f9fafb; padding: 20px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
      © ${new Date().getFullYear()} MPLOYEDIN · <a href="${BASE_URL}" style="color: #6b7280; text-decoration: none;">${BASE_URL.replace("https://", "")}</a>
    </p>
  </div>
`;

/**
 * Email sent to the job seeker confirming their application was received.
 */
export function applicationConfirmationEmail(data: {
  seekerName: string;
  jobTitle: string;
  companyName: string;
  applicationId: string;
}): { subject: string; html: string } {
  const subject = `Application received — ${data.jobTitle} at ${data.companyName}`;
  const html = `
    <div style="${baseStyle}">
      ${header}
      <div style="padding: 32px;">
        <p style="color: #374151; font-size: 15px; margin: 0 0 16px;">Hi ${data.seekerName},</p>
        <p style="color: #374151; font-size: 15px; margin: 0 0 24px;">
          Your application for <strong>${data.jobTitle}</strong> at <strong>${data.companyName}</strong> has been received successfully.
        </p>
        <div style="background: #f0f9ff; border-left: 4px solid #0a2a6e; padding: 16px 20px; border-radius: 4px; margin-bottom: 24px;">
          <p style="margin: 0; color: #1e3a8a; font-size: 14px;">
            <strong>What happens next?</strong><br/>
            The employer will review your profile and reach out if you are a good fit. You can track your application status from your dashboard.
          </p>
        </div>
        <a href="${BASE_URL}/en/dashboard/applications" style="display: inline-block; background: #0a2a6e; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: bold;">
          View My Applications
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0;">Application ID: ${data.applicationId}</p>
      </div>
      ${footer}
    </div>
  `;
  return { subject, html };
}

/**
 * Email sent to the employer when a new applicant applies to their job.
 */
export function newApplicantAlertEmail(data: {
  employerName: string;
  seekerName: string;
  jobTitle: string;
  applicationId: string;
}): { subject: string; html: string } {
  const subject = `New applicant for ${data.jobTitle} — ${data.seekerName}`;
  const html = `
    <div style="${baseStyle}">
      ${header}
      <div style="padding: 32px;">
        <p style="color: #374151; font-size: 15px; margin: 0 0 16px;">Hi ${data.employerName},</p>
        <p style="color: #374151; font-size: 15px; margin: 0 0 24px;">
          <strong>${data.seekerName}</strong> has applied for your job posting: <strong>${data.jobTitle}</strong>.
        </p>
        <a href="${BASE_URL}/en/dashboard/applications/${data.applicationId}" style="display: inline-block; background: #0a2a6e; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: bold;">
          Review Application
        </a>
        <p style="color: #6b7280; font-size: 13px; margin: 24px 0 0;">
          You can manage your notification preferences from your employer dashboard settings.
        </p>
      </div>
      ${footer}
    </div>
  `;
  return { subject, html };
}
