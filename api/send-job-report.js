// Create this as /pages/api/send-job-report.js (Next.js) or equivalent endpoint
// This API endpoint allows users to email themselves job search results using external email service

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    const {
      userEmail,
      jobType,
      location,
      jobs = [],
      summary = '',
      stats = {},
      timestamp
    } = req.body;

    // Validation
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'User email address is required'
      });
    }

    if (!isValidEmail(userEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address format'
      });
    }

    if (!jobs || jobs.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No job data provided to send'
      });
    }

    console.log(`📧 Preparing to send job report to ${userEmail} with ${jobs.length} jobs`);

    // Option 1: Use EmailJS (Recommended - Free service)
    if (process.env.EMAILJS_SERVICE_ID && process.env.EMAILJS_TEMPLATE_ID && process.env.EMAILJS_PUBLIC_KEY) {
      try {
        const result = await sendViaEmailJS({
          userEmail,
          jobType,
          location,
          jobs,
          summary,
          stats,
          timestamp
        });

        return res.status(200).json(result);
      } catch (error) {
        console.error("EmailJS failed:", error);
        // Fall through to other options
      }
    }

    // Option 2: Use Resend (Modern email API)
//    if (process.env.RESEND_API_KEY) {
//      try {
//        const result = await sendViaResend({
//          userEmail,
//          jobType,
//          location,
//          jobs,
//          summary,
//          stats,
//          timestamp
//        });
//
//        return res.status(200).json(result);
//      } catch (error) {
//        console.error("Resend failed:", error);
        // Fall through to other options
//      }
//    }

    // Option 3: Use SendGrid (Popular choice)
//    if (process.env.SENDGRID_API_KEY) {
//      try {
//        const result = await sendViaSendGrid({
//          userEmail,
//          jobType,
//          location,
//          jobs,
//          summary,
//          stats,
//          timestamp
//        });
//
//        return res.status(200).json(result);
//      } catch (error) {
//        console.error("SendGrid failed:", error);
//        // Fall through to other options
//      }
//    }

    // Option 4: Generate downloadable report (Fallback)
    const reportData = generateJobReportData({
      userEmail,
      jobType,
      location,
      jobs,
      summary,
      stats,
      timestamp
    });

    return res.status(200).json({
      success: true,
      message: 'Email service not configured, but report data generated successfully',
      reportData: reportData,
      downloadUrl: null, // Could generate a temporary download link
      instructions: 'Copy the report content and save it locally, or contact admin to configure email service'
    });

  } catch (error) {
    console.error("❌ Send email error:", error);
    res.status(500).json({
      success: false,
      error: 'Failed to process email request. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Email validation helper
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// EmailJS Integration (Free, client-side friendly)
async function sendViaEmailJS({ userEmail, jobType, location, jobs, summary, stats, timestamp }) {
  // EmailJS is typically used client-side, but we can use their REST API
  // You need to set up: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY

  const emailContent = generateJobReportText({ userEmail, jobType, location, jobs, summary, stats, timestamp });

  const emailData = {
    service_id: process.env.EMAILJS_SERVICE_ID,
    template_id: process.env.EMAILJS_TEMPLATE_ID,
    user_id: process.env.EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email: userEmail,
      to_name: userEmail.split('@')[0],
      subject: `🎯 Your Job Search Report: ${jobs.length} ${jobType} opportunities`,
      message_html: emailContent.html,
      reply_to: 'noreply@jobagent.ai'
    }
  };

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailData)
  });

  if (!response.ok) {
    throw new Error(`EmailJS Error: ${response.status}`);
  }

  return {
    success: true,
    message: `Job report sent successfully to ${userEmail} via EmailJS`,
    service: 'EmailJS',
    jobCount: jobs.length,
    timestamp: new Date().toISOString(),
  };
}

// Resend Integration (Modern, developer-friendly)
//async function sendViaResend({ userEmail, jobType, location, jobs, summary, stats, timestamp }) {
//  const { Resend } = await import('resend');
//  const resend = new Resend(process.env.RESEND_API_KEY);
//
//  const emailContent = generateJobReportData({ userEmail, jobType, location, jobs, summary, stats, timestamp });
//
//  const emailData = {
//    from: 'AI Job Agent <noreply@yourdomain.com>', // Replace with your verified domain
//    to: [userEmail],
//    subject: `🎯 Your Job Search Report: ${jobs.length} ${jobType} opportunities in ${location}`,
//    html: emailContent.html,
//    text: emailContent.text
//  };
//
//  const result = await resend.emails.send(emailData);
//
//  return {
//    success: true,
//    message: `Job report sent successfully to ${userEmail} via Resend`,
//    service: 'Resend',
//    jobCount: jobs.length,
//    messageId: result.id,
//    timestamp: new Date().toISOString(),
//  };
//}

// SendGrid Integration (Popular enterprise choice)
//async function sendViaSendGrid({ userEmail, jobType, location, jobs, summary, stats, timestamp }) {
//  const sgMail = await import('@sendgrid/mail');
//  sgMail.default.setApiKey(process.env.SENDGRID_API_KEY);
//
//  const emailContent = generateJobReportData({ userEmail, jobType, location, jobs, summary, stats, timestamp });
//
//  const msg = {
//    to: userEmail,
//    from: 'noreply@yourdomain.com', // Replace with your verified sender
//    subject: `🎯 Your Job Search Report: ${jobs.length} ${jobType} opportunities in ${location}`,
//    text: emailContent.text,
//    html: emailContent.html,
//  };
//
//  const result = await sgMail.default.send(msg);
//
//  return {
//    success: true,
//    message: `Job report sent successfully to ${userEmail} via SendGrid`,
//    service: 'SendGrid',
//    jobCount: jobs.length,
//    messageId: result[0].headers['x-message-id'],
//    timestamp: new Date().toISOString(),
//  };
//}

// Generate email content (same as before but simplified)
function generateJobReportData({ userEmail, jobType, location, jobs, summary, stats, timestamp }) {
  const searchDate = new Date(timestamp || Date.now()).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Generate job cards HTML (limit to 30 for email size)
  const jobCardsHtml = jobs.slice(0, 30).map((job, index) => `
    <div style="background: #ffffff; border: 1px solid #e1e5e9; border-radius: 8px; padding: 20px; margin: 15px 0; border-left: 4px solid #667eea;">
      <h3 style="margin: 0 0 8px 0; color: #333; font-size: 18px; font-weight: 600;">
        ${escapeHtml(job.title || 'Untitled Position')}
      </h3>
      <p style="margin: 0 0 10px 0; color: #667eea; font-size: 16px; font-weight: 500;">
        🏢 ${escapeHtml(job.company || 'Company Not Specified')}
      </p>
      <div style="margin: 10px 0; font-size: 14px; color: #666;">
        📍 ${escapeHtml(job.location || location)} •
        📅 ${escapeHtml(job.date || 'Date not specified')} •
        🔗 ${escapeHtml(job.source || 'Unknown Source')}
        ${job.salary && job.salary !== 'Not specified' ? ` • 💰 ${escapeHtml(job.salary)}` : ''}
      </div>
      ${job.description ? `
        <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; margin: 10px 0; font-size: 14px; color: #555; line-height: 1.5;">
          ${escapeHtml(job.description.substring(0, 200))}${job.description.length > 200 ? '...' : ''}
        </div>
      ` : ''}
      <a href="${job.link}" target="_blank" rel="noopener noreferrer"
         style="display: inline-block; background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 10px;">
        Apply Now →
      </a>
    </div>
  `).join('');

  // HTML email content
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Job Search Report</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">

      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0 0 10px 0; font-size: 28px; font-weight: 300;">🤖 AI Job Agent Report</h1>
        <p style="margin: 0; font-size: 16px; opacity: 0.9;">Your personalized job search results</p>
      </div>

      <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px;">
        <h2 style="margin: 0 0 20px 0; color: #333; font-size: 24px;">Search Summary</h2>

        <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px;">
            <div>
              <strong style="color: #2e7d32;">Job Type:</strong> ${escapeHtml(jobType)}<br>
              <strong style="color: #2e7d32;">Location:</strong> ${escapeHtml(location)}<br>
              <strong style="color: #2e7d32;">Search Date:</strong> ${searchDate}
            </div>
            <div style="text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #2e7d32;">${jobs.length}</div>
              <div style="color: #666; font-size: 14px;">opportunities found</div>
            </div>
          </div>
        </div>
      </div>

      ${summary && summary !== 'No jobs to analyze.' && summary !== 'AI analysis not available.' ? `
        <div style="background: #f8f9fa; border: 1px solid #e9ecef; border-left: 6px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 8px;">
          <h3 style="margin: 0 0 15px 0; color: #667eea;">🤖 AI Market Analysis</h3>
          <div style="line-height: 1.6; color: #333; white-space: pre-wrap;">
            ${escapeHtml(summary)}
          </div>
        </div>
      ` : ''}

      <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin: 0 0 20px 0; color: #333; font-size: 24px;">Job Opportunities ${jobs.length > 30 ? '(Top 30)' : `(${jobs.length})`}</h2>
        ${jobCardsHtml}

        ${jobs.length > 30 ? `
          <div style="text-align: center; padding: 20px; color: #666; font-style: italic;">
            Showing top 30 of ${jobs.length} results. Search again for updated listings.
          </div>
        ` : ''}
      </div>

      <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-top: 30px; text-align: center; color: #666; font-size: 14px;">
        <p style="margin: 0 0 10px 0;">This report was generated by AI Job Agent for ${userEmail}</p>
        <p style="margin: 0;">💡 <strong>Tip:</strong> Job listings change frequently. Search again for the most current opportunities!</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="margin: 0; font-size: 12px; opacity: 0.8;">
          Generated on ${new Date().toLocaleString()}
        </p>
      </div>

    </body>
    </html>
  `;

  // Plain text version
  const text = `
AI Job Agent - Your Job Search Report
Generated on ${searchDate}

SEARCH SUMMARY
Job Type: ${jobType}
Location: ${location}
Results Found: ${jobs.length} opportunities

${summary && summary !== 'No jobs to analyze.' && summary !== 'AI analysis not available.' ? `
AI MARKET ANALYSIS
${summary.replace(/[#*]/g, '').trim()}

` : ''}JOB LISTINGS (Top ${Math.min(30, jobs.length)})
${jobs.slice(0, 30).map((job, index) => `
${index + 1}. ${job.title || 'Untitled Position'}
   Company: ${job.company || 'Not specified'}
   Location: ${job.location || location}
   Posted: ${job.date || 'Date not specified'}
   Source: ${job.source || 'Unknown'}
   Apply: ${job.link}
   ${job.salary && job.salary !== 'Not specified' ? `Salary: ${job.salary}` : ''}
`).join('')}

${jobs.length > 30 ? `\n... and ${jobs.length - 30} more opportunities available.\n` : ''}

This report was sent to: ${userEmail}
Generated by: AI Job Agent
  `;

  return { html, text };
}

// Simple text version for EmailJS
function generateJobReportText({ userEmail, jobType, location, jobs, summary, stats, timestamp }) {
  const content = generateJobReportData({ userEmail, jobType, location, jobs, summary, stats, timestamp });

  // For EmailJS, we can send HTML in the template
  return {
    html: content.html,
    text: content.text
  };
}

// HTML escape function to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.toString().replace(/[&<>"']/g, function(m) { return map[m]; });
}