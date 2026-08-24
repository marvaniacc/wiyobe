import nodemailer from 'nodemailer'

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter
  const host = process.env.SMTP_HOST
  if (!host) return null

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: parseInt(process.env.SMTP_PORT || '587') === 465,
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    } : undefined,
  })

  return transporter
}

export function isEmailConfigured(): boolean {
  return getTransporter() !== null
}

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail({ to, subject, html, text }: EmailOptions): Promise<boolean> {
  const t = getTransporter()
  if (!t) {
    console.log(`📧 [EMAIL NOT CONFIGURED] To: ${to}, Subject: ${subject}`)
    return false
  }

  try {
    const fromRaw = process.env.EMAIL_FROM || 'noreply@wishubest.com'
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'MedTravel'
    // EMAIL_FROM may be a bare address or a full "Name <addr>" — accept both.
    // (Wrapping a full value again produces `"Name" <Name <addr>>` which
    // providers like Resend reject with 550 Invalid from field.)
    const from = fromRaw.includes('<') ? fromRaw : `"${appName}" <${fromRaw}>`

    await t.sendMail({
      from,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    })

    console.log(`📧 Email sent to ${to}: ${subject}`)
    return true
  } catch (error) {
    console.error(`📧 Failed to send email to ${to}:`, error)
    return false
  }
}

// Pre-built email templates

export function otpEmailTemplate(code: string, purpose: string): { subject: string; html: string } {
  const purposeText = purpose === 'signup' ? 'account verification' : purpose === 'reset' ? 'password reset' : 'login verification'
  return {
    subject: `Your MedTravel verification code: ${code}`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1A73E8; font-size: 24px; margin: 0;">MedTravel</h1>
          <p style="color: #5F6368; font-size: 14px; margin-top: 4px;">Global Medical Tourism Marketplace</p>
        </div>
        <div style="background: #F8F9FA; border-radius: 16px; padding: 24px; border: 1px solid #DADCE0;">
          <h2 style="color: #202124; font-size: 18px; margin: 0 0 12px;">Your verification code</h2>
          <p style="color: #5F6368; font-size: 14px; margin: 0 0 20px;">
            Use the code below for ${purposeText}. This code expires in 10 minutes.
          </p>
          <div style="text-align: center; background: #FFFFFF; border-radius: 12px; padding: 20px; border: 2px solid #1A73E8;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1A73E8; font-family: monospace;">${code}</span>
          </div>
          <p style="color: #5F6368; font-size: 12px; margin-top: 16px; text-align: center;">
            If you didn't request this code, you can safely ignore this email.
          </p>
        </div>
        <p style="color: #9AA0A6; font-size: 12px; text-align: center; margin-top: 24px;">
          © ${new Date().getFullYear()} MedTravel. All rights reserved.
        </p>
      </div>
    `,
  }
}

export function bookingConfirmationEmail(patientName: string, providerName: string, date: string, amount: string, visitType: string): { subject: string; html: string } {
  return {
    subject: `Booking confirmed: ${providerName} — ${date}`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1A73E8; font-size: 24px; margin: 0;">MedTravel</h1>
        </div>
        <div style="background: #F8F9FA; border-radius: 16px; padding: 24px; border: 1px solid #DADCE0;">
          <h2 style="color: #202124; font-size: 18px; margin: 0 0 12px;">✅ Booking Confirmed!</h2>
          <p style="color: #5F6368; font-size: 14px;">Hi ${patientName},</p>
          <p style="color: #5F6368; font-size: 14px;">Your ${visitType === 'ONLINE' ? 'online consultation' : 'in-person visit'} with <strong>${providerName}</strong> has been confirmed.</p>
          <table style="width: 100%; margin-top: 16px; font-size: 14px;">
            <tr><td style="color: #5F6368; padding: 8px 0;">Provider</td><td style="color: #202124; font-weight: 500;">${providerName}</td></tr>
            <tr><td style="color: #5F6368; padding: 8px 0;">Date</td><td style="color: #202124; font-weight: 500;">${date}</td></tr>
            <tr><td style="color: #5F6368; padding: 8px 0;">Type</td><td style="color: #202124; font-weight: 500;">${visitType === 'ONLINE' ? 'Online consultation' : 'In-person visit'}</td></tr>
            <tr><td style="color: #5F6368; padding: 8px 0;">Amount</td><td style="color: #202124; font-weight: 500;">$${amount}</td></tr>
          </table>
          <p style="color: #5F6368; font-size: 13px; margin-top: 16px;">You can view your booking details and manage your appointment in your MedTravel dashboard.</p>
        </div>
      </div>
    `,
  }
}

export function bookingAcceptedEmail(patientName: string, providerName: string): { subject: string; html: string } {
  return {
    subject: `Booking accepted — ${providerName}`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1A73E8; font-size: 24px; margin: 0;">MedTravel</h1>
        </div>
        <div style="background: #F0FDF4; border-radius: 16px; padding: 24px; border: 1px solid #188038;">
          <h2 style="color: #188038; font-size: 18px; margin: 0 0 12px;">✅ Booking Accepted</h2>
          <p style="color: #5F6368; font-size: 14px;">Hi ${patientName},</p>
          <p style="color: #5F6368; font-size: 14px;">Your booking with <strong>${providerName}</strong> has been accepted and is now confirmed.</p>
          <p style="color: #5F6368; font-size: 13px; margin-top: 16px;">You can view your booking details in your MedTravel dashboard.</p>
        </div>
      </div>
    `,
  }
}

export function bookingDeclinedEmail(patientName: string, providerName: string, refundAmount: string): { subject: string; html: string } {
  return {
    subject: `Booking declined — ${providerName}`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1A73E8; font-size: 24px; margin: 0;">MedTravel</h1>
        </div>
        <div style="background: #FEF7F0; border-radius: 16px; padding: 24px; border: 1px solid #D93025;">
          <h2 style="color: #D93025; font-size: 18px; margin: 0 0 12px;">❌ Booking Declined</h2>
          <p style="color: #5F6368; font-size: 14px;">Hi ${patientName},</p>
          <p style="color: #5F6368; font-size: 14px;">Unfortunately, <strong>${providerName}</strong> has declined your booking.</p>
          ${parseFloat(refundAmount) > 0 ? `<p style="color: #188038; font-size: 14px; margin-top: 12px;">A full refund of <strong>$${refundAmount}</strong> will be processed to your original payment method within 5-10 business days.</p>` : ''}
          <p style="color: #5F6368; font-size: 13px; margin-top: 16px;">Please browse other providers on MedTravel to find an available appointment.</p>
        </div>
      </div>
    `,
  }
}

export function bookingCancelledEmail(patientName: string, providerName: string, refundAmount: string): { subject: string; html: string } {
  return {
    subject: `Booking cancelled — ${providerName}`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1A73E8; font-size: 24px; margin: 0;">MedTravel</h1>
        </div>
        <div style="background: #FEF7F0; border-radius: 16px; padding: 24px; border: 1px solid #D93025;">
          <h2 style="color: #D93025; font-size: 18px; margin: 0 0 12px;">❌ Booking Cancelled</h2>
          <p style="color: #5F6368; font-size: 14px;">Hi ${patientName},</p>
          <p style="color: #5F6368; font-size: 14px;">Your booking with <strong>${providerName}</strong> has been cancelled.</p>
          ${parseFloat(refundAmount) > 0 ? `<p style="color: #188038; font-size: 14px; margin-top: 12px;">A refund of <strong>$${refundAmount}</strong> will be processed to your original payment method within 5-10 business days.</p>` : ''}
        </div>
      </div>
    `,
  }
}

export function bookingCompletedEmail(patientName: string, providerName: string): { subject: string; html: string } {
  return {
    subject: `Visit completed — Please leave a review`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1A73E8; font-size: 24px; margin: 0;">MedTravel</h1>
        </div>
        <div style="background: #F8F9FA; border-radius: 16px; padding: 24px; border: 1px solid #DADCE0;">
          <h2 style="color: #188038; font-size: 18px; margin: 0 0 12px;">✅ Visit Completed</h2>
          <p style="color: #5F6368; font-size: 14px;">Hi ${patientName},</p>
          <p style="color: #5F6368; font-size: 14px;">Your visit with <strong>${providerName}</strong> has been marked as completed.</p>
          <p style="color: #5F6368; font-size: 14px; margin-top: 12px;">Please take a moment to leave a review to help other patients make informed decisions.</p>
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}" style="display: inline-block; background: #1A73E8; color: #FFFFFF; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-size: 14px; margin-top: 16px;">Leave a review</a>
        </div>
      </div>
    `,
  }
}

export function ticketReplyEmail(userName: string, ticketSubject: string, message: string): { subject: string; html: string } {
  return {
    subject: `Re: ${ticketSubject}`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1A73E8; font-size: 24px; margin: 0;">MedTravel</h1>
        </div>
        <div style="background: #F8F9FA; border-radius: 16px; padding: 24px; border: 1px solid #DADCE0;">
          <h2 style="color: #202124; font-size: 18px; margin: 0 0 12px;">💬 New reply on your ticket</h2>
          <p style="color: #5F6368; font-size: 14px;">Hi ${userName},</p>
          <p style="color: #5F6368; font-size: 14px;">You have a new reply on your support ticket: <strong>${ticketSubject}</strong></p>
          <div style="background: #FFFFFF; border-radius: 12px; padding: 16px; border: 1px solid #DADCE0; margin-top: 12px;">
            <p style="color: #202124; font-size: 14px; margin: 0;">${message}</p>
          </div>
        </div>
      </div>
    `,
  }
}

export function kycStatusEmail(doctorName: string, docType: string, approved: boolean, adminNote?: string): { subject: string; html: string } {
  return {
    subject: approved ? `KYC Document Approved: ${docType}` : `KYC Document Rejected: ${docType}`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1A73E8; font-size: 24px; margin: 0;">MedTravel</h1>
        </div>
        <div style="background: ${approved ? '#F0FDF4' : '#FEF7F0'}; border-radius: 16px; padding: 24px; border: 1px solid ${approved ? '#188038' : '#D93025'};">
          <h2 style="color: ${approved ? '#188038' : '#D93025'}; font-size: 18px; margin: 0 0 12px;">${approved ? '✅ Document Approved' : '❌ Document Rejected'}</h2>
          <p style="color: #5F6368; font-size: 14px;">Hi ${doctorName},</p>
          <p style="color: #5F6368; font-size: 14px;">Your <strong>${docType.replace(/_/g, ' ')}</strong> has been ${approved ? 'approved' : 'rejected'}.</p>
          ${adminNote ? `<p style="color: #5F6368; font-size: 14px; margin-top: 8px;">Admin note: ${adminNote}</p>` : ''}
          ${approved ? '<p style="color: #188038; font-size: 14px; margin-top: 8px;">Your verified badge will be updated shortly.</p>' : '<p style="color: #5F6368; font-size: 14px; margin-top: 8px;">Please resubmit with the correct document.</p>'}
        </div>
      </div>
    `,
  }
}

export function tierPromotionEmail(affiliateName: string, oldTier: string, newTier: string, bonusRate: string): { subject: string; html: string } {
  return {
    subject: `🎉 Tier Promoted: ${newTier}!`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1A73E8; font-size: 24px; margin: 0;">MedTravel</h1>
        </div>
        <div style="background: #F0FDF4; border-radius: 16px; padding: 24px; border: 1px solid #188038;">
          <h2 style="color: #188038; font-size: 18px; margin: 0 0 12px;">🎉 Congratulations, ${affiliateName}!</h2>
          <p style="color: #5F6368; font-size: 14px;">You've been promoted from <strong>${oldTier}</strong> to <strong>${newTier}</strong> tier!</p>
          <p style="color: #5F6368; font-size: 14px; margin-top: 8px;">Your affiliate bonus rate is now <strong>+${bonusRate}%</strong> on top of the base commission rate.</p>
          <p style="color: #5F6368; font-size: 14px; margin-top: 8px;">Keep referring patients to climb even higher!</p>
        </div>
      </div>
    `,
  }
}
