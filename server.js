require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { randomUUID } = require("node:crypto");

let supabase;
try {
  ({ supabase } = require("./supabase"));
} catch (error) {
  // Fail clearly at startup instead of serving an API that cannot persist data.
  console.error(`[configuration] ${error.message}`);
  process.exit(1);
}

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const allowedOrigin = process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5500";
const MATERIAL_TYPES = new Set(["Notes", "Past Papers", "Presentation", "Reference", "Other"]);
const FIELDS = ["title", "subject", "type", "url", "description", "author"];

app.disable("x-powered-by");
app.use(cors({ origin: allowedOrigin.split(",").map((value) => value.trim()), methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] }));
app.use(express.json({ limit: "32kb" }));

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function validateMaterial(input, partial = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Request body must be a JSON object." };
  const result = {};
  for (const field of FIELDS) {
    if (partial && !(field in input)) continue;
    if (field === "type") {
      const value = cleanString(input[field]);
      if (!MATERIAL_TYPES.has(value)) return { error: "Type must be Notes, Past Papers, Presentation, Reference, or Other." };
      result.type = value;
      continue;
    }
    const value = cleanString(input[field]);
    const max = { title: 120, subject: 80, url: 2048, description: 1000, author: 80 }[field];
    if (!partial && ["title", "subject", "url"].includes(field) && !value) return { error: `${field} is required.` };
    if (partial && ["title", "subject", "url"].includes(field) && field in input && !value) return { error: `${field} cannot be empty.` };
    if (value.length > max) return { error: `${field} must be ${max} characters or fewer.` };
    if (field === "url" && value) {
      try {
        const parsed = new URL(value);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("bad protocol");
      } catch { return { error: "url must be a valid http or https URL." }; }
    }
    result[field] = value || (["description", "author"].includes(field) ? null : value);
  }
  return { data: result };
}
function isUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function dbError(res, error, context = "Database request failed") {
  console.error(`[${context}]`, error.message || error);
  if (error.code === "PGRST116") return res.status(404).json({ error: "Material not found." });
  return res.status(500).json({ error: "The database could not complete this request. Check schema setup and server logs." });
}
app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "study-material-sharing-hub-api" }));

app.get("/api/materials", async (req, res) => {
  const query = supabase.from("materials").select("id,title,subject,type,url,description,author,created_at,updated_at").order("created_at", { ascending: false }).limit(200);
  try {
    const { data, error } = await query;
    if (error) return dbError(res, error, "list materials");
    res.json({ data: data || [] });
  } catch (error) { dbError(res, error, "list materials"); }
});

app.get("/api/materials/:id", async (req, res) => {
  if (!isUUID(req.params.id)) return res.status(400).json({ error: "Material ID must be a valid UUID." });
  try {
    const { data, error } = await supabase.from("materials").select("*").eq("id", req.params.id).maybeSingle();
    if (error) return dbError(res, error, "get material");
    if (!data) return res.status(404).json({ error: "Material not found." });
    res.json({ data });
  } catch (error) { dbError(res, error, "get material"); }
});

app.post("/api/materials", async (req, res) => {
  const validation = validateMaterial(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  try {
    const { data, error } = await supabase.from("materials").insert(validation.data).select().single();
    if (error) return dbError(res, error, "create material");
    res.status(201).json({ data });
  } catch (error) { dbError(res, error, "create material"); }
});

app.put("/api/materials/:id", async (req, res) => {
  if (!isUUID(req.params.id)) return res.status(400).json({ error: "Material ID must be a valid UUID." });
  const validation = validateMaterial(req.body, true);
  if (validation.error) return res.status(400).json({ error: validation.error });
  if (!Object.keys(validation.data || {}).length) return res.status(400).json({ error: "Provide at least one field to update." });
  try {
    const { data, error } = await supabase.from("materials").update(validation.data).eq("id", req.params.id).select().maybeSingle();
    if (error) return dbError(res, error, "update material");
    if (!data) return res.status(404).json({ error: "Material not found." });
    res.json({ data });
  } catch (error) { dbError(res, error, "update material"); }
});

app.delete("/api/materials/:id", async (req, res) => {
  if (!isUUID(req.params.id)) return res.status(400).json({ error: "Material ID must be a valid UUID." });
  try {
    const { data, error } = await supabase.from("materials").delete().eq("id", req.params.id).select("id").maybeSingle();
    if (error) return dbError(res, error, "delete material");
    if (!data) return res.status(404).json({ error: "Material not found." });
    res.json({ message: "Material deleted successfully.", id: data.id });
  } catch (error) { dbError(res, error, "delete material"); }
});

app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));
app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && "body" in error) return res.status(400).json({ error: "Invalid JSON request body." });
  console.error("[unhandled]", error);
  res.status(500).json({ error: "Unexpected server error." });
});

const server = app.listen(PORT, () => console.log(`StudyHub API listening on http://localhost:${PORT}`));
function shutdown() { server.close(() => process.exit(0)); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
