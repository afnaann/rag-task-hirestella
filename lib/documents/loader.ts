/**
 * Document loader.
 *
 * Dynamically discovers and reads all supported files from the configured
 * documents directory. Supports Markdown (.md) and PDF (.pdf) files.
 * Nothing here is hardcoded to specific filenames or document content —
 * it works with whatever files are present.
 */

import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { DOCUMENTS_DIR } from "@/lib/config";
import type { Document } from "@/lib/types";

/**
 * Supported file extensions for ingestion.
 * Add new extensions here (and a reader below) to support additional formats.
 */
const SUPPORTED_EXTENSIONS = [".md", ".pdf"] as const;

/**
 * Derives a stable document ID from a filename.
 * Strips the extension and converts to lowercase with hyphens.
 *
 * Examples:
 *   "project-wiral-ai.md" → "project-wiral-ai"
 *   "AFNAN_PK_AI_ENGINEER.pdf" → "afnan_pk_ai_engineer"
 */
function filenameToId(filename: string): string {
  const ext = path.extname(filename);
  return path.basename(filename, ext).toLowerCase();
}

/**
 * Checks whether a filename has a supported extension.
 */
function isSupportedFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Reads file content based on extension.
 * - .md files are read as UTF-8 text directly
 * - .pdf files are parsed with pdf-parse to extract text content
 */
async function readFileContent(filepath: string): Promise<string> {
  const ext = path.extname(filepath).toLowerCase();

  if (ext === ".pdf") {
    const buffer = fs.readFileSync(filepath);
    const parser = new PDFParse(new Uint8Array(buffer));
    const result = await parser.getText();
    return typeof result === "string" ? result : result.text || "";
  }

  // Default: read as UTF-8 text (Markdown and any other text format)
  return fs.readFileSync(filepath, "utf-8");
}

/**
 * Discovers all supported files in the documents directory and reads them.
 *
 * @returns Array of Document objects. Empty documents are skipped with a warning.
 * @throws If the documents directory is missing or no supported files are found.
 */
export async function loadDocuments(): Promise<Document[]> {
  const docsDir = path.resolve(process.cwd(), DOCUMENTS_DIR);

  // Guard: directory must exist
  if (!fs.existsSync(docsDir)) {
    throw new Error(
      `Documents directory not found: "${docsDir}"\n` +
        `Create the "${DOCUMENTS_DIR}/" directory and add documents to it.`
    );
  }

  // Discover all supported files (top-level only for simplicity)
  let filenames: string[];
  try {
    filenames = fs
      .readdirSync(docsDir)
      .filter((f) => isSupportedFile(f))
      .sort(); // Sort for deterministic ordering across platforms
  } catch (err) {
    throw new Error(`Failed to read documents directory "${docsDir}": ${err}`);
  }

  if (filenames.length === 0) {
    throw new Error(
      `No supported files found in "${docsDir}".\n` +
        `Add at least one Markdown (.md) or PDF (.pdf) document to the "${DOCUMENTS_DIR}/" directory.`
    );
  }

  const documents: Document[] = [];

  for (const filename of filenames) {
    const filepath = path.join(docsDir, filename);
    let content: string;

    try {
      content = await readFileContent(filepath);
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
