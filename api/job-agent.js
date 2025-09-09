import { GoogleGenerativeAI } from "@google/generative-ai";
import nodemailer from "nodemailer";
import { marked } from "marked";

// ====== Simple In-Memory Cache ======
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes

export default async function handler(req, res) {
  try {
    const serpApiKey = process.env.SERPAPI_KEY;
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY;
    const jsearchApiKey = process.env.JSEARCH_API_KEY;

    const { jobType = "Software Engineer", location = "Bangalore, India" } = req.query;

    const cacheKey = `${jobType.toLowerCase()}_${location.toLowerCase()}`;
    const cached = cache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log("⚡ Serving from cache:", cacheKey);
      return res.status(200).json(cached.data);
    }

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

    // ===== SerpAPI fetch (unchanged) =====
    if (serpApiKey) {
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

          if (nextPageToken) {
            params.set("next_page_token", nextPageToken);
          }

          const url = `https://serpapi.com/search.json?${params.toString()}`;
          console.log(`🔍 SerpAPI Page ${page + 1}:`, url.replace(serpApiKey, "***"));

          const response = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; JobAgent/1.0)" }
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ SerpAPI Error ${response.status}:`, errorText);
            errors.push(`SerpAPI Error ${response.status}: ${errorText}`);
            break;
          }

          const data = await response.json();
          console.log("📊 SerpAPI Response:", {
            jobsCount: data.jobs_results?.length || 0,
            hasNextPage: !!data.serpapi_pagination?.next_page_token
          });

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
            console.log(`✅ Added ${pageJobs.length} jobs from SerpAPI page ${page + 1}`);
          } else {
            console.log(`⚠️ No jobs found on SerpAPI page ${page + 1}`);
            break;
          }

          if (data.serpapi_pagination?.next_page_token) {
            nextPageToken = data.serpapi_pagination.next_page_token;
            console.log(`➡️ Found next_page_token for page ${page + 2}`);
          } else {
            console.log("⏹️ No more pages available.");
            break;
          }

          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error("❌ SerpAPI fetch failed:", error.message);
        errors.push(`SerpAPI Error: ${error.message}`);
      }
    } else {
      console.log("⚠️ SerpAPI key not provided");
    }

    // ===== JSearch fetch (unchanged) =====
    if (jsearchApiKey) {
      try {
        console.log("📡 Fetching from JSearch...");

        const params = new URLSearchParams({
          query: jobType,
          page: "1",
          num_pages: "3",
          date_posted: "all",
          remote_jobs_only: "false"
        });

        if (location) {
          params.set("location", location);
        }

        const url = `https://jsearch.p.rapidapi.com/search?${params.toString()}`;
        console.log("🔍 JSearch URL:", url);

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
          console.error(`❌ JSearch Error ${response.status}:`, errorText);
          errors.push(`JSearch Error ${response.status}: ${errorText}`);
        } else {
          const jsearchData = await response.json();
          console.log("📊 JSearch Response structure:", {
            status: jsearchData.status,
            requestId: jsearchData.request_id,
            hasData: !!jsearchData.data,
            dataCount: jsearchData.data?.length || 0,
            parameters: jsearchData.parameters
          });

          if (jsearchData.data && jsearchData.data.length > 0) {
            jsearchJobs = jsearchData.data.map((job, index) => ({
              id: job.job_id || `jsearch-${index}`,
              title: job.job_title || "No Title",
              company: job.employer_name || "Unknown Company",
              location: job.job_city || job.job_country || job.job_state || "Location not specified",
              date: job.job_posted_at_datetime_utc ?
                    new Date(job.job_posted_at_datetime_utc).toLocaleDateString() :
                    (job.job_posted_at_timestamp ?
                     new Date(job.job_posted_at_timestamp * 1000).toLocaleDateString() :
                     "Date not specified"),
              source: job.job_publisher || "JSearch",
              link: job.job_apply_link || job.job_google_link || "#",
              description: job.job_description || "",
              salary: job.job_min_salary && job.job_max_salary ?
                     `$${job.job_min_salary} - $${job.job_max_salary}` :
                     "Not specified"
            }));
            console.log(`✅ Added ${jsearchJobs.length} jobs from JSearch`);
          } else {
            console.log("⚠️ No jobs found in JSearch response");
          }
        }
      } catch (error) {
        console.error("❌ JSearch fetch failed:", error.message);
        errors.push(`JSearch Error: ${error.message}`);
      }
    } else {
      console.log("⚠️ JSearch API key not provided");
    }

    // ===== Combine & Deduplicate =====
    const allJobsRaw = [...serpJobs, ...jsearchJobs];

    const seen = new Map();
    const finalJobs = allJobsRaw.filter((job) => {
      const normalizeString = (str) => str?.toLowerCase().trim().replace(/[^\w\s]/g, '') || '';
      const key = `${normalizeString(job.title)}_${normalizeString(job.company)}`;

      if (seen.has(key)) return false;
      seen.set(key, true);
      return true;
    });

    console.log(`✅ After deduplication: ${finalJobs.length} unique jobs`);

    // ===== Limit to top 20 jobs =====
    const limitedJobs = finalJobs.slice(0, 20);

    // ====== AI Summarization (unchanged except limitedJobs) ======
    let aiAnalysis = "AI analysis not available.";
    if (geminiApiKey && limitedJobs.length > 0) {
      try {
        console.log("🤖 Generating AI analysis...");
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
Analyze these ${limitedJobs.length} job postings for "${jobType}" roles in "${location}":

${JSON.stringify(limitedJobs, null, 2)}

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

    // ===== Final Response =====
    const responseData = {
      success: true,
      message: `Successfully found ${limitedJobs.length} ${jobType} jobs in ${location}`,
      jobs: limitedJobs,
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
    };

    // Save to cache
    cache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    res.status(200).json(responseData);

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
