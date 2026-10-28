// Test helpers: build a small O*NET-style zip in memory (stored + deflated entries).
import { deflateRawSync, crc32 } from "node:zlib";

export function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, content, deflate = true] of entries) {
    const data = Buffer.from(content, "utf8");
    const comp = deflate ? deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const q = (s) => `"${String(s).replace(/"/g, '""')}"`;

// Fixture occupations. TEST DATA ONLY: task text is placeholder, not real O*NET content.
export const FIXTURE = [
  ["29-1131.00", "Veterinarians", "Diagnose and treat animals (fixture)."],
  ["15-1252.00", "Software Developers", "Design software (fixture)."],
  ["27-3031.00", "Public Relations Specialists", "Promote an organization's image (fixture)."],
  ["47-2111.00", "Electricians", "Install electrical systems (fixture)."],
  ["29-1141.00", "Registered Nurses", "Care for patients (fixture)."],
  ["17-2141.00", "Mechanical Engineers", "Design machines (fixture)."],
  ["23-1011.00", "Lawyers", "Advise clients on legal matters (fixture)."],
  ["27-1024.00", "Graphic Designers", "Create visual concepts (fixture)."],
  ["11-9199.00", "Managers, All Other", "Catch-all with no tasks (fixture)."],
];

export function fixtureZip({ folder = "db_30_3_csv/" } = {}) {
  const occ = ["O*NET-SOC Code,Title,Description", ...FIXTURE.map((r) => r.map(q).join(","))].join("\r\n");
  const taskRows = ["O*NET-SOC Code,Title,Task ID,Task,Task Type,Incumbents Responding,Date,Domain Source"];
  let id = 1000;
  for (const [code, title] of FIXTURE.slice(0, 8)) {
    for (let i = 1; i <= 12; i++) {
      taskRows.push([code, title, id++, `Fixture task ${i} for ${title}, with "quotes", commas,\nand a line break`, i <= 9 ? "Core" : "Supplemental", 50, "08/2025", "Incumbent"].map(q).join(","));
    }
  }
  const titles = ["O*NET-SOC Code,Title,Job Title,Short Title,Source(s)",
    ["29-1131.00", "Veterinarians", "Veterinary Doctor", "Vet", "01,02"].map(q).join(","),
    ["15-1252.00", "Software Developers", "Software Engineer", "", "02"].map(q).join(","),
    ["27-3031.00", "Public Relations Specialists", "Corporate Communications Specialist", "", "02"].map(q).join(","),
  ].join("\n");
  return makeZip([
    [`${folder}occupation_data.csv`, "﻿" + occ],
    [`${folder}task_statements.csv`, taskRows.join("\r\n")],
    [`${folder}job_titles.csv`, titles, false],
  ]);
}

export function validModelOutput(n = 12) {
  const L = ["Low", "Moderate", "High"];
  return {
    summary: "Many of this job's tasks mix hands-on skill with AI tools.",
    takeaways: ["Lots of hands-on work stays human.", "AI helps with records.", "Relationships matter most."],
    nextSteps: ["Take biology.", "Volunteer at a shelter.", "Practice public speaking.", "Shadow a professional."],
    tasks: Array.from({ length: n }, (_, i) => ({
      n: i + 1, label: `Task label ${i + 1}`, category: ["communication", "analysis", "people", "technical", "leadership", "admin"][i % 6],
      exposure: L[i % 3], exposureLean: i % 2 ? "higher" : "lower",
      humanAdvantage: L[(i + 1) % 3], humanAdvantageLean: i % 3 ? "higher" : "lower",
      rationale: "Because reasons a student can follow.", uncertainty: "Moderate", uncertaintyReason: "Tools are changing quickly.",
    })),
  };
}
