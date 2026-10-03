/**
 * Email bodies. Moved verbatim from email.ts (2026-09-29); `esc` escapes every user-supplied value.
 */

/**
 * Escape user-supplied values before interpolating into email HTML bodies.
 * Prevents stored-XSS / HTML injection via names, job titles, company names, etc.
 * App-generated URLs (verify/reset links) are not user free-text and are left as-is.
 */
function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );
}

// Pre-built email templates
export const EmailTemplates = {
  applicationReceived: (applicantName: string, jobTitle: string, companyName: string) => ({
    subject: `Application Received – ${jobTitle} at ${companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Dear <strong>${esc(applicantName)}</strong>,</p>
          <p>Your application for <strong>${esc(jobTitle)}</strong> at <strong>${esc(companyName)}</strong> has been received successfully.</p>
          <p>Our team will review your profile and get back to you within 3-5 business days.</p>
          <p style="color: #6b7280; font-size: 14px;">Best regards,<br>The MPLOYEDIN Team</p>
        </div>
      </div>
    `,
  }),

  interviewScheduled: (applicantName: string, jobTitle: string, dateTime: string, location: string) => ({
    subject: `Interview Scheduled – ${jobTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Dear <strong>${esc(applicantName)}</strong>,</p>
          <p>Your interview for <strong>${esc(jobTitle)}</strong> has been scheduled:</p>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Date & Time:</strong> ${esc(dateTime)}</p>
            <p style="margin: 4px 0;"><strong>Location:</strong> ${esc(location)}</p>
          </div>
          <p style="color: #6b7280; font-size: 14px;">Best regards,<br>The MPLOYEDIN Team</p>
        </div>
      </div>
    `,
  }),

  statusUpdate: (applicantName: string, jobTitle: string, status: string) => ({
    subject: `Application Update – ${jobTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Dear <strong>${esc(applicantName)}</strong>,</p>
          <p>Your application status for <strong>${esc(jobTitle)}</strong> has been updated to: <strong>${esc(status.toUpperCase())}</strong></p>
          <p>Log in to your MPLOYEDIN dashboard to view more details.</p>
          <p style="color: #6b7280; font-size: 14px;">Best regards,<br>The MPLOYEDIN Team</p>
        </div>
      </div>
    `,
  }),

  verifyEmail: (userName: string, verifyUrl: string) => ({
    subject: "Verify Your Email – MPLOYEDIN",
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0D6FD8 0%, #0A5BB8 100%); padding: 32px 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">MPLOYEDIN</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Your Career, Amplified</p>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #111827;">Hi <strong>${esc(userName)}</strong>,</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">Thank you for joining MPLOYEDIN! Please verify your email address to unlock full access to your account and all platform features.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${verifyUrl}" style="background: #0D6FD8; color: white; padding: 14px 40px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 2px 4px rgba(13,111,216,0.3);">Verify My Email</a>
          </div>
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0; font-size: 13px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="margin: 8px 0 0; font-size: 13px; word-break: break-all;"><a href="${verifyUrl}" style="color: #0D6FD8;">${verifyUrl}</a></p>
          </div>
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">This link expires in 24 hours. If you didn't create an account on MPLOYEDIN, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 0;">MPLOYEDIN — Connecting Talent with Opportunity</p>
        </div>
      </div>
    `,
  }),

  verifyEmailOtp: (userName: string, otp: string, verifyUrl: string) => ({
    subject: "Your MPLOYEDIN Verification Code – MPLOYEDIN",
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0D6FD8 0%, #0A5BB8 100%); padding: 32px 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">MPLOYEDIN</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Your Career, Amplified</p>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #111827;">Hi <strong>${esc(userName)}</strong>,</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">Verify your email address by entering this 6-digit code in the MPLOYEDIN verification screen:</p>
          <div style="text-align: center; margin: 32px 0;">
            <div style="display: inline-block; background: #f3f4f6; border: 2px solid #0D6FD8; border-radius: 8px; padding: 16px 32px;">
              <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #0D6FD8;">${esc(otp)}</span>
            </div>
          </div>
          <p style="font-size: 13px; color: #6b7280; text-align: center; margin: 0 0 24px;">This code expires in 24 hours.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 14px; color: #374151; line-height: 1.6;">Prefer to verify with a link? Click the button below:</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${verifyUrl}" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">Verify via Link</a>
          </div>
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0; font-size: 13px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="margin: 8px 0 0; font-size: 13px; word-break: break-all;"><a href="${verifyUrl}" style="color: #0D6FD8;">${verifyUrl}</a></p>
          </div>
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">If you didn't create an account on MPLOYEDIN, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 0;">MPLOYEDIN — Connecting Talent with Opportunity</p>
        </div>
      </div>
    `,
  }),

  verifyEmailOtpQuickApply: (otp: string, greetingName: string) => ({
    subject: "Your MPLOYEDIN Verification Code",
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0D6FD8 0%, #0A5BB8 100%); padding: 32px 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">MPLOYEDIN</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Your Career, Amplified</p>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">Hi ${esc(greetingName)},</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">Verify your email address by entering this 6-digit code on the job application page:</p>
          <div style="text-align: center; margin: 32px 0;">
            <div style="display: inline-block; background: #f3f4f6; border: 2px solid #0D6FD8; border-radius: 8px; padding: 16px 32px;">
              <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #0D6FD8;">${esc(otp)}</span>
            </div>
          </div>
          <p style="font-size: 13px; color: #6b7280; text-align: center; margin: 0;">This code expires in 10 minutes.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 13px; margin: 0;">If you didn't request this code, you can safely ignore this email.</p>
        </div>
      </div>
    `,
  }),

  verifyEmailOtpForEmployer: (userName: string, otp: string, verifyUrl: string) => ({
    subject: "Your MPLOYEDIN Verification Code – MPLOYEDIN",
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0D6FD8 0%, #0A5BB8 100%); padding: 32px 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">MPLOYEDIN</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Hire Smarter, Faster</p>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #111827;">Hi <strong>${esc(userName)}</strong>,</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">Verify your email address by entering this 6-digit code in the MPLOYEDIN verification screen:</p>
          <div style="text-align: center; margin: 32px 0;">
            <div style="display: inline-block; background: #f3f4f6; border: 2px solid #0D6FD8; border-radius: 8px; padding: 16px 32px;">
              <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #0D6FD8;">${esc(otp)}</span>
            </div>
          </div>
          <p style="font-size: 13px; color: #6b7280; text-align: center; margin: 0 0 24px;">This code expires in 24 hours.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 14px; color: #374151; line-height: 1.6;">Prefer to verify with a link? Click the button below:</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${verifyUrl}" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">Verify via Link</a>
          </div>
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0; font-size: 13px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="margin: 8px 0 0; font-size: 13px; word-break: break-all;"><a href="${verifyUrl}" style="color: #0D6FD8;">${verifyUrl}</a></p>
          </div>
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">If you didn't create an account on MPLOYEDIN, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 0;">MPLOYEDIN — Connecting Talent with Opportunity</p>
        </div>
      </div>
    `,
  }),

  emailChangeVerify: (userName: string, confirmUrl: string, newEmail: string) => ({
    subject: "Confirm Your New Email Address – MPLOYEDIN",
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0D6FD8 0%, #0A5BB8 100%); padding: 32px 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">MPLOYEDIN</h1>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #111827;">Hi <strong>${esc(userName)}</strong>,</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">A request was made to change your MPLOYEDIN account email to <strong>${esc(newEmail)}</strong>. Click the button below to confirm this change.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${confirmUrl}" style="background: #0D6FD8; color: white; padding: 14px 40px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">Confirm Email Change</a>
          </div>
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0; font-size: 13px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="margin: 8px 0 0; font-size: 13px; word-break: break-all;"><a href="${confirmUrl}" style="color: #0D6FD8;">${confirmUrl}</a></p>
          </div>
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">This link expires in 1 hour. If you didn't request this change, you can safely ignore this email — your account email will not change.</p>
        </div>
      </div>
    `,
  }),

  emailChangeNotice: (userName: string, newEmail: string) => ({
    subject: "Security Alert: Email Change Requested – MPLOYEDIN",
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: #b91c1c; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">MPLOYEDIN Security</h1>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #111827;">Hi <strong>${esc(userName)}</strong>,</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">A request was just made to change your account email address to <strong>${esc(newEmail)}</strong>. The change will only take effect once it is confirmed from the new address.</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;"><strong>If this was you</strong>, no action is needed.</p>
          <p style="font-size: 15px; color: #b91c1c; line-height: 1.6;"><strong>If this wasn't you</strong>, your password may be compromised. Change your password immediately and contact support@mployedin.com.</p>
        </div>
      </div>
    `,
  }),

  emailChangeCompleted: (userName: string, newEmail: string) => ({
    subject: "Your Account Email Was Changed – MPLOYEDIN",
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: #b91c1c; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">MPLOYEDIN Security</h1>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #111827;">Hi <strong>${esc(userName)}</strong>,</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">Your MPLOYEDIN account email has been changed to <strong>${esc(newEmail)}</strong>. This address will no longer receive account notifications.</p>
          <p style="font-size: 15px; color: #b91c1c; line-height: 1.6;"><strong>If you did not make this change</strong>, contact support@mployedin.com immediately.</p>
        </div>
      </div>
    `,
  }),

  accountLocked: (userName: string, lockMinutes: number, resetUrl: string) => ({
    subject: "Security Alert: Your Account Has Been Locked – MPLOYEDIN",
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: #b91c1c; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">MPLOYEDIN Security</h1>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #111827;">Hi <strong>${esc(userName)}</strong>,</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">Your MPLOYEDIN account has been temporarily locked for <strong>${lockMinutes} minutes</strong> after several failed sign-in attempts.</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;"><strong>If this was you</strong>, simply wait and try again — or reset your password now to unlock immediately.</p>
          <p style="font-size: 15px; color: #b91c1c; line-height: 1.6;"><strong>If this wasn't you</strong>, someone may be trying to access your account. We strongly recommend resetting your password.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" style="background: #b91c1c; color: white; padding: 14px 40px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">Need help? Contact support@mployedin.com.</p>
        </div>
      </div>
    `,
  }),

  employerWelcome: (contactName: string, email: string, tempPassword: string, setupUrl: string, agentName: string, loginUrl: string) => ({
    subject: "Welcome to MPLOYEDIN – Your Account is Ready",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Dear <strong>${esc(contactName)}</strong>,</p>
          <p>Your employer account has been created by <strong>${esc(agentName)}</strong>. You can now start posting jobs and managing candidates on MPLOYEDIN.</p>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Email:</strong> ${esc(email)}</p>
            <p style="margin: 4px 0;"><strong>Temporary password:</strong> <code style="font-family: monospace; font-size: 15px; letter-spacing: 0.5px;">${esc(tempPassword)}</code></p>
          </div>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${loginUrl}" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Log In</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">Please change this password after your first sign-in, from Settings or by using <a href="${setupUrl}" style="color: #0D6FD8;">this link</a> (valid for 24 hours).</p>
          <p style="color: #6b7280; font-size: 14px;">Best regards,<br>The MPLOYEDIN Team</p>
        </div>
      </div>
    `,
  }),

  jobSeekerWelcome: (name: string, dashboardUrl: string) => ({
    subject: "Welcome to MPLOYEDIN – Let's Find Your Next Opportunity!",
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0D6FD8 0%, #0A5BB8 100%); padding: 32px 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">MPLOYEDIN</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Your Career, Amplified</p>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #111827;">Hi <strong>${esc(name)}</strong>,</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">Welcome aboard! You've just joined a community of professionals finding their next career move through MPLOYEDIN.</p>
          
          <div style="background: #f0f7ff; border-left: 4px solid #0D6FD8; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
            <p style="margin: 0 0 12px; font-weight: 600; color: #111827; font-size: 15px;">Get started in 3 steps:</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; vertical-align: top; width: 32px;"><span style="background: #0D6FD8; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-block; text-align: center; line-height: 24px; font-size: 13px; font-weight: 600;">1</span></td>
                <td style="padding: 8px 0; padding-left: 12px; font-size: 14px; color: #374151;"><strong>Complete your profile</strong> — Add skills, experience & preferences so employers find you</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; vertical-align: top;"><span style="background: #0D6FD8; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-block; text-align: center; line-height: 24px; font-size: 13px; font-weight: 600;">2</span></td>
                <td style="padding: 8px 0; padding-left: 12px; font-size: 14px; color: #374151;"><strong>Browse jobs</strong> — Explore opportunities matched to your skills</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; vertical-align: top;"><span style="background: #0D6FD8; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-block; text-align: center; line-height: 24px; font-size: 13px; font-weight: 600;">3</span></td>
                <td style="padding: 8px 0; padding-left: 12px; font-size: 14px; color: #374151;"><strong>Get matched</strong> — Our AI recommends the best jobs for you automatically</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${dashboardUrl}" style="background: #0D6FD8; color: white; padding: 14px 40px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 2px 4px rgba(13,111,216,0.3);">Go to My Dashboard</a>
          </div>

          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0; font-size: 14px; color: #92400e;"><strong>Pro tip:</strong> Profiles with a photo, 5+ skills, and work experience get 3x more views from employers.</p>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 0;">MPLOYEDIN — Connecting Talent with Opportunity</p>
        </div>
      </div>
    `,
  }),

  employerSelfWelcome: (contactName: string, companyName: string, dashboardUrl: string) => ({
    subject: `Welcome to MPLOYEDIN – ${companyName} Is Ready to Hire!`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0D6FD8 0%, #0A5BB8 100%); padding: 32px 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">MPLOYEDIN</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Hire Smarter, Faster</p>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #111827;">Hi <strong>${esc(contactName)}</strong>,</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;"><strong>${esc(companyName)}</strong> is now registered on MPLOYEDIN. You're ready to start connecting with top talent.</p>

          <div style="background: #f0f7ff; border-left: 4px solid #0D6FD8; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
            <p style="margin: 0 0 12px; font-weight: 600; color: #111827; font-size: 15px;">What you can do now:</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; vertical-align: top; width: 32px;"><span style="background: #0D6FD8; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-block; text-align: center; line-height: 24px; font-size: 13px; font-weight: 600;">1</span></td>
                <td style="padding: 8px 0; padding-left: 12px; font-size: 14px; color: #374151;"><strong>Post your first job</strong> — Reach thousands of qualified candidates instantly</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; vertical-align: top;"><span style="background: #0D6FD8; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-block; text-align: center; line-height: 24px; font-size: 13px; font-weight: 600;">2</span></td>
                <td style="padding: 8px 0; padding-left: 12px; font-size: 14px; color: #374151;"><strong>Browse candidates</strong> — Search our database of job seekers matched to your needs</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; vertical-align: top;"><span style="background: #0D6FD8; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-block; text-align: center; line-height: 24px; font-size: 13px; font-weight: 600;">3</span></td>
                <td style="padding: 8px 0; padding-left: 12px; font-size: 14px; color: #374151;"><strong>Invite your team</strong> — Add colleagues to collaborate on hiring decisions</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${dashboardUrl}" style="background: #0D6FD8; color: white; padding: 14px 40px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 2px 4px rgba(13,111,216,0.3);">Go to Dashboard</a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 0;">MPLOYEDIN — Connecting Talent with Opportunity</p>
        </div>
      </div>
    `,
  }),

  agentWelcome: (agentName: string, email: string, setupUrl: string, superAgentName: string, _loginUrl: string) => ({
    subject: "Welcome to MPLOYEDIN – Your Agent Account is Ready",
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0D6FD8 0%, #0A5BB8 100%); padding: 32px 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">MPLOYEDIN</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Recruitment Agent Portal</p>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #111827;">Hi <strong>${esc(agentName)}</strong>,</p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">Your recruitment agent account has been created by <strong>${esc(superAgentName)}</strong>. You can now start managing leads, employers, and placements on MPLOYEDIN.</p>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0; font-size: 14px;"><strong>Email:</strong> ${esc(email)}</p>
          </div>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${setupUrl}" style="background: #0D6FD8; color: white; padding: 14px 40px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 2px 4px rgba(13,111,216,0.3);">Set Your Password &amp; Log In</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">This link expires in 24 hours.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 0;">MPLOYEDIN — Connecting Talent with Opportunity</p>
        </div>
      </div>
    `,
  }),

  passwordReset: (resetUrl: string) => ({
    subject: "Reset Your Password – MPLOYEDIN",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>You requested a password reset for your MPLOYEDIN account.</p>
          <p>Click the button below to set a new password. This link expires in <strong>15 minutes</strong>.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetUrl}" target="_blank" rel="noopener noreferrer" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">If the button doesn't work, copy and paste this link:<br><a href="${resetUrl}">${resetUrl}</a></p>
          <p style="color: #6b7280; font-size: 14px;">If you did not request a password reset, you can safely ignore this email. Your password will not change.</p>
          <p style="color: #6b7280; font-size: 14px;">Best regards,<br>The MPLOYEDIN Team</p>
        </div>
      </div>
    `,
  }),

  passwordResetConfirmation: (dateTime: string) => ({
    subject: "Your MPLOYEDIN Password Was Changed",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Your MPLOYEDIN account password was successfully changed on ${esc(dateTime)}.</p>
          <p style="color: #6b7280; font-size: 14px;"><strong>If this wasn't you</strong>, your account may be compromised. Reset your password immediately or <a href="mailto:support@mployedin.com" style="color: #0D6FD8;">contact support</a>.</p>
          <p style="color: #6b7280; font-size: 14px;">Best regards,<br>The MPLOYEDIN Team</p>
        </div>
      </div>
    `,
  }),
};
