import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "youtube_complete_raw.json");
const outputDir = path.join(root, "youtube_complete_lists");
const groups = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

fs.mkdirSync(outputDir, { recursive: true });

const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const columns = ["Title", "Description", "Singers (one line)", "YoutubeID"];
const summary = [];

for (const [group, rows] of Object.entries(groups)) {
  const seen = new Set();
  const validRows = [];

  for (const row of rows) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(row.id)) {
      throw new Error(`${group}: invalid YouTube ID ${row.id}`);
    }
    if (seen.has(row.id)) {
      throw new Error(`${group}: duplicate YouTube ID ${row.id}`);
    }
    seen.add(row.id);
    validRows.push(row);
  }

  const csv = [
    columns.map(quote).join(","),
    ...validRows.map((row) =>
      [
        row.title,
        row.description,
        row.singers || "Not credited",
        row.id,
      ].map(quote).join(","),
    ),
  ].join("\n");

  const filename = `${group}.csv`;
  fs.writeFileSync(path.join(outputDir, filename), `${csv}\n`, "utf8");
  summary.push({
    Group: group,
    Count: validRows.length,
    File: filename,
  });
}

const indexCsv = [
  ["Group", "Count", "File"].map(quote).join(","),
  ...summary.map((row) => [row.Group, row.Count, row.File].map(quote).join(",")),
].join("\n");

fs.writeFileSync(path.join(outputDir, "index.csv"), `${indexCsv}\n`, "utf8");

const roomNames = {
  SIO: "Sio Kerala",
  GIO: "Gio Kerala",
  Solidarity: "Solidarity Youth Movement",
  JIH: "Jamaat-e-Islami Hind Kerala",
  D4Media: "D4 Media",
  Thanima: "Thanima Kala Sahithya Vedi",
  Malarvadi: "Malarvadi Balasangam",
};

const combinedColumns = [
  "Room",
  "Title",
  "Description",
  "Singers (one line)",
  "YoutubeID",
];
const combinedRows = [];

for (const [group, rows] of Object.entries(groups)) {
  for (const row of rows) {
    combinedRows.push([
      roomNames[group] || group,
      row.title,
      row.description,
      row.singers || "Not credited",
      row.id,
    ]);
  }
}

const combinedCsv = [
  combinedColumns.map(quote).join(","),
  ...combinedRows.map((row) => row.map(quote).join(",")),
].join("\n");

fs.writeFileSync(
  path.join(root, "youtube_complete_single.csv"),
  `${combinedCsv}\n`,
  "utf8",
);

const readme = [
  "# Grouped YouTube song lists",
  "",
  "Generated from publicly discoverable YouTube results and official playlists.",
  "Each CSV contains exactly: Title, Description, Singers (one line), YoutubeID.",
  "A singer is marked `Not credited` when the upload does not publish a singer/vocal credit.",
  "",
  ...summary.map((row) => `- ${row.Group}: ${row.Count} videos (${row.File})`),
  "",
].join("\n");

fs.writeFileSync(path.join(outputDir, "README.md"), readme, "utf8");
