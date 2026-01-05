import { Resend } from "resend";
import { env } from "../config/env";

// Initialize Resend client (will be null if no API key)
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<boolean> {
  // If no Resend API key, log email to console (dev mode)
  if (!resend) {
    console.log("========== EMAIL (Dev Mode) ==========");
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${html}`);
    console.log("=======================================");
    return true;
  }

  try {
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Failed to send email:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Email send error:", err);
    return false;
  }
}

// ============================================
// EMAIL TEMPLATES
// ============================================

export function getVerificationEmailHtml(name: string | null, verifyUrl: string): string {
  const displayName = name || "there";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">FoodCheQ</h1>
  </div>
  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #333; margin-top: 0;">Verify Your Email Address</h2>
    <p>Hi ${displayName},</p>
    <p>Thanks for signing up for FoodCheQ! Please verify your email address by clicking the button below:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verifyUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Verify Email</a>
    </div>
    <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
    <p style="color: #667eea; word-break: break-all; font-size: 14px;">${verifyUrl}</p>
    <p style="color: #666; font-size: 14px;">This link will expire in ${env.EMAIL_VERIFY_TOKEN_EXPIRY_HOURS} hours.</p>
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
    <p style="color: #999; font-size: 12px; margin: 0;">If you didn't create an account with FoodCheQ, you can safely ignore this email.</p>
  </div>
</body>
</html>
  `.trim();
}

export function getPasswordResetEmailHtml(name: string | null, resetUrl: string): string {
  const displayName = name || "there";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">FoodCheQ</h1>
  </div>
  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #333; margin-top: 0;">Reset Your Password</h2>
    <p>Hi ${displayName},</p>
    <p>We received a request to reset your password. Click the button below to create a new password:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Reset Password</a>
    </div>
    <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
    <p style="color: #667eea; word-break: break-all; font-size: 14px;">${resetUrl}</p>
    <p style="color: #666; font-size: 14px;">This link will expire in ${env.PASSWORD_RESET_TOKEN_EXPIRY_HOURS} hour(s).</p>
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
    <p style="color: #999; font-size: 12px; margin: 0;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
  </div>
</body>
</html>
  `.trim();
}

export function getPartnershipStatusEmailHtml(
  name: string | null,
  status: "APPROVED" | "REJECTED" | "NEEDS_INFO",
  notes?: string
): string {
  const displayName = name || "there";

  const statusMessages = {
    APPROVED: {
      title: "Partnership Application Approved!",
      message: "Congratulations! Your partnership application has been approved. You now have access to exclusive partner features including investment opportunities and early access to new products.",
      color: "#22c55e",
    },
    REJECTED: {
      title: "Partnership Application Update",
      message: "We've reviewed your partnership application and unfortunately we're unable to approve it at this time.",
      color: "#ef4444",
    },
    NEEDS_INFO: {
      title: "Additional Information Required",
      message: "We've reviewed your partnership application and need some additional information before we can proceed.",
      color: "#f59e0b",
    },
  };

  const statusInfo = statusMessages[status];

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${statusInfo.title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">FoodCheQ</h1>
  </div>
  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <div style="text-align: center; margin-bottom: 20px;">
      <span style="background: ${statusInfo.color}; color: white; padding: 8px 20px; border-radius: 20px; font-size: 14px; font-weight: bold;">${status}</span>
    </div>
    <h2 style="color: #333; margin-top: 0; text-align: center;">${statusInfo.title}</h2>
    <p>Hi ${displayName},</p>
    <p>${statusInfo.message}</p>
    ${notes ? `<div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;"><strong>Notes:</strong><br>${notes}</div>` : ""}
    <div style="text-align: center; margin: 30px 0;">
      <a href="${env.FRONTEND_URL}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Go to FoodCheQ</a>
    </div>
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
    <p style="color: #999; font-size: 12px; margin: 0;">Thank you for your interest in partnering with FoodCheQ.</p>
  </div>
</body>
</html>
  `.trim();
}
