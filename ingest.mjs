import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
// pdf-parse's main entry runs a demo when loaded as a top-level module which
// attempts to read a test PDF file that doesn't exist in this project.
// Load the library's implementation directly via createRequire to avoid that
// side-effect while keeping this file as ESM.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
import nodeFetch from 'node-fetch';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const REQUIRED_ENV = ['OPENAI_API_KEY', 'URL_SUPABASE', 'SERVICE_ROLE_KEY_SUPABASE'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const config = {
  openAiKey: process.env.OPENAI_API_KEY,
  supabaseUrl: process.env.URL_SUPABASE,
  supabaseServiceRoleKey: process.env.SERVICE_ROLE_KEY_SUPABASE,
  embedModel: process.env.EMBED_MODEL || 'text-embedding-3-small'
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RESUME_PATH = path.resolve(__dirname, 'Chaira_Harder_Resume.pdf');
const DEFAULT_ABOUT_PATH = path.resolve(__dirname, 'about-me.md');

const CHUNK_SIZE = 4000;
const CHUNK_OVERLAP = Math.round(CHUNK_SIZE * 0.1); // ~10% overlap
const EMBEDDING_BATCH_SIZE = 16;

const fetchImpl = (...args) => {
  const impl = globalThis.fetch ?? nodeFetch;
  return impl(...args);
};

if (!globalThis.fetch) {
  globalThis.fetch = nodeFetch;
}

const openai = new OpenAI({ apiKey: config.openAiKey });
const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  global: {
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`
    }
  }
});

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const cleaned = normalizeWhitespace(text);
  if (!cleaned) {
    return [];
  }

  const chunks = [];
  let start = 0;
  const step = Math.max(1, chunkSize - overlap);

  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length === 0) {
      break;
    }
    chunks.push(chunk);
    if (end === cleaned.length) {
      break;
    }
    start += step;
  }

  return chunks;
}

async function embedChunks(chunks, model = config.embedModel, batchSize = EMBEDDING_BATCH_SIZE) {
  const embeddings = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchLabel = `${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`;
    console.log(`  ↳ Embedding batch ${batchLabel} (${batch.length} chunk${batch.length === 1 ? '' : 's'})`);
    const response = await openai.embeddings.create({
      model,
      input: batch
    });
    embeddings.push(...response.data.map((entry) => entry.embedding));
  }
  return embeddings;
}

async function insertChunk({ source, title, url, sectionLabel, chunk, embedding }) {
  const { data: docRow, error: docError } = await supabase
    .from('documents')
    .insert({
      source,
      title,
      url,
      section: sectionLabel,
      content: chunk
    })
    .select('id')
    .single();

  if (docError) {
    throw new Error(`Failed to insert document chunk "${sectionLabel}" for source "${source}": ${docError.message}`);
  }

  const { error: embeddingError } = await supabase
    .from('document_embeddings')
    .insert({
      document_id: docRow.id,
      embedding
    });

  if (embeddingError) {
    throw new Error(`Failed to insert embedding for chunk "${sectionLabel}" (${source}): ${embeddingError.message}`);
  }
}

async function purgeSource(source) {
  console.log(`⏳ Clearing existing rows for source "${source}" (if any)...`);
  const { data: docs, error: fetchError } = await supabase
    .from('documents')
    .select('id')
    .eq('source', source);

  if (fetchError) {
    throw new Error(`Unable to check existing documents for source "${source}": ${fetchError.message}`);
  }

  if (!docs || docs.length === 0) {
    console.log('  ↳ No existing rows found.');
    return;
  }

  const docIds = docs.map((doc) => doc.id);

  const { error: deleteEmbeddingsError } = await supabase
    .from('document_embeddings')
    .delete()
    .in('document_id', docIds);

  if (deleteEmbeddingsError) {
    throw new Error(`Failed to delete embeddings for source "${source}": ${deleteEmbeddingsError.message}`);
  }

  const { error: deleteDocsError } = await supabase
    .from('documents')
    .delete()
    .in('id', docIds);

  if (deleteDocsError) {
    throw new Error(`Failed to delete documents for source "${source}": ${deleteDocsError.message}`);
  }

  console.log(`  ↳ Removed ${docIds.length} existing document${docIds.length === 1 ? '' : 's'}.`);
}

function htmlToText(html) {
  if (!html) {
    return '';
  }

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadResume() {
  try {
    await fs.access(DEFAULT_RESUME_PATH);
  } catch {
    throw new Error(`Resume not found at ${DEFAULT_RESUME_PATH}`);
  }

  const buffer = await fs.readFile(DEFAULT_RESUME_PATH);
  const parsed = await pdfParse(buffer);
  return normalizeWhitespace(parsed.text);
}

async function loadAbout() {
  try {
    await fs.access(DEFAULT_ABOUT_PATH);
  } catch {
    throw new Error(`About file not found at ${DEFAULT_ABOUT_PATH}`);
  }

  const raw = await fs.readFile(DEFAULT_ABOUT_PATH, 'utf8');
  return normalizeWhitespace(raw);
}

async function fetchAsText(target) {
  if (/^https?:\/\//i.test(target)) {
    console.log(`🌐 Fetching ${target}`);
    const response = await fetchImpl(target);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  const filePath = path.isAbsolute(target) ? target : path.resolve(__dirname, target);
  console.log(`📄 Reading ${filePath}`);
  return fs.readFile(filePath, 'utf8');
}

function stripScriptsAndStyles(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

function extractContentRoot(html) {
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) {
    return mainMatch[1];
  }
  const appMatch = html.match(/<div[^>]*id=["']app["'][^>]*>([\s\S]*?)<\/div>/i);
  if (appMatch) {
    return appMatch[1];
  }
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    return bodyMatch[1];
  }
  return html;
}

function slugifySegment(input, fallback) {
  const slug = (input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function ensureUniqueSection(sectionId, used) {
  const baseRaw = (sectionId || 'section').toString().trim();
  const base = baseRaw ? baseRaw.replace(/\s+/g, '-') : 'section';
  let candidate = base || 'section';
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${base || 'section'}-${counter}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

function extractSections(html) {
  const cleaned = extractContentRoot(stripScriptsAndStyles(html));
  const sections = [];
  const usedSections = new Set();

  const sectionMatches = Array.from(cleaned.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi));
  if (sectionMatches.length > 0) {
    sectionMatches.forEach((match, index) => {
      const attrs = match[1] || '';
      const innerHtml = match[2] || '';
      const text = htmlToText(innerHtml).trim();
      if (!text) {
        return;
      }

      const headingMatch = innerHtml.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
      const title = (headingMatch ? htmlToText(headingMatch[1]) : `Section ${index + 1}`).trim();
      const idMatch =
        attrs.match(/\bid=["']([^"']+)["']/i) || innerHtml.match(/\bid=["']([^"']+)["']/i);
      const sectionId = ensureUniqueSection(
        idMatch ? idMatch[1] : slugifySegment(title, `section-${index + 1}`),
        usedSections
      );

      sections.push({
        title: title || `Section ${index + 1}`,
        section: sectionId,
        text
      });
    });
  } else {
    const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
    const headingMatches = Array.from(cleaned.matchAll(headingRegex));
    if (headingMatches.length > 0) {
      headingMatches.forEach((match, index) => {
        const headingTag = match[0];
        const title = htmlToText(match[2]).trim() || `Heading ${index + 1}`;
        const start = match.index + headingTag.length;
        const end = headingMatches[index + 1] ? headingMatches[index + 1].index : cleaned.length;
        const bodyHtml = cleaned.slice(start, end);
        const bodyText = htmlToText(bodyHtml).trim();
        const idMatch = headingTag.match(/\bid=["']([^"']+)["']/i);
        const baseSlug = idMatch ? idMatch[1] : slugifySegment(title, `heading-${index + 1}`);
        const sectionId = ensureUniqueSection(baseSlug, usedSections);
        const combinedText = bodyText ? `${title}\n\n${bodyText}` : title;

        sections.push({
          title,
          section: sectionId,
          text: combinedText
        });
      });
    }
  }

  if (sections.length === 0) {
    const fallback = htmlToText(cleaned).trim();
    if (fallback) {
      sections.push({
        title: 'Website Content',
        section: 'website-content',
        text: fallback
      });
    }
  }

  return sections;
}

async function ingestWebsite(targets) {
  const inputs = Array.isArray(targets) ? targets : [];
  if (inputs.length === 0) {
    console.log('Skipping source "website" because no targets were provided.');
    return;
  }

  await purgeSource('website');

  for (const target of inputs) {
    try {
      const html = await fetchAsText(target);
      const sections = extractSections(html);
      if (sections.length === 0) {
        console.warn(`  ⚠️ No usable sections extracted from ${target}.`);
        continue;
      }

      const baseUrl = /^https?:\/\//i.test(target) ? target : 'https://chairaharder.com';
      const canonicalBase = baseUrl.replace(/\/$/, '');

      for (const section of sections) {
        const chunks = chunkText(section.text);
        if (chunks.length === 0) {
          console.warn(
            `  ⚠️ Section "${section.title}" from ${target} had no content after chunking.`
          );
          continue;
        }

        console.log(
          `📄 "${section.title}" (website) → ${chunks.length} chunk${
            chunks.length === 1 ? '' : 's'
          }.`
        );
        const embeddings = await embedChunks(chunks);

        for (let i = 0; i < chunks.length; i += 1) {
          const sectionLabel = `${section.section}-chunk-${i + 1}`;
          const sectionUrl = section.section ? `${canonicalBase}#${section.section}` : canonicalBase;
          await insertChunk({
            source: 'website',
            title: section.title,
            url: sectionUrl,
            sectionLabel,
            chunk: chunks[i],
            embedding: embeddings[i]
          });
        }
      }
    } catch (error) {
      console.error(`✖ Failed to process ${target}: ${error.message}`);
    }
  }

  console.log('✅ Completed ingest for source "website".');
}

async function ingestGroup(source, items) {
  if (!items.length) {
    console.log(`Skipping source "${source}" because no items were provided.`);
    return;
  }

  await purgeSource(source);

  for (const item of items) {
    const chunks = chunkText(item.text);
    if (chunks.length === 0) {
      console.warn(`  ⚠️ "${item.title}" had no content after cleaning. Skipping.`);
      continue;
    }

    console.log(`📄 "${item.title}" (${source}) → ${chunks.length} chunk${chunks.length === 1 ? '' : 's'}.`);
    const embeddings = await embedChunks(chunks);

    for (let i = 0; i < chunks.length; i += 1) {
      const sectionLabel = `chunk-${i + 1}`;
      await insertChunk({
        source,
        title: item.title,
        url: item.url,
        sectionLabel,
        chunk: chunks[i],
        embedding: embeddings[i]
      });
    }
  }

  console.log(`✅ Completed ingest for source "${source}".`);
}

async function main() {
  console.log('🚀 Starting ingestion run...\n');

  try {
    const resumeText = await loadResume();
    await ingestGroup('resume', [
      {
        title: 'Chaira Harder Resume',
        url: '/Chaira_Harder_Resume.pdf',
        text: resumeText
      }
    ]);
  } catch (error) {
    console.error(`✖ Resume ingestion failed: ${error.message}`);
  }

  try {
    const aboutText = await loadAbout();
    await ingestGroup('about', [
      {
        title: 'About Me',
        url: '/about',
        text: aboutText
      }
    ]);
  } catch (error) {
    console.error(`✖ About ingestion failed: ${error.message}`);
  }

  try {
    await ingestWebsite(['https://chairaharder.com']);
    // or: await ingestWebsite(['./index.html']);
  } catch (error) {
    console.error(`✖ Website ingestion failed: ${error.message}`);
  }

  console.log('\n✅ Ingestion run complete.');
}

main().catch((error) => {
  console.error('Unexpected error during ingestion:', error);
  process.exit(1);
});
