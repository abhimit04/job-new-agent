🤖 AI-Powered Job Agent
This project is a powerful backend API that serves as an AI-powered job agent. It fetches job listings from multiple sources, deduplicates them, analyzes the job market using a large language model, and can even send a comprehensive report via email. It's built with Node.js, Express (or similar), and uses various third-party APIs to deliver a rich, actionable report.

✨ Features
Multi-Source Job Scraping: Fetches job listings from popular platforms using SerpAPI and JSearch (RapidAPI).

Intelligent Deduplication: Automatically combines results from different sources and removes duplicate entries to provide a clean, unique list of opportunities.

AI-Powered Market Analysis: Uses the Google Gemini API to analyze the collected job data and generate a structured summary of market trends, common skills, and top companies.

Automated Email Reports: Can send a well-formatted email with the top job listings and the AI-generated analysis using Nodemailer.

Robust Error Handling: Provides clear status messages and debugging information, including which APIs are configured and any issues encountered during data fetching or analysis.

Scalable Architecture: The code is designed to be easily integrated into a full-stack application, with a clear separation of concerns.

🛠️ Requirements
To run this project, you'll need the following:

Node.js: The runtime environment for the application.

API Keys: You must have accounts and API keys for at least one job data source and the AI model.

SerpAPI Key: Get one from serpapi.com. This is for Google Jobs searches.

JSearch API Key: Get one from RapidAPI JSearch.

Google Gemini API Key: Get one from Google AI Studio.

Email Credentials: For the optional email functionality, you'll need credentials for a service like Gmail.

🚀 Getting Started
1. Project Setup
   Clone the repository and install the required dependencies:

Bash

git clone https://github.com/your-username/ai-job-agent.git
cd ai-job-agent
npm install
Note: The dependencies are nodemailer, @google/generative-ai, marked, and node-fetch. You may need to install them individually if they are not already in your package.json.

2. Environment Variables
   Create a .env file in the root of your project to store your API keys and credentials. This keeps sensitive information secure.

Ini, TOML

# API Keys (at least one job API key is required)
SERPAPI_KEY="your_serpapi_key_here"
JSEARCH_API_KEY="your_jsearch_rapidapi_key_here"
GOOGLE_AI_API_KEY="your_gemini_api_key_here"

# Optional: Email Configuration for Reports
EMAIL_USER="your_email@gmail.com"
EMAIL_PASS="your_app_password"  # Use an App Password for security, not your regular password
EMAIL_TO="recipient_email@example.com"
For Gmail users: You must generate an App Password for Nodemailer to work. Do not use your regular account password.

3. Running the Project
   This code is written as a serverless function handler, but you can easily adapt it to a Node.js Express server.

Example with Express:

JavaScript

// server.js
const express = require('express');
const handler = require('./path/to/your/handler.js').default; // Adjust the path
const app = express();
app.get('/api/job-agent', handler);
app.listen(3000, () => console.log('Server running on http://localhost:3000'));
Run the server with the following command:

Bash

node server.js
📝 Usage
Once the server is running, you can access the API endpoint to search for jobs.

API Endpoint
Endpoint: /api/job-agent

Method: GET

Query Parameters:

jobType (optional, default: Software Engineer): The type of job to search for.

location (optional, default: Bangalore, India): The geographic location for the job search.

Example Requests
Basic Search:

http://localhost:3000/api/job-agent?jobType=Project%20Manager&location=Bengaluru
Using Defaults:

http://localhost:3000/api/job-agent
The API will return a JSON object containing the search results, AI analysis, and other relevant statistics.

🤝 Contributing
Contributions are welcome! If you find a bug or have an idea for a new feature, please open an issue or submit a pull request.