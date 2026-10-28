// Builds the occupation data from the official O*NET database.
// Runs automatically on Vercel during deploy (`npm run build`). No dependencies.
//
// Output:
//   public/occupations.json  -> searchable list for the browser (titles only, public data)
//   data/onet.json           -> server-only: description + tasks per occupation
//
// Override the source with ONET_DB_URL (a .zip URL) or ONET_DB_FILE (a local .zip path).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ONET_RELEASE = process.env.ONET_RELEASE || "30.3";
const DEFAULT_URL = `https://www.onetcenter.org/dl_files/database/db_${ONET_RELEASE.replace(".", "_")}_csv.zip`;

const MAX_TASKS = 15;
const MAX_JOB_TITLES = 10;

// ---------- ZIP reader (stored + deflate, which is all O*NET uses) ----------
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a zip file (no end-of-central-directory record).");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Corrupt zip central directory.");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    files.set(name, () => {
      if (method === 0) return Buffer.from(raw);
      if (method === 8) return inflateRawSync(raw);
      throw new Error(`Unsupported zip compression method ${method} for ${name}`);
    });
  }
  return files;
}

// ---------- CSV parser (RFC 4180: quotes, escaped quotes, newlines in fields) ----------
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delim = sniffDelimiter(text);
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"' && field === "") q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map((h) => h.trim());
  return { header, rows };
}

function sniffDelimiter(text) {
  const firstLine = text.slice(0, text.search(/\r?\n/) >>> 0 || 2000);
  return (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? "\t" : ",";
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function col(header, ...names) {
  for (const n of names) {
    const i = header.findIndex((h) => norm(h) === norm(n));
    if (i >= 0) return i;
  }
  throw new Error(`Column not found. Wanted one of ${names.join(" / ")}; have: ${header.join(", ")}`);
}

function optCol(header, ...names) {
  try { return col(header, ...names); } catch { return -1; }
}

function findFile(files, ...basenames) {
  const wanted = basenames.map(norm);
  for (const [name, read] of files) {
    const base = norm(name.split("/").pop().replace(/\.(csv|txt)$/i, ""));
    if (wanted.includes(base)) return { name, read };
  }
  return null;
}

// ---------- Build ----------
export function buildFromZip(zipBuf, release = ONET_RELEASE) {
  const files = readZip(zipBuf);
  const occFile = findFile(files, "occupation_data", "Occupation Data");
  const taskFile = findFile(files, "task_statements", "Task Statements");
  const titleFile = findFile(files, "job_titles", "Alternate Titles");
  if (!occFile || !taskFile) {
    throw new Error(`O*NET zip is missing occupation or task files. Found: ${[...files.keys()].slice(0, 40).join(", ")}`);
  }

  const occ = parseCsv(occFile.read().toString("utf8"));
  const oCode = col(occ.header, "O*NET-SOC Code");
  const oTitle = col(occ.header, "Title");
  const oDesc = col(occ.header, "Description");

  const occupations = new Map();
  for (const r of occ.rows) {
    const code = (r[oCode] || "").trim();
    if (!/^\d{2}-\d{4}\.\d{2}$/.test(code)) continue;
    occupations.set(code, { title: r[oTitle].trim(), description: (r[oDesc] || "").trim(), tasks: [], altTitles: [] });
  }

  const ts = parseCsv(taskFile.read().toString("utf8"));
  const tCode = col(ts.header, "O*NET-SOC Code");
  const tId = optCol(ts.header, "Task ID");
  const tText = col(ts.header, "Task");
  const tType = optCol(ts.header, "Task Type");
  for (const r of ts.rows) {
    const o = occupations.get((r[tCode] || "").trim());
    if (!o) continue;
    const text = (r[tText] || "").trim();
    if (!text) continue;
    o.tasks.push({ id: tId >= 0 ? String(r[tId]).trim() : String(o.tasks.length + 1), text, core: tType >= 0 ? /core/i.test(r[tType]) : true });
  }

  if (titleFile) {
    const jt = parseCsv(titleFile.read().toString("utf8"));
    const jCode = col(jt.header, "O*NET-SOC Code");
    const jTitle = col(jt.header, "Job Title", "Alternate Title");
    const jShort = optCol(jt.header, "Short Title");
    for (const r of jt.rows) {
      const o = occupations.get((r[jCode] || "").trim());
      if (!o) continue;
      for (const t of [r[jTitle], jShort >= 0 ? r[jShort] : ""]) {
        const v = (t || "").trim();
        if (v && v.length <= 60 && o.altTitles.length < MAX_JOB_TITLES && !o.altTitles.includes(v) && v !== o.title) o.altTitles.push(v);
      }
    }
  }

  const publicList = [];
  const serverData = { release, sourceUrl: "https://www.onetonline.org/", occupations: {} };
  for (const [code, o] of occupations) {
    if (o.tasks.length < 3) continue; // skip catch-all ("All Other") occupations with no task data
    const tasks = [...o.tasks.filter((t) => t.core), ...o.tasks.filter((t) => !t.core)].slice(0, MAX_TASKS);
    publicList.push({ c: code, t: o.title, a: o.altTitles });
    serverData.occupations[code] = { title: o.title, description: o.description, tasks };
  }
  publicList.sort((a, b) => a.t.localeCompare(b.t));
  return { publicList, serverData };
}

async function main() {
  let zip;
  if (process.env.ONET_DB_FILE) {
    zip = readFileSync(process.env.ONET_DB_FILE);
  } else {
    const url = process.env.ONET_DB_URL || DEFAULT_URL;
    console.log(`Downloading O*NET ${ONET_RELEASE} from ${url}`);
    const res = await fetch(url, { headers: { "User-Agent": "FutureProofCareers/1.0 (education; build script)" } });
    if (!res.ok) throw new Error(`O*NET download failed: HTTP ${res.status}. Check the release number at https://www.onetcenter.org/database.html and set ONET_RELEASE in Vercel.`);
    zip = Buffer.from(await res.arrayBuffer());
  }
  const { publicList, serverData } = buildFromZip(zip);
  if (publicList.length < 500) throw new Error(`Only ${publicList.length} occupations parsed; expected ~900. Aborting so a broken list is never deployed.`);

  mkdirSync(join(ROOT, "public"), { recursive: true });
  mkdirSync(join(ROOT, "data"), { recursive: true });
  writeFileSync(join(ROOT, "public", "occupations.json"), JSON.stringify({ release: ONET_RELEASE, occupations: publicList }));
  writeFileSync(join(ROOT, "data", "onet.json"), JSON.stringify(serverData));
  console.log(`O*NET ${ONET_RELEASE}: ${publicList.length} searchable occupations written.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    // If a previous good data file exists (e.g., committed), keep it rather than failing the deploy.
    if (existsSync(join(ROOT, "data", "onet.json")) && existsSync(join(ROOT, "public", "occupations.json"))) {
      console.warn(`WARNING: ${e.message}\nUsing the existing O*NET data files.`);
    } else {
      console.error(`ERROR: ${e.message}`);
      process.exit(1);
    }
  });
}
