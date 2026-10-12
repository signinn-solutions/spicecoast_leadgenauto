#!/usr/bin/env node
/**
 * scrapeReport.mjs — diagnostic tool for emailScraper.
 *
 * Reads URLs from a text file (one URL per line), runs scrapeEmailsForWebsite on each,
 * prints a status tally to stdout, and writes full results to scrape-report.json.
 *
 * Usage:
 *   node scrapeReport.mjs [urls.txt]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { scrapeEmailsForWebsite } from './server/services/emailScraper.js';

async function main() {
  const inputFile = process.argv[2] || 'urls.txt';
  const filePath = path.resolve(process.cwd(), inputFile);

  let rawContent;
  try {
    rawContent = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    console.error(`Error reading ${inputFile}: ${err.message}`);
    console.error('Usage: node scrapeReport.mjs urls.txt');
    process.exit(1);
  }

  const urls = rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  if (urls.length === 0) {
    console.log(`No valid URLs found in ${inputFile}.`);
    process.exit(0);
  }

  console.log(`\nScraping ${urls.length} URL(s) from ${inputFile}...\n`);

  const tally = {};
  const results = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    process.stdout.write(`[${i + 1}/${urls.length}] Scraping ${url}... `);
    try {
      const res = await scrapeEmailsForWebsite(url);
      tally[res.status] = (tally[res.status] || 0) + 1;
      results.push(res);
      console.log(`-> ${res.status}${res.best ? ` (${res.best.email})` : ''}`);
    } catch (err) {
      tally['unhandled_error'] = (tally['unhandled_error'] || 0) + 1;
      results.push({ website: url, status: 'unhandled_error', error: err.message, attempts: [] });
      console.log(`-> ERROR: ${err.message}`);
    }
  }

  // Write full report
  const reportPath = path.resolve(process.cwd(), 'scrape-report.json');
  await fs.writeFile(reportPath, JSON.stringify(results, null, 2), 'utf-8');

  // Print Status Tally
  console.log('\n================ STATUS TALLY ================');
  console.table(
    Object.entries(tally).map(([status, count]) => ({
      Status: status,
      Count: count,
      Percentage: `${((count / urls.length) * 100).toFixed(1)}%`,
    }))
  );
  console.log(`Full report with attempt breakdown saved to: ${reportPath}\n`);
}

main().catch((err) => {
  console.error('Fatal error running scrape report:', err);
  process.exit(1);
});
