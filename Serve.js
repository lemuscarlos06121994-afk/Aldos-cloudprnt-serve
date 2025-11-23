// server.js
//
// Simple CloudPRNT server for Aldo's Pizzeria
// - Receives orders from your kiosk (Netlify)
// - Stores them in a small in-memory queue
// - Talks to the Star mC-Print3 using the CloudPRNT HTTP protocol

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 3000;

// Allow your kiosk origin (change to your real netlify URL)
const ALLOWED_ORIGINS = [
  "https://brilliant-cascaron-a302b3.netlify.app",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://localhost:3000"
];

// ====== MIDDLEWARE ======
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(null, false);
    }
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

// ====== SIMPLE JOB QUEUE (MEMORY) ======
let nextJobId = 1;
// Each job: { id, token, content, status }
const jobs = [];

function makeToken(id) {
  return `job-${id}-${Date.now()}`;
}

// ====== API FOR YOUR KIOSK ======
app.post("/api/order", (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing 'text' field" });
  }

  const id = nextJobId++;
  const token = makeToken(id);

  jobs.push({
    id,
    token,
    content: text,
    status: "pending"
  });

  console.log(`🧾 New job queued: id=${id}, token=${token}`);
  return res.json({ ok: true, id, token });
});

// Debug (optional)
app.get("/api/debug/jobs", (req, res) => {
  res.json(jobs);
});

// ====== CLOUDPRNT ENDPOINT ======
// Configure printer to hit: https://TU-APP-RENDER.onrender.com/cloudprnt

// 1) Printer polls for job (POST)
app.post("/cloudprnt", (req, res) => {
  const printerStatus = req.body || {};
  console.log("📡 CloudPRNT POST from printer:", JSON.stringify(printerStatus));

  const job = jobs.find(j => j.status === "pending");

  if (!job) {
    return res.json({
      jobReady: 0,
      mediaTypes: ["text/plain"]
    });
  }

  job.status = "printing";

  const response = {
    jobReady: 1,
    jobToken: job.token,
    mediaTypes: ["text/plain"],
    pollInterval: 5
  };

  console.log(`✅ Sending job info to printer: token=${job.token}`);
  return res.json(response);
});

// 2) Printer GETs job data
app.get("/cloudprnt", (req, res) => {
  const token = req.query.job_token;
  if (!token) {
    return res.status(400).send("Missing job_token");
  }

  const job = jobs.find(j => j.token === token);
  if (!job) {
    return res.status(404).send("Job not found");
  }

  console.log(`🖨 Printer requesting job data: token=${token}`);

  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send(job.content);
});

// 3) Printer DELETEs to confirm result
app.delete("/cloudprnt", (req, res) => {
  const token = req.query.job_token;
  const status = req.query.status; // "0" = success

  if (!token) {
    return res.status(400).send("Missing job_token");
  }

  const job = jobs.find(j => j.token === token);
  if (!job) {
    return res.status(404).send("Job not found");
  }

  if (status === "0") {
    job.status = "done";
    console.log(`🎉 Job printed OK: token=${token}`);
  } else {
    job.status = "error";
    console.log(`⚠️ Job failed: token=${token}, status=${status}`);
  }

  return res.status(200).send("OK");
});

// Root
app.get("/", (req, res) => {
  res.send("Aldo's CloudPRNT server is running.");
});

app.listen(PORT, () => {
  console.log(`🚀 CloudPRNT server listening on port ${PORT}`);
});
