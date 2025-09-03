// Create this as /pages/api/send-job-report.js (Next.js) or equivalent endpoint
// This API endpoint allows users to email themselves the job search results

import nodemailer from "nodemailer";
import { marked } from "marked";

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

    // Check if email service is configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(503).json({
        success: false,
        error: 'Email service not configured. Please contact administrator.'
      });
    }

    console.log(`📧 Sending job report to ${userEmail} with ${jobs.length} jobs`);

    // Configure email transporter
    const transporter = nodemailer.createTransporter({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Verify transporter configuration
    try {
      await transporter.verify();
    } catch (verifyError) {
      console.error("❌ Email transporter verification failed:", verifyError);
      return res.status(503).json({
        success: false,
        error: 'Email service configuration error. Please try again later.'
      });
    }

    // Generate email content
    const emailContent = generateJobReportEmail({
      userEmail,
      jobType,
      location,
      jobs,
      summary,
      stats,
      timestamp
    });

    // Send email
    const mailOptions = {
      from: `"AI Job Agent" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: `🎯 Your Job Search Report: ${jobs.length} ${jobType} opportunities in ${location}`,
      html: emailContent.html,
      text: emailContent.text, // Fallback for plain text email clients
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully:", info.messageId);

    // Success response
    res.status(200).json({
      success: true,
      message: `Job report sent successfully to ${userEmail}`,
      jobCount: jobs.length,
      messageId: info.messageId,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("❌ Send email error:", error);
    res.status(500).json({
      success: false,
      error: 'Failed to send email. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Email validation helper
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Generate HTML and text content for the job report email
function generateJobReportEmail({ userEmail, jobType, location, jobs, summary, stats, timestamp }) {
  const searchDate = new Date(timestamp || Date.now()).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Generate job cards HTML
  const jobCardsHtml = jobs.slice(0, 50).map((job, index) => `
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
          ${escapeHtml(job.description.substring(0, 300))}${job.description.length > 300 ? '...' : ''}
        </div>
      ` : ''}
      <a href="${job.link}" target="_blank" rel="noopener noreferrer" 
         style="display: inline-block; background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 10px;">
        Apply Now →
      </a>
    </div>
  `).join('');

  // Generate summary section
  let summaryHtml = '';
  if (summary && summary !== 'No jobs to analyze.' && summary !== 'AI analysis not available.') {
    summaryHtml = `
      <div style="background: #f8f9fa; border: 1px solid #e9ecef; border-left: 6px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 8px;">
        <h3 style="margin: 0 0 15px 0; color: #667eea;">🤖 AI Market Analysis</h3>
        <div style="line-height: 1.6; color: #333;">
          ${marked.parse(summary)}
        </div>
      </div>
    `;
  }

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

        ${stats && (stats.serpApiJobs || stats.jsearchJobs) ? `
          <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 20px; text-align: center; font-size: 14px; color: #666;">
            Data Sources: 
            ${stats.serpApiJobs ? `SerpAPI (${stats.serpApiJobs})` : ''} 
            ${stats.serpApiJobs && stats.jsearchJobs ? ' • ' : ''}
            ${stats.jsearchJobs ? `JSearch (${stats.jsearchJobs})` : ''}
            ${stats.duplicatesRemoved ? ` • ${stats.duplicatesRemoved} duplicates removed` : ''}
          </div>
        ` : ''}
      </div>

      ${summaryHtml}

      <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin: 0 0 20px 0; color: #333; font-size: 24px;">Job Opportunities (${jobs.length > 50 ? 'Top 50' : 'All'})</h2>
        ${jobCardsHtml}
        
        ${jobs.length > 50 ? `
          <div style="text-align: center; padding: 20px; color: #666; font-style: italic;">
            Showing top 50 of ${jobs.length} results. Search again for updated listings.
          </div>
        ` : ''}
      </div>

      <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-top: 30px; text-align: center; color: #666; font-size: 14px;">
        <p style="margin: 0 0 10px 0;">This report was generated by AI Job Agent and sent to ${userEmail}</p>
        <p style="margin: 0;">💡 <strong>Tip:</strong> Job listings change frequently. For the most current opportunities, run a new search.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="margin: 0; font-size: 12px; opacity: 0.8;">
          Generated on ${new Date().toLocaleString()} • 
          <a href="mailto:${process.env.EMAIL_USER}" style="color: #667eea; text-decoration: none;">Contact Support</a>
        </p>
      </div>

    </body>
    </html>
  `;

  // Plain text version for email clients that don't support HTML
  const text = `
AI Job Agent - Job Search Report
Generated on ${searchDate}

SEARCH SUMMARY
Job Type: ${jobType}
Location: ${location}
Results Found: ${jobs.length} opportunities

${summary && summary !== 'No jobs to analyze.' && summary !== 'AI analysis not available.' ? `
AI MARKET ANALYSIS
${summary.replace(/[#*]/g, '').trim()}

` : ''}JOB LISTINGS
${jobs.slice(0, 30).map((job, index) => `
${index + 1}. ${job.title || 'Untitled Position'}
   Company: ${job.company || 'Not specified'}
   Location: ${job.location || location}
   Posted: ${job.date || 'Date not specified'}
   Source: ${job.source || 'Unknown'}
   Apply: ${job.link}
   ${job.salary && job.salary !== 'Not specified' ? `Salary: ${job.salary}` : ''}
`).join('')}

${jobs.length > 30 ? `\n... and ${jobs.length - 30} more opportunities. View the HTML version for complete listings.\n` : ''}

This report was sent to: ${userEmail}
For support, contact: ${process.env.EMAIL_USER}
  `;

  return { html, text };
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