const fs = require("node:fs/promises");
const path = require("node:path");

const KEY = "bug-blaster:leaderboard";
const LOCAL_FILE = path.join(process.cwd(), ".data", "scores.json");
const LIMIT = 10;

const DEFAULT_ROWS = [
  { initials: "BUG", score: 500 },
  { initials: "SUN", score: 350 },
  { initials: "RUN", score: 200 }
];

module.exports = async function handler(request, response) {
  setCors(response);
  if (request.method === "OPTIONS") return response.status(204).end();

  try {
    if (request.method === "GET") {
      return response.status(200).json({ scores: await readScores() });
    }

    if (request.method === "POST") {
      const body = await readBody(request);
      const initials = String(body.initials || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
      const score = Math.max(0, Math.floor(Number(body.score) || 0));
      if (initials.length !== 3 || !score) {
        return response.status(400).json({ error: "Expected 3 initials and a positive score." });
      }

      const scores = await readScores();
      scores.push({ initials, score });
      const nextScores = normalizeScores(scores);
      await writeScores(nextScores);
      return response.status(200).json({ scores: nextScores });
    }

    response.setHeader("Allow", "GET, POST, OPTIONS");
    return response.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    return response.status(500).json({ error: "Score service failed." });
  }
};

async function readScores() {
  const remote = await kvRequest("GET", KEY);
  if (remote.ok) return normalizeScores(remote.value || DEFAULT_ROWS);

  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    return normalizeScores(JSON.parse(raw));
  } catch {
    return DEFAULT_ROWS;
  }
}

async function writeScores(scores) {
  const remote = await kvRequest("SET", KEY, scores);
  if (remote.ok) return;
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(scores, null, 2));
}

async function kvRequest(command, key, value) {
  const baseUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!baseUrl || !token) return { ok: false };

  const args = command === "GET" ? [command, key] : [command, key, JSON.stringify(value)];
  const url = `${baseUrl}/${args.map(encodeURIComponent).join("/")}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return { ok: false };
  const data = await res.json();
  if (command === "GET") {
    return { ok: true, value: typeof data.result === "string" ? JSON.parse(data.result) : data.result };
  }
  return { ok: true };
}

function normalizeScores(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row.initials === "string" && Number.isFinite(Number(row.score)))
    .map((row) => ({
      initials: row.initials.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "A"),
      score: Math.max(0, Math.floor(Number(row.score)))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMIT);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 4096) {
        reject(new Error("Body too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Cache-Control", "no-store");
}
