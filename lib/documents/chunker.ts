/**
 * Markdown-aware document chunker.
 *
 * Splits documents into semantically coherent chunks by:
 *   1. Splitting on Markdown headings (##, ###, etc.)
 *   2. Falling back to paragraph boundaries (\n\n)
 *   3. Falling back to sentence boundaries (. ? !) for very large paragraphs
 *   4. Adding configurable character overlap between adjacent chunks
 *
 * All configuration lives in lib/config.ts — no magic numbers here.
 * The chunking strategy is document-agnostic and works on any Markdown content.
 */

import {
  MAX_CHUNK_CHARS,
  MIN_CHUNK_CHARS,
  CHUNK_OVERLAP_CHARS,
} from "@/lib/config";
import type { Chunk, Document } from "@/lib/types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Represents a raw section extracted from a document before chunk sizing.
 */
interface Section {
  heading: string | undefined;
  content: string;
}

/**
 * Normalises whitespace in a text block:
 * - Collapses multiple blank lines into one
 * - Trims leading/trailing whitespace
 */
function normaliseWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n") // Normalise Windows line endings
    .replace(/\n{3,}/g, "\n\n") // Collapse excess blank lines
    .trim();
}

/**
 * Splits a string on sentence boundaries (period/question/exclamation
 * followed by a space or end of string), without losing the punctuation.
 */
function splitOnSentences(text: string): string[] {
  // Positive lookbehind: keep the punctuation on the preceding segment
  const parts = text.split(/(?<=[.?!])\s+/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * Splits a single section's content into pieces that each fit within
 * MAX_CHUNK_CHARS. Uses paragraph boundaries first, then sentence boundaries.
 *
 * This is recursive for simplicity — sections are never deeply nested
 * in practice for a small personal-document corpus.
 */
function splitToFit(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) {
    return [text];
  }

  // Try splitting on paragraph boundaries first
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

  if (paragraphs.length > 1) {
    // Group paragraphs greedily into pieces that fit within MAX_CHUNK_CHARS
    const pieces: string[] = [];
    let current = "";

    for (const para of paragraphs) {
      const candidate = current ? `${current}\n\n${para}` : para;
      if (candidate.length <= MAX_CHUNK_CHARS) {
        current = candidate;
      } else {
        if (current) pieces.push(current.trim());
        // If a single paragraph is itself too large, recurse on sentences
        if (para.length > MAX_CHUNK_CHARS) {
          pieces.push(...splitToFit(para));
          current = "";
        } else {
          current = para;
        }
      }
    }
    if (current) pieces.push(current.trim());
    return pieces.filter(Boolean);
  }

  // Single paragraph that is too large — split on sentence boundaries
  const sentences = splitOnSentences(text);
  const pieces: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      current = candidate;
    } else {
      if (current) pieces.push(current.trim());
      // If a single sentence is somehow too long, hard-split at word boundaries
      if (sentence.length > MAX_CHUNK_CHARS) {
        const words = sentence.split(/\s+/);
        let wordChunk = "";
        for (const word of words) {
          if ((wordChunk + " " + word).trim().length <= MAX_CHUNK_CHARS) {
            wordChunk = wordChunk ? `${wordChunk} ${word}` : word;
          } else {
            if (wordChunk) pieces.push(wordChunk.trim());
            wordChunk = word;
          }
        }
        if (wordChunk) pieces.push(wordChunk.trim());
        current = "";
      } else {
        current = sentence;
      }
    }
  }
  if (current) pieces.push(current.trim());
  return pieces.filter(Boolean);
}

/**
 * Extracts sections from a Markdown document by splitting on headings.
 * A "section" is everything between two headings (or the beginning/end).
 * The heading level is captured but not used for hierarchy — we treat all
 * heading levels uniformly as section delimiters.
 */
function extractSections(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];

  let currentHeading: string | undefined = undefined;
  let currentLines: string[] = [];

  const flushSection = () => {
    const text = currentLines.join("\n").trim();
    if (text.length > 0) {
      sections.push({ heading: currentHeading, content: text });
    }
    currentLines = [];
  };

  for (const line of lines) {
    // Match any ATX heading: #, ##, ###, ####, #####, ######
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushSection(); // Save whatever was accumulated before this heading
      currentHeading = headingMatch[2].trim();
    } else {
      currentLines.push(line);
    }
  }

  flushSection(); // Flush the final section

  return sections;
}

/**
 * Merges sections that are too small (< MIN_CHUNK_CHARS) with the next section.
 * This avoids producing tiny, low-information chunks.
 */
function mergeSmallSections(sections: Section[]): Section[] {
  const merged: Section[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    if (section.content.length < MIN_CHUNK_CHARS && merged.length > 0) {
      // Append to the previous section
      const prev = merged[merged.length - 1];
      const separator = section.heading
        ? `\n\n**${section.heading}**\n`
        : "\n\n";
      merged[merged.length - 1] = {
        heading: prev.heading,
        content: prev.content + separator + section.content,
      };
    } else {
      merged.push(section);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Chunks a single document into semantically coherent pieces.
 *
 * Strategy:
 *   1. Extract sections based on Markdown headings
 *   2. Merge sections that are too small
 *   3. Split sections that are too large (paragraphs → sentences → words)
 *   4. Add character-level overlap from the previous chunk
 *
 * Chunk IDs are deterministic: "${documentId}-${zeroPaddedIndex}".
 */
export function chunkDocument(document: Document): Chunk[] {
  const normalised = normaliseWhitespace(document.content);
  const sections = extractSections(normalised);
  const mergedSections = mergeSmallSections(sections);

  const rawPieces: Array<{ heading: string | undefined; content: string }> = [];

  for (const section of mergedSections) {
    const pieces = splitToFit(section.content);
    for (const piece of pieces) {
      if (piece.trim().length > 0) {
        rawPieces.push({ heading: section.heading, content: piece.trim() });
      }
    }
  }

  // Add overlap: prepend the tail of the previous chunk to the current chunk
  const chunks: Chunk[] = [];

  for (let i = 0; i < rawPieces.length; i++) {
    const piece = rawPieces[i];

    let content = piece.content;

    // Prepend overlap from the previous chunk (if any)
    if (i > 0 && CHUNK_OVERLAP_CHARS > 0) {
      const prevContent = rawPieces[i - 1].content;
      const overlapText = prevContent.slice(-CHUNK_OVERLAP_CHARS).trim();
      if (overlapText.length > 0) {
        content = `${overlapText}\n\n${content}`;
      }
    }

    // Zero-pad the index so lexicographic sort equals numeric sort (up to 999 chunks)
    const index = String(i).padStart(3, "0");

    chunks.push({
      chunkId: `${document.id}-${index}`,
      documentId: document.id,
      documentName: document.name,
      heading: piece.heading,
      content,
    });
  }

  return chunks;
}

/**
 * Chunks all documents in the provided array.
 * Returns a flat array of all chunks across all documents.
 */
export function chunkDocuments(documents: Document[]): Chunk[] {
  return documents.flatMap((doc) => chunkDocument(doc));
}
