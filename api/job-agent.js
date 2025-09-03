import { GoogleGenerativeAI } from "@google/generative-ai";
import nodemailer from "nodemailer";
import { marked } from "marked";

export default async function handler(req, res) {
  try {
    const serpApiKey = process.env.SERPAPI_KEY;
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY;
    const jsearchApiKey = process.env.JSEARCH_API_KEY;

    const { jobType, location } = req.query;

    // Validate required parameters
    if (!jobType || !location) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: jobType and location"
      });
    }

    let serpJobs = [];
    let jsearchJobs = [];
    let nextPageToken = null;

    // ========== Fetch from SerpAPI ==========
    if (serpApiKey) {
      try {
        for (let page = 0; page < 3; page++) { // fetch up to 3 pages
          const searchQuery = jobType;
          console.log("🔎 Searching for:", searchQuery, "in", location);
          const url = new URL("https://serpapi.com/search.json");
          url.searchParams.set("engine", "google_jobs");
          url.searchParams.set("q", searchQuery);
          url.searchParams.set("location", location);
          url.searchParams.set("api_key", serpApiKey);
          if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);

          const response = await fetch(url);
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`SerpAPI Error ${response.status}: ${errorText}`);
          }

          const data = await response.json();
          serpJobs.push(
            ...(data.jobs_results || []).map((job) => ({
              title: job.title,
              company: job.company_name,
              location: job.location,
              date: job.detected_extensions?.posted_at || "N/A",
              source: job.via || "Google Jobs",
              link:
                job.apply_options?.[0]?.link ||
                `https://www.google.com/search?q=${encodeURIComponent(job.job_id)}`,
            }))
          );

          // stop if no next page
          if (!data.serpapi_pagination?.next_page_token) break;
          nextPageToken = data.serpapi_pagination.next_page_token;

          // API recommends small delay before next call (to allow token activation)
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (e) {
        console.warn("⚠️ SerpAPI fetch failed:", e.message);
      }
    }

    // ========== Fetch from JSearch ==========
    if (jsearchApiKey) {
      try {
        const searchQuery = jobType; // Define searchQuery for JSearch
        const jsearchResponse = await fetch(
          `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(searchQuery)}&location=${encodeURIComponent(location)}&page=1&num_pages=5`,
          {
            method: "GET",
            headers: {
              "X-RapidAPI-Key": jsearchApiKey,
              "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
            },
          }
        );

        if (!jsearchResponse.ok) {
          const errorText = await jsearchResponse.text();
          throw new Error(`JSearch Error ${jsearchResponse.status}: ${errorText}`);
        }

        const jsearchData = await jsearchResponse.json();
        jsearchJobs = (jsearchData.data || []).map((job) => ({
          title: job.job_title,
          company: job.employer_name,
          location: job.job_city || job.job_location || "N/A",
          date: job.job_posted_at || "N/A",
          source: job.job_publisher || "JSearch",
          link: job.job_apply_link || job.job_google_link || "#",
        }));
      } catch (e) {
        console.warn("⚠️ JSearch fetch failed:", e.message);
      }
    }

    // ========== Combine and Deduplicate ==========
    console.log("Raw SerpAPI jobs:", serpJobs.length);
    console.log("Raw JSearch jobs:", jsearchJobs.length);

    // Combine all jobs
    const allJobsRaw = [...serpJobs, ...jsearchJobs];
    console.log("After joining both feeds:", allJobsRaw.length);

    // Deduplicate based on title, company, and location
    const seen = new Set();
    const finalJobs = allJobsRaw.filter((job) => {
      const key = `${job.title}|${job.company}|${job.location}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log("After deduplication:", finalJobs.length);

    if (finalJobs.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No jobs found (both APIs returned empty).",
        jobs: [],
        summary: "No jobs to report.",
        timestamp: new Date().toISOString(),
      });
    }

    // ========== AI Summarization ==========
    let aiAnalysis = "AI analysis not available.";
    if (geminiApiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
        You are an analyst. You are given ${finalJobs.length} recent ${location} job postings for ${jobType} roles (JSON array).
        Each item has: title, company, location, date, source, link, and may or may not include salary/compensation fields.

        TASKS (use ONLY the provided data; do not invent facts):
        1) **Summary (bullets)**
           - Provide 3–5 bullet points summarizing hiring momentum, roles, and seniority mix.

        2) **Role Mix & Skills (bullets & counts)**
           - Show counts by role buckets: ${jobType} and related roles.
           - List recurring skills/keywords you detect (Agile, Jira, Cloud, AI/ML, etc.).

        3) **Trend Analysis (short paragraphs + bullets)**
           - Note hiring themes (Agile at scale, digital transformation, etc.).
           - Comment on seniority tilt (junior/mid/senior) from titles.
           - Show source split (different job boards).

        4) **Compensation Insight (bullets)**
           - Count how many postings include pay.
           - Extract min/max and compute simple averages if available.
           - Report by role bucket if possible.
           - If no pay info → write clearly: *"Compensation not specified in these postings."*

        5) **Best Companies (bulleted top 5–10)**
           - Rank by frequency in this dataset.

        6) **Curated Job List (bullets)**
           - Format: **[Company — Role](link)**
           - One per line.

        OUTPUT FORMAT:
        Use **Markdown** with clear sections:

        ## Summary
        • point 1
        • point 2

        ## Role Mix & Skills
        - Count 1
        - Count 2

        ## Trends
        Paragraph text here.
        - Bullet if needed

        ## Compensation
        - …

        ## Best Companies
        1. Company — N
        2. Company — N

        ## Job List
        - [Company — Role](Link)

        DATA (for your analysis only, do not dump raw JSON in the final output):
        ${JSON.stringify(finalJobs, null, 2)}
        `;

        const aiResponse = await model.generateContent(prompt);
        aiAnalysis = aiResponse.response.text();
      } catch (e) {
        console.warn("⚠️ Gemini summarization failed:", e.message);
      }
    }

    // ========== Email ==========
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.EMAIL_TO) {
      try {
        const jobListHtml = finalJobs
          .map(
            (job) =>
              `<li><b>${job.title}</b> at ${job.company} (${job.date})
              - <a href="${job.link}" target="_blank">${job.source}</a></li>`
          )
          .join("");

        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        const htmlContent = marked.parse(aiAnalysis);

        await transporter.sendMail({
          from: `"AI Job Agent" <${process.env.EMAIL_USER}>`,
          to: process.env.EMAIL_TO,
          subject: `Latest ${jobType} Jobs - ${location}`,
          html: `
            <h2>Job Report for ${jobType} in ${location}</h2>
            <h3>Found ${finalJobs.length} Jobs</h3>
            <ul>${jobListHtml}</ul>
            <hr>
            <h3>AI Analysis</h3>
            ${htmlContent}
          `,
        });
        console.log("✅ Email sent successfully");
      } catch (emailError) {
        console.warn("⚠️ Email sending failed:", emailError.message);
      }
    } else {
      console.log("📧 Email not configured - skipping email send");
    }

    // ========== Response ==========
    res.status(200).json({
      success: true,
      message: `Found ${finalJobs.length} jobs for ${jobType} in ${location}. Data fetched from ${
        serpJobs.length && jsearchJobs.length
          ? "SerpAPI + JSearch"
          : serpJobs.length
          ? "SerpAPI only"
          : jsearchJobs.length
          ? "JSearch only"
          : "no sources"
      }, deduplicated and ${process.env.EMAIL_TO ? "emailed" : "ready for use"}!`,
      jobs: finalJobs,
      summary: aiAnalysis,
      counts: {
        serpApi: serpJobs.length,
        jsearch: jsearchJobs.length,
        total: finalJobs.length
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ Job Agent Error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
}