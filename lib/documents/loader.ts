/**
 * Document loader.
 *
 * Dynamically discovers and reads all Markdown files from the configured
 * documents directory. Nothing here is hardcoded to specific filenames or
 * document content — it works with whatever files are present.
 */

import fs from "fs";
import path from "path";
import { DOCUMENTS_DIR, DOCUMENT_EXTENSION } from "@/lib/config.js";
import type { Document } from "@/lib/types.js";

/**
 * Derives a stable document ID from a filename.
 * Strips the extension and converts to lowercase with hyphens.
 *
 * Examples:
 *   "dummy-profile.md" → "dummy-profile"
 *   "MyCV.md"          → "mycv"
 */
function filenameToId(filename: string): string {
  return path.basename(filename, DOCUMENT_EXTENSION).toLowerCase();
}

/**
 * Discovers all Markdown files in the documents directory and reads them.
 *
 * @returns Array of Document objects. Empty documents are skipped with a warning.
 * @throws If the documents directory is missing or no Markdown files are found.
 */
export function loadDocuments(): Document[] {
  const docsDir = path.resolve(process.cwd(), DOCUMENTS_DIR);

  // Guard: directory must exist
  if (!fs.existsSync(docsDir)) {
    throw new Error(
      `Documents directory not found: "${docsDir}"\n` +
        `Create the "${DOCUMENTS_DIR}/" directory and add Markdown files to it.`
    );
  }

  // Discover all .md files recursively (top-level only for simplicity)
  let filenames: string[];
  try {
    filenames = fs
      .readdirSync(docsDir)
      .filter((f) => f.toLowerCase().endsWith(DOCUMENT_EXTENSION))
      .sort(); // Sort for deterministic ordering across platforms
  } catch (err) {
    throw new Error(`Failed to read documents directory "${docsDir}": ${err}`);
  }

  if (filenames.length === 0) {
    throw new Error(
      `No ${DOCUMENT_EXTENSION} files found in "${docsDir}".\n` +
        `Add at least one Markdown document to the "${DOCUMENTS_DIR}/" directory.`
    );
  }

  const documents: Document[] = [];

  for (const filename of filenames) {
    const filepath = path.join(docsDir, filename);
    let content: string;

    try {
      content = fs.readFileSync(filepath, "utf-8");
    } catch (err) {
      // Non-fatal: log and skip unreadable files rather than aborting entirely
      console.warn(`  ⚠️  Skipping unreadable file "${filename}": ${err}`);
      continue;
    }

    const trimmed = content.trim();

    if (trimmed.length === 0) {
      console.warn(`  ⚠️  Skipping empty file "${filename}"`);
      continue;
    }

    documents.push({
      id: filenameToId(filename),
      name: filename,
      content: trimmed,
    });
  }

  if (documents.length === 0) {
    throw new Error(
      `All discovered files were empty or unreadable in "${docsDir}".\n` +
        `Ensure at least one file contains content.`
    );
  }

  return documents;
}
