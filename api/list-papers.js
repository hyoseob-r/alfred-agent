import fs from "fs";
import path from "path";

function getMeta(content, name) {
  const m = content.match(new RegExp(`<meta name="${name}" content="([^"]+)"`, "i"));
  return m ? m[1].trim() : null;
}

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const publicDir = path.join(process.cwd(), "public");
    const files = fs.readdirSync(publicDir).filter(f => f.endsWith(".html"));

    const papers = files.map(filename => {
      const content = fs.readFileSync(path.join(publicDir, filename), "utf-8");
      const titleMatch = content.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : filename.replace(".html", "");
      const descMatch = content.match(/header-tag[^>]*>([^<]+)</i);
      const tag = descMatch ? descMatch[1].trim() : null;

      return {
        filename,
        title,
        tag,
        path: `/${filename}`,
        created: getMeta(content, "doc-created"),
        updated: getMeta(content, "doc-updated"),
        status: getMeta(content, "doc-status") || "in-progress",
      };
    });

    // proposal 먼저, mockup 다음, 나머지 순 정렬
    papers.sort((a, b) => {
      const order = f => f.startsWith("proposal") ? 0 : f.startsWith("mockup") ? 1 : 2;
      return order(a.filename) - order(b.filename) || a.filename.localeCompare(b.filename);
    });

    res.status(200).json({ papers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
