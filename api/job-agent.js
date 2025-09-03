import { GoogleGenerativeAI } from "@google/generative-ai";
import nodemailer from "nodemailer";
import { marked } from "marked";

export default async function handler(req, res) {
  try {
    const { jobType, location } = req.query;

    if (!jobType || !location) {
      return res.status(400).json({ error: "Job type and location are required" });
    }

    // Build search query dynamically
    const searchQuery = jobType;

    console.log("🔎 Searching for:", searchQuery, "in", location);

    // ===== Fetch from SerpAPI =====
    const serpUrl = new URL("https://serpapi.com/search.json");
    serpUrl.searchParams.set("engine", "google_jobs");
    serpUrl.searchParams.set("q", searchQuery);
    serpUrl.searchParams.set("location", location);
    serpUrl.searchParams.set("api_key", process.env.SERPAPI_KEY);

    const serpResponse = await fetch(serpUrl);
    const serpData = await serpResponse.json();

    const serpJobs = (serpData.jobs_results || []).map((job) => ({
      title: job.title,
      company: job.company_name,
      location: job.location,
      date: job.detected_extensions?.posted_at || "N/A",
      source: job.via || "Google Jobs",
      link: job.apply_options?.[0]?.link || `https://www.google.com/search?q=${job.job_id}`,
    }));

    // ===== Fetch from JSearch =====
    const jsearchResponse = await fetch(
      `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(searchQuery)}&location=${encodeURIComponent(location)}&page=1&num_pages=3`,
      {
        method: "GET",
        headers: {
          "X-RapidAPI-Key": process.env.JSEARCH_API_KEY,
          "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
        },
      }
    );

    const jsearchData = await jsearchResponse.json();
    const jsearchJobs = (jsearchData.data || []).map((job) => ({
      title: job.job_title,
      company: job.employer_name,
      location: job.job_city || job.job_location || "N/A",
      date: job.job_posted_at || "N/A",
      source: job.job_publisher || "JSearch",
      link: job.job_apply_link || job.job_google_link,
    }));

    // Merge both sources
    const finalJobs = [...serpJobs, ...jsearchJobs];
    console.log(`✅ Found ${finalJobs.length} jobs`);

    res.status(200).json({
      success: true,
      searchQuery,
      location,
      jobs: finalJobs,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error("❌ Job Agent Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
