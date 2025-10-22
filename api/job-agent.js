import { GoogleGenerativeAI } from "@google/generative-ai";
import nodemailer from "nodemailer";
import { marked } from "marked";
import { createClient } from "@supabase/supabase-js";

// ===== Supabase Setup =====
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CACHE_TTL = 60 * 30; // 30 minutes cache

async function getCache(cacheKey) {
  const { data, error } = await supabase
    .from("job_cache")
    .select("data, expires_at")
    .eq("cache_key", cacheKey)
    .single();

  if (error || !data) return null;

  if (new Date(data.expires_at) < new Date()) {
    await supabase.from("job_cache").delete().eq("cache_key", cacheKey);
    return null;
  }

  return data.data;
}

async function setCache(cacheKey, responseData) {
  const expiresAt = new Date(Date.now() + CACHE_TTL * 1000).toISOString();

  await supabase.from("job_cache").upsert({
    cache_key: cacheKey,
    data: responseData,
    expires_at: expiresAt
  });
}

export default async function handler(req, res) {
  try {
    const serpApiKey = process.env.SERPAPI_KEY;
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY;
    const jsearchApiKey = process.env.JSEARCH_API_KEY;

    const { jobType = "Software Engineer", location = "Bangalore, India" } = req.query;

    console.log("🚀 Starting job search for:", { jobType, location });
    console.log("🔑 API Keys available:", {
      serpApi: !!serpApiKey,
      jsearch: !!jsearchApiKey,
      gemini: !!geminiApiKey
    });

    let serpJobs = [];
    let jsearchJobs = [];
    const errors = [];
    let nextPageToken = null;

    // ========== Fetch from SerpAPI ==========
if (serpApiKey) {
      const serpCacheKey = `serpapi_${jobType}_${location}`;
      const cachedSerp = await getCache(serpCacheKey);

      if (cachedSerp) {
        console.log("⚡ Using cached SerpAPI results");
        serpJobs = cachedSerp;
      } else {
        try {
          console.log("📡 Fetching from SerpAPI with pagination...");

          let nextPageToken = null;
          for (let page = 0; page < 3; page++) {
            const params = new URLSearchParams({
              engine: "google_jobs",
              q: jobType,
              location: location,
              api_key: serpApiKey,
              hl: "en",
              gl: "in"
            });

            if (nextPageToken) params.set("next_page_token", nextPageToken);

            const url = `https://serpapi.com/search.json?${params.toString()}`;
            console.log(`🔍 SerpAPI Page ${page + 1}:`, url.replace(serpApiKey, "***"));

            const response = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; JobAgent/1.0)" }
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`SerpAPI Error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            if (data.jobs_results?.length > 0) {
              const pageJobs = data.jobs_results.map((job, index) => ({
                id: job.job_id || `serp-${page}-${index}`,
                title: job.title || "No Title",
                company: job.company_name || "Unknown Company",
                location: job.location || location,
                date: job.detected_extensions?.posted_at ||
                      job.extensions?.find(ext => ext.includes("ago"))?.trim() ||
                      "Date not specified",
                source: job.via || "Google Jobs",
                link: job.apply_options?.[0]?.link ||
                      job.share_link ||
                      `https://www.google.com/search?q=${encodeURIComponent(job.title + " " + job.company_name)}`,
                description: job.description || "",
                salary: job.detected_extensions?.salary || "Not specified"
              }));

              serpJobs.push(...pageJobs);
            } else {
              break;
            }

            if (data.serpapi_pagination?.next_page_token) {
              nextPageToken = data.serpapi_pagination.next_page_token;
              await new Promise(resolve => setTimeout(resolve, 2000)); // token delay
            } else break;
          }

          if (serpJobs.length > 0) {
            console.log(`✅ Caching ${serpJobs.length} SerpAPI jobs`);
            await setCache(serpCacheKey, serpJobs);
          }
        } catch (error) {
          console.error("❌ SerpAPI fetch failed:", error.message);
          errors.push(`SerpAPI Error: ${error.message}`);
        }
      }
    }


    if (jsearchApiKey) {
          const jsearchCacheKey = `jsearch_${jobType}_${location}`;
          const cachedJSearch = await getCache(jsearchCacheKey);

          if (cachedJSearch) {
            console.log("⚡ Using cached JSearch results");
            jsearchJobs = cachedJSearch;
          } else {
            try {
              console.log("📡 Fetching from JSearch...");

              const params = new URLSearchParams({
                query: jobType,
                page: "1",
                num_pages: "3",
                date_posted: "all",
                remote_jobs_only: "false"
              });

              if (location) params.set("location", location);

              const url = `https://jsearch.p.rapidapi.com/search?${params.toString()}`;
              const response = await fetch(url, {
                method: "GET",
                headers: {
                  "X-RapidAPI-Key": jsearchApiKey,
                  "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
                  "User-Agent": "JobAgent/1.0"
                },
                timeout: 30000
              });

              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`JSearch Error ${response.status}: ${errorText}`);
              }

              const jsearchData = await response.json();
              if (jsearchData.data?.length > 0) {
                jsearchJobs = jsearchData.data.map((job, index) => ({
                  id: job.job_id || `jsearch-${index}`,
                  title: job.job_title || "No Title",
                  company: job.employer_name || "Unknown Company",
                  location: job.job_city || job.job_country || job.job_state || "Location not specified",
                  date: job.job_posted_at_datetime_utc
                    ? new Date(job.job_posted_at_datetime_utc).toLocaleDateString()
                    : (job.job_posted_at_timestamp
                      ? new Date(job.job_posted_at_timestamp * 1000).toLocaleDateString()
                      : "Date not specified"),
                  source: job.job_publisher || "JSearch",
                  link: job.job_apply_link || job.job_google_link || "#",
                  description: job.job_description || "",
                  salary: job.job_min_salary && job.job_max_salary
                    ? `$${job.job_min_salary} - $${job.job_max_salary}`
                    : "Not specified"
                }));

                console.log(`✅ Caching ${jsearchJobs.length} JSearch jobs`);
                await setCache(jsearchCacheKey, jsearchJobs);
              }
            } catch (error) {
              console.error("❌ JSearch fetch failed:", error.message);
              errors.push(`JSearch Error: ${error.message}`);
            }
          }
        }

    // ========== Combine and Deduplicate ==========
    console.log("📊 Raw job counts:", {
      serpApi: serpJobs.length,
      jsearch: jsearchJobs.length,
      total: serpJobs.length + jsearchJobs.length
    });

    // Combine all jobs
    const allJobsRaw = [...serpJobs, ...jsearchJobs];

    // Enhanced deduplication
    const seen = new Map();
    const finalJobs = allJobsRaw.filter((job) => {
      // Create a more robust key for deduplication
      const normalizeString = (str) => str?.toLowerCase().trim().replace(/[^\w\s]/g, '') || '';
      const key = `${normalizeString(job.title)}_${normalizeString(job.company)}`;

      if (seen.has(key)) {
        console.log(`🔄 Duplicate found: ${job.title} at ${job.company}`);
        return false;
      }
      seen.set(key, true);
      return true;
    });

    console.log(`✅ After deduplication: ${finalJobs.length} unique jobs`);

    // ========== Handle empty results ==========
    if (finalJobs.length === 0) {
      const message = errors.length > 0 ?
        `No jobs found. Errors encountered: ${errors.join('; ')}` :
        "No jobs found from any source.";

      return res.status(200).json({
        success: true,
        message,
        jobs: [],
        summary: "No jobs to analyze.",
        errors,
        debug: {
          serpApiConfigured: !!serpApiKey,
          jsearchConfigured: !!jsearchApiKey,
          searchParams: { jobType, location }
        },
        timestamp: new Date().toISOString(),
      });
    }

    // ========== AI Summarization ==========
    let aiAnalysis = "AI analysis not available.";
    if (geminiApiKey && finalJobs.length > 0) {
      try {
        console.log("🤖 Generating AI analysis...");
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `
Analyze these ${finalJobs.length} job postings for "${jobType}" roles in "${location}":

${JSON.stringify(finalJobs.slice(0, 20), null, 2)}

Provide a structured analysis in Markdown format with these sections:

## Summary
- 3-4 bullet points about hiring trends and opportunities

## Role Distribution
- Count of different role types found
- Common job titles and variations

## Company Insights
- Top hiring companies (by frequency)
- Mix of company sizes/types

## Requirements & Skills
- Most commonly mentioned skills
- Experience levels requested

## Compensation
- Salary information where available
- Note if most postings lack salary data

## Job Market Trends
- Posting dates and recency
- Geographic distribution within the area

Keep the analysis factual and based only on the provided data.
        `;

        const aiResponse = await model.generateContent(prompt);
        aiAnalysis = aiResponse.response.text();
        console.log("✅ AI analysis generated successfully");
      } catch (error) {
        console.error("❌ Gemini analysis failed:", error.message);
        errors.push(`AI Analysis Error: ${error.message}`);
      }
    }

    // ========== Email (Optional) ==========
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.EMAIL_TO && finalJobs.length > 0) {
      try {
        console.log("📧 Sending email report...");
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        const jobListHtml = finalJobs.slice(0, 20).map(job =>
          `<li><strong>${job.title}</strong> at ${job.company}<br>
           📍 ${job.location} | 📅 ${job.date}<br>
           <a href="${job.link}" target="_blank">Apply via ${job.source}</a></li>`
        ).join("");

        const htmlContent = marked.parse(aiAnalysis);

        await transporter.sendMail({
          from: `"AI Job Agent" <${process.env.EMAIL_USER}>`,
          to: process.env.EMAIL_TO,
          subject: `🎯 ${finalJobs.length} ${jobType} Jobs Found in ${location}`,
          html: `
            <h2>Job Search Report</h2>
            <p><strong>Search:</strong> ${jobType} in ${location}</p>
            <p><strong>Found:</strong> ${finalJobs.length} unique opportunities</p>

            <h3>Top Jobs</h3>
            <ol>${jobListHtml}</ol>

            <hr>
            <h3>Market Analysis</h3>
            ${htmlContent}

            <hr>
            <p><small>Report generated on ${new Date().toLocaleString()}</small></p>
          `,
        });
        console.log("✅ Email sent successfully");
      } catch (emailError) {
        console.error("❌ Email failed:", emailError.message);
        errors.push(`Email Error: ${emailError.message}`);
      }
    }

    // ========== Final Response ==========
    res.status(200).json({
      success: true,
      message: `Successfully found ${finalJobs.length} ${jobType} jobs in ${location}`,
      jobs: finalJobs,
      summary: aiAnalysis,
      stats: {
        serpApiJobs: serpJobs.length,
        jsearchJobs: jsearchJobs.length,
        totalUnique: finalJobs.length,
        duplicatesRemoved: (serpJobs.length + jsearchJobs.length) - finalJobs.length
      },
      searchParams: { jobType, location },
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error("❌ Fatal error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
}