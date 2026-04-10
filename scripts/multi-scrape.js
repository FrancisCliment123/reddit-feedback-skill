#!/usr/bin/env node
/**
 * Multi-post Reddit Scraper
 * Scrapes multiple Reddit posts and generates a combined engagement report
 *
 * Usage:
 *   node multi-scrape.js <url1> <url2> ... [--sort-by score|comments|ratio|date]
 */

const { execSync } = require('child_process');
const path = require('path');

const scrapeScript = path.join(__dirname, 'scrape.js');

function scrapePost(url) {
  try {
    const result = execSync(`node "${scrapeScript}" "${url}" --summary`, {
      encoding: 'utf8',
      timeout: 30000,
    });
    return JSON.parse(result);
  } catch (err) {
    return { error: `Failed to scrape ${url}: ${err.message}`, url };
  }
}

function main() {
  const args = process.argv.slice(2);
  const urls = [];
  let sortBy = 'score';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sort-by' && args[i + 1]) {
      sortBy = args[i + 1];
      i++;
    } else if (args[i].includes('reddit.com')) {
      urls.push(args[i]);
    }
  }

  if (urls.length === 0) {
    console.error('Usage: node multi-scrape.js <url1> <url2> ... [--sort-by score|comments|ratio|date]');
    process.exit(1);
  }

  const results = urls.map(u => {
    const data = scrapePost(u);
    if (data.error) return data;
    return { url: u, ...data };
  });

  const successful = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);

  // Sort
  const sortFn = {
    score: (a, b) => b.post_score - a.post_score,
    comments: (a, b) => b.total_comments - a.total_comments,
    ratio: (a, b) => b.upvote_ratio - a.upvote_ratio,
    date: (a, b) => parseFloat(a.post_age_hours) - parseFloat(b.post_age_hours),
  };
  if (sortFn[sortBy]) successful.sort(sortFn[sortBy]);

  // Aggregate stats
  const totalScore = successful.reduce((s, r) => s + r.post_score, 0);
  const totalComments = successful.reduce((s, r) => s + r.total_comments, 0);
  const avgRatio = successful.length > 0
    ? (successful.reduce((s, r) => s + r.upvote_ratio, 0) / successful.length).toFixed(3)
    : 0;

  const report = {
    aggregate: {
      posts_analyzed: successful.length,
      total_score: totalScore,
      total_comments: totalComments,
      avg_upvote_ratio: parseFloat(avgRatio),
      avg_score_per_post: successful.length > 0 ? Math.round(totalScore / successful.length) : 0,
    },
    posts: successful,
    errors: failed.length > 0 ? failed : undefined,
    generated_at: new Date().toISOString(),
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
