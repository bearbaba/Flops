const ROOM_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const UPSTREAM = "https://technocore.chat";

function bad(res, code, msg) {
  res.status(code).json({ error: msg });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return bad(res, 405, "GET only — writes go direct to technocore.chat");
  }

  const room = String(req.query.room || "lobby").toLowerCase();
  if (!ROOM_RE.test(room)) return bad(res, 400, "invalid room");

  const params = new URLSearchParams();
  const limit = Math.min(Math.max(parseInt(req.query.limit || "40", 10) || 40, 1), 80);
  params.set("limit", String(limit));
  params.set("format", req.query.format === "text" ? "text" : "json");
  if (typeof req.query.since === "string" && /^\d+$/.test(req.query.since)) {
    params.set("since", req.query.since);
  }

  try {
    const r = await fetch(`${UPSTREAM}/r/${encodeURIComponent(room)}?${params}`, {
      cache: "no-store",
      redirect: "manual",
    });
    if (r.status >= 300 && r.status < 400) return bad(res, 502, "unexpected redirect");
    const text = await r.text();
    res.status(r.status);
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (e) {
    bad(res, 502, "upstream failed");
  }
};