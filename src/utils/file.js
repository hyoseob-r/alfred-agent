export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function isPdf(file) {
  return file.type === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf");
}

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line => {
    const vals = line.split(",");
    const obj = {};
    headers.forEach((h, i) => {
      const v = (vals[i] || "").trim().replace(/^"|"$/g, "");
      obj[h] = v !== "" && !isNaN(v) ? Number(v) : v;
    });
    return obj;
  });
  return { headers, rows };
}

export function computeStats(data) {
  if (!data) return null;
  const { headers, rows } = data;
  const stats = {};
  headers.forEach(h => {
    const vals = rows.map(r => r[h]).filter(v => v !== "" && v !== null && v !== undefined);
    const nums = vals.filter(v => typeof v === "number");
    if (nums.length > 0 && nums.length > vals.length * 0.5) {
      const sorted = [...nums].sort((a, b) => a - b);
      stats[h] = {
        type: "numeric", count: nums.length,
        mean: (nums.reduce((s, v) => s + v, 0) / nums.length).toFixed(2),
        min: sorted[0], max: sorted[sorted.length - 1],
        median: sorted[Math.floor(sorted.length / 2)],
      };
    } else {
      const freq = {};
      vals.forEach(v => { freq[String(v)] = (freq[String(v)] || 0) + 1; });
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);
      stats[h] = { type: "categorical", count: vals.length, top };
    }
  });
  return stats;
}
