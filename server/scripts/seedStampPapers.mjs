/**
 * One-off: load the DDPI stamp-paper scans into master_data.stamp_paper_master.
 *
 *   node scripts/seedStampPapers.mjs
 *
 * Reads every "DPDI-STAMP PAPER<n>.jpg" from the repo-root "DPDI-STAMP PAPER"
 * folder, copies it into server/uploads/stamp-papers/, and (re)seeds one row
 * per image with status = 'AVAILABLE'. The printed serial on image <n> is
 * "TN 00<1230 + n>", used as stamp_number.
 *
 * WARNING: this clears stamp_paper_master first — any existing RESERVED
 * assignments are dropped and will be re-allocated on the next PDF build.
 */
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { masterPool } from "../config/masterDatabase.js";

const HERE = import.meta.dirname;
const SOURCE_DIR = path.join(HERE, "..", "..", "DPDI-STAMP PAPER");
const DEST_DIR = path.join(HERE, "..", "uploads", "stamp-papers");

async function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Source folder not found: ${SOURCE_DIR}`);
    process.exit(1);
  }
  fs.mkdirSync(DEST_DIR, { recursive: true });

  const files = fs
    .readdirSync(SOURCE_DIR)
    .filter((f) => /^DPDI-STAMP PAPER\d+\.jpe?g$/i.test(f))
    .map((f) => ({ file: f, index: Number(f.match(/(\d+)\.jpe?g$/i)[1]) }))
    .sort((a, b) => a.index - b.index);

  if (files.length === 0) {
    console.error("No 'DPDI-STAMP PAPER<n>.jpg' files found.");
    process.exit(1);
  }

  const client = await masterPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE public.stamp_paper_master RESTART IDENTITY");

    for (const { file, index } of files) {
      const bytes = fs.readFileSync(path.join(SOURCE_DIR, file));
      fs.writeFileSync(path.join(DEST_DIR, file), bytes);

      const stampNumber = `TN 00${1230 + index}`;
      const imagePath = `/uploads/stamp-papers/${file}`;

      await client.query(
        `INSERT INTO public.stamp_paper_master
           (stamp_number, image_name, image_path, image_data, status)
         VALUES ($1, $2, $3, $4, 'AVAILABLE')`,
        [stampNumber, file, imagePath, bytes],
      );
      console.log(`  seeded ${stampNumber}  <-  ${file} (${bytes.length} bytes)`);
    }

    await client.query("COMMIT");
    console.log(`\nDone. ${files.length} stamp papers loaded, all AVAILABLE.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await masterPool.end();
  }
}

main();
