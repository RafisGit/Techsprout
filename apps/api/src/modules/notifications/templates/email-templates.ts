export interface EmailTemplateRenderResult {
  subject: string;
  html: string;
  text: string;
}

function baseLayout(title: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
    .header { background: #0f172a; padding: 24px 32px; text-align: left; }
    .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
    .body { padding: 32px; }
    .footer { background: #f8fafc; padding: 20px 32px; text-align: center; font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .btn { display: inline-block; background-color: #0284c7; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; margin-top: 20px; }
    .card { background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 14px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .row:last-child { margin-bottom: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>TechSprout Learning</h1>
    </div>
    <div class="body">
      ${contentHtml}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} TechSprout Platform. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

export const emailTemplates = {
  orderPlaced(payload: { orderNumber: string; amountCents: number; currency: string }): EmailTemplateRenderResult {
    const formattedAmount = `${payload.currency || 'BDT'} ${(payload.amountCents / 100).toFixed(2)}`;
    const subject = `Order Placed: #${payload.orderNumber}`;
    const html = baseLayout(
      subject,
      `<h2>Thank you for your order!</h2>
       <p>We have received your order <strong>#${payload.orderNumber}</strong>. Please complete your payment to unlock your learning materials.</p>
       <div class="card">
         <p><strong>Order Number:</strong> #${payload.orderNumber}</p>
         <p><strong>Total Due:</strong> ${formattedAmount}</p>
       </div>
       <p>You can review your order status anytime from your account dashboard.</p>`
    );
    const text = `Thank you for your order #${payload.orderNumber}. Total: ${formattedAmount}. Complete your payment to access your courses.`;
    return { subject, html, text };
  },

  orderPaid(payload: { orderNumber: string; amountCents: number; currency: string }): EmailTemplateRenderResult {
    const formattedAmount = `${payload.currency || 'BDT'} ${(payload.amountCents / 100).toFixed(2)}`;
    const subject = `Payment Confirmed: Order #${payload.orderNumber}`;
    const html = baseLayout(
      subject,
      `<h2>Payment Received!</h2>
       <p>Your payment for order <strong>#${payload.orderNumber}</strong> has been successfully processed.</p>
       <div class="card">
         <p><strong>Order Number:</strong> #${payload.orderNumber}</p>
         <p><strong>Amount Paid:</strong> ${formattedAmount}</p>
         <p><strong>Status:</strong> Completed</p>
       </div>
       <p>Your enrollment is now active. Happy learning!</p>`
    );
    const text = `Payment received for order #${payload.orderNumber}. Amount: ${formattedAmount}. Your enrollment is now active.`;
    return { subject, html, text };
  },

  refundRequested(payload: { requestNumber?: string; orderNumber: string; reason: string }): EmailTemplateRenderResult {
    const subject = `Refund Request Received: Order #${payload.orderNumber}`;
    const html = baseLayout(
      subject,
      `<h2>Refund Request Received</h2>
       <p>We have received your refund request for order <strong>#${payload.orderNumber}</strong>.</p>
       <div class="card">
         <p><strong>Order Number:</strong> #${payload.orderNumber}</p>
         <p><strong>Reason:</strong> ${payload.reason}</p>
         <p><strong>Status:</strong> Under Review</p>
       </div>
       <p>Our review team will evaluate your request within 2-3 business days.</p>`
    );
    const text = `Refund request received for order #${payload.orderNumber}. Our team will review your request.`;
    return { subject, html, text };
  },

  refundApproved(payload: { orderNumber: string; amountCents: number }): EmailTemplateRenderResult {
    const formattedAmount = `BDT ${(payload.amountCents / 100).toFixed(2)}`;
    const subject = `Refund Approved: Order #${payload.orderNumber}`;
    const html = baseLayout(
      subject,
      `<h2>Refund Approved</h2>
       <p>Your refund request for order <strong>#${payload.orderNumber}</strong> has been approved.</p>
       <div class="card">
         <p><strong>Order Number:</strong> #${payload.orderNumber}</p>
         <p><strong>Refund Amount:</strong> ${formattedAmount}</p>
         <p><strong>Status:</strong> Approved (Processing Settlement)</p>
       </div>
       <p>The funds will be disbursed back to your original payment method shortly.</p>`
    );
    const text = `Refund of ${formattedAmount} for order #${payload.orderNumber} has been approved.`;
    return { subject, html, text };
  },

  refundRejected(payload: { orderNumber: string; reason: string }): EmailTemplateRenderResult {
    const subject = `Refund Request Update: Order #${payload.orderNumber}`;
    const html = baseLayout(
      subject,
      `<h2>Refund Request Decision</h2>
       <p>We have completed reviewing your refund request for order <strong>#${payload.orderNumber}</strong>.</p>
       <div class="card">
         <p><strong>Order Number:</strong> #${payload.orderNumber}</p>
         <p><strong>Status:</strong> Not Approved</p>
         <p><strong>Explanation:</strong> ${payload.reason}</p>
       </div>
       <p>If you have any questions, please contact our support team.</p>`
    );
    const text = `Your refund request for order #${payload.orderNumber} was not approved. Reason: ${payload.reason}`;
    return { subject, html, text };
  },

  refundSettled(payload: { orderNumber: string; amountCents: number }): EmailTemplateRenderResult {
    const formattedAmount = `BDT ${(payload.amountCents / 100).toFixed(2)}`;
    const subject = `Refund Settled: Order #${payload.orderNumber}`;
    const html = baseLayout(
      subject,
      `<h2>Refund Settled</h2>
       <p>Your refund for order <strong>#${payload.orderNumber}</strong> in the amount of <strong>${formattedAmount}</strong> has been settled.</p>
       <p>Depending on your financial institution, funds should appear in your statement within 5–10 business days.</p>`
    );
    const text = `Refund of ${formattedAmount} for order #${payload.orderNumber} has been settled.`;
    return { subject, html, text };
  },

  enrollmentCreated(payload: { courseTitle: string }): EmailTemplateRenderResult {
    const subject = `Enrolled: ${payload.courseTitle}`;
    const html = baseLayout(
      subject,
      `<h2>Welcome to your new course!</h2>
       <p>You have successfully enrolled in <strong>${payload.courseTitle}</strong>.</p>
       <p>You can begin streaming lessons, taking quizzes, and earning your certification immediately.</p>`
    );
    const text = `You have successfully enrolled in ${payload.courseTitle}. Start learning now!`;
    return { subject, html, text };
  },

  certificateIssued(payload: { courseTitle: string; certificateNumber: string }): EmailTemplateRenderResult {
    const subject = `Congratulations! Certificate Issued for ${payload.courseTitle}`;
    const html = baseLayout(
      subject,
      `<h2>Congratulations on Completing Your Course!</h2>
       <p>You have successfully finished <strong>${payload.courseTitle}</strong>.</p>
       <div class="card">
         <p><strong>Certificate ID:</strong> ${payload.certificateNumber}</p>
         <p><strong>Status:</strong> Verified & Authentic</p>
       </div>
       <p>Your certificate has been published and is permanently verifiable on your profile.</p>`
    );
    const text = `Congratulations! You earned certificate #${payload.certificateNumber} for ${payload.courseTitle}.`;
    return { subject, html, text };
  },
};
