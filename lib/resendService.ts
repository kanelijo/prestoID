const RESEND_API_KEY = process.env.EXPO_PUBLIC_RESEND_API_KEY || 'HIDDEN_FOR_SECURITY';
const SUPPORT_EMAIL = 'onlyteam43@gmail.com';

export interface SendDeletionEmailParams {
  teacherName: string;
  teacherEmail: string;
  orgCode: string;
  scheduledDate: string;
  action: 'requested' | 'cancelled';
}

export const sendAccountDeletionEmail = async (params: SendDeletionEmailParams) => {
  try {
    const isRequest = params.action === 'requested';
    const subject = isRequest
      ? `⚠️ [Account Deletion Request] Organisation: ${params.teacherName} | Org ID: ${params.orgCode}`
      : `✅ [Account Deletion CANCELLED] Organisation: ${params.teacherName} | Org ID: ${params.orgCode}`;

    const encodedOrg = encodeURIComponent(params.teacherName);
    const whatsappLink = `https://wa.me/919302472984?text=Hi%20Team43,%20Regarding%20Account%20Deletion%20Request%20for%20${encodedOrg}%20(${params.orgCode})`;
    const replyMailLink = `mailto:${params.teacherEmail}?subject=Re:%20Account%20Deletion%20Request%20for%20${encodedOrg}`;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #F3F4F6;">
        <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; padding: 28px; border: 1px solid #E5E7EB; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Status -->
          <div style="display: flex; align-items: center; margin-bottom: 20px;">
            <h2 style="color: ${isRequest ? '#DC2626' : '#059669'}; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.3px;">
              ${isRequest ? '⚠️ Account Deletion Requested (7-Day Grace Period)' : '✅ Account Deletion Request Cancelled'}
            </h2>
          </div>
          
          <!-- Details Table with High-Contrast Dark Labels -->
          <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px;">
            <tr style="border-bottom: 1px solid #F3F4F6;">
              <td style="padding: 10px 0; color: #374151; font-weight: 700; width: 190px;">Organisation Name:</td>
              <td style="padding: 10px 0; color: #111827; font-weight: 800; font-size: 15px;">${params.teacherName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #F3F4F6;">
              <td style="padding: 10px 0; color: #374151; font-weight: 700;">Institute Email:</td>
              <td style="padding: 10px 0; color: #2563EB; font-weight: 600;"><a href="mailto:${params.teacherEmail}" style="color: #2563EB; text-decoration: none;">${params.teacherEmail}</a></td>
            </tr>
            <tr style="border-bottom: 1px solid #F3F4F6;">
              <td style="padding: 10px 0; color: #374151; font-weight: 700;">Organization Code:</td>
              <td style="padding: 10px 0; color: #4F46E5; font-weight: 800; font-size: 15px;">${params.orgCode}</td>
            </tr>
            <tr style="border-bottom: 1px solid #F3F4F6;">
              <td style="padding: 10px 0; color: #374151; font-weight: 700;">Request Date & Time:</td>
              <td style="padding: 10px 0; color: #111827; font-weight: 600;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
            </tr>
            ${
              isRequest
                ? `
                <tr style="border-bottom: 1px solid #F3F4F6;">
                  <td style="padding: 10px 0; color: #374151; font-weight: 700;">Permanent Deletion Date:</td>
                  <td style="padding: 10px 0; color: #DC2626; font-weight: 800;">${params.scheduledDate} (7 Days Grace Window)</td>
                </tr>
                `
                : ''
            }
          </table>

          <!-- Notice Banner -->
          <div style="margin-top: 22px; padding: 14px 16px; background-color: ${isRequest ? '#FEF2F2' : '#ECFDF5'}; border-left: 4px solid ${isRequest ? '#DC2626' : '#059669'}; border-radius: 8px; font-size: 13px; line-height: 1.5; color: ${isRequest ? '#991B1B' : '#065F46'};">
            ${
              isRequest
                ? '<strong>Note:</strong> The organisation account remains fully operational during this 7-day review period. The organisation can continue using all app features normally or cancel the deletion request from Profile settings.'
                : '<strong>Note:</strong> The organisation has voluntarily cancelled their deletion request. Account status has been restored to active.'
            }
          </div>

          <!-- Quick Action Buttons -->
          <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #E5E7EB;">
            <p style="margin: 0 0 12px 0; font-size: 13px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">⚡ Quick Actions for Team43 Support</p>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <a href="${whatsappLink}" target="_blank" style="display: inline-block; background-color: #25D366; color: #FFFFFF; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 700; text-align: center;">
                💬 Open WhatsApp Chat
              </a>
              <a href="${replyMailLink}" style="display: inline-block; background-color: #4F46E5; color: #FFFFFF; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 700; text-align: center;">
                ✉️ Contact Institute Email
              </a>
            </div>
          </div>

          <!-- Footer Branding -->
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #F3F4F6; text-align: center; font-size: 12px; color: #6B7280; font-weight: 500;">
            Zenza Security System by Team43 Support
          </div>

        </div>
      </div>
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Zenza System Alerts <onboarding@resend.dev>',
        to: [SUPPORT_EMAIL],
        subject: subject,
        html: htmlContent,
      }),
    });

    const data = await response.json();
    console.log('[Resend] Email sent response:', data);
    return data;
  } catch (error) {
    console.warn('[Resend] Failed to send email alert:', error);
    return null;
  }
};
