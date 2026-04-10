#!/usr/bin/env node
/**
 * Reddit Post Scraper - No API keys needed
 * Scrapes post metrics and comments from any public Reddit post URL
 * Uses curl under the hood (bypasses Reddit's Node.js blocking)
 *
 * Usage:
 *   node scrape.js <reddit_url> [--comments N] [--depth N] [--sort best|new|top|controversial]
 *   node scrape.js <reddit_url> --summary
 */

const { execSync } = require('child_process');

function fetch(targetUrl) {
  // Use curl with --url flag to avoid shell interpretation of & in URLs
  const result = execSync(
    'curl -s -L -A "reddit-feedback-bot/1.0 (by /u/claude-skill)" --url ' + JSON.stringify(targetUrl),
    { encoding: 'utf8', timeout: 20000, maxBuffer: 10 * 1024 * 1024, shell: true }
  );
  return result;
}

function normalizeRedditUrl(input) {
  let u = input.trim();
  u = u.replace(/\/+$/, '');
  u = u.replace(/\.json$/, '');
  if (!u.startsWith('http')) u = 'https://' + u;
  u = u.replace(/old\.reddit\.com/, 'www.reddit.com');
  return u;
}

function flattenComments(children, depth = 0, maxDepth = 10) {
  const results = [];
  if (!children) return results;
  for (const child of children) {
    if (child.kind === 't1') {
      const d = child.data;
      results.push({
        id: d.id,
        author: d.author,
        score: d.score,
        body: d.body,
        created_utc: d.created_utc,
        depth: depth,
        permalink: `https://www.reddit.com${d.permalink}`,
        is_op: d.is_submitter,
        edited: d.edited,
        replies_count: countReplies(d.replies),
      });
      if (depth < maxDepth && d.replies && d.replies.data) {
        results.push(...flattenComments(d.replies.data.children, depth + 1, maxDepth));
      }
    }
  }
  return results;
}

function countReplies(replies) {
  if (!replies || !replies.data) return 0;
  return replies.data.children.filter(c => c.kind === 't1').length;
}

function formatTimestamp(utc) {
  return new Date(utc * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function generateSummary(post, comments) {
  const totalComments = comments.length;
  const topLevel = comments.filter(c => c.depth === 0);
  const avgScore = totalComments > 0
    ? (comments.reduce((s, c) => s + c.score, 0) / totalComments).toFixed(1)
    : 0;
  const topComments = [...comments].sort((a, b) => b.score - a.score).slice(0, 3);
  const controversial = [...comments].sort((a, b) => a.score - b.score).slice(0, 3);
  const uniqueAuthors = new Set(comments.map(c => c.author)).size;
  const opReplies = comments.filter(c => c.is_op && c.depth > 0);

  return {
    post_title: post.title,
    post_score: post.score,
    upvote_ratio: post.upvote_ratio,
    total_comments: post.num_comments,
    scraped_comments: totalComments,
    top_level_comments: topLevel.length,
    unique_authors: uniqueAuthors,
    avg_comment_score: parseFloat(avgScore),
    op_reply_count: opReplies.length,
    post_age_hours: ((Date.now() / 1000 - post.created_utc) / 3600).toFixed(1),
    top_comments: topComments.map(c => ({
      author: c.author,
      score: c.score,
      body: c.body.slice(0, 300),
    })),
    most_controversial: controversial.filter(c => c.score < 0).map(c => ({
      author: c.author,
      score: c.score,
      body: c.body.slice(0, 300),
    })),
    sentiment_hint: post.upvote_ratio >= 0.8 ? 'positive' :
                    post.upvote_ratio >= 0.5 ? 'mixed' : 'negative',
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scrape.js <reddit_url> [--comments N] [--depth N] [--sort best|new|top|controversial] [--summary]');
    process.exit(1);
  }

  const redditUrl = args[0];
  let maxComments = 100;
  let maxDepth = 5;
  let sort = 'best';
  let summaryMode = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--comments' && args[i + 1]) maxComments = parseInt(args[i + 1]);
    if (args[i] === '--depth' && args[i + 1]) maxDepth = parseInt(args[i + 1]);
    if (args[i] === '--sort' && args[i + 1]) sort = args[i + 1];
    if (args[i] === '--summary') summaryMode = true;
  }

  const normalized = normalizeRedditUrl(redditUrl);
  const jsonUrl = `${normalized}.json?limit=${maxComments}&depth=${maxDepth}&sort=${sort}`;

  try {
    const raw = fetch(jsonUrl);
    const data = JSON.parse(raw);

    if (!Array.isArray(data) || data.length < 2) {
      console.error('Unexpected response format. Is this a valid Reddit post URL?');
      process.exit(1);
    }

    const post = data[0].data.children[0].data;
    const comments = flattenComments(data[1].data.children, 0, maxDepth);

    if (summaryMode) {
      console.log(JSON.stringify(generateSummary(post, comments), null, 2));
    } else {
      const output = {
        post: {
          title: post.title,
          author: post.author,
          subreddit: post.subreddit_name_prefixed,
          score: post.score,
          upvote_ratio: post.upvote_ratio,
          num_comments: post.num_comments,
          created: formatTimestamp(post.created_utc),
          url: `https://www.reddit.com${post.permalink}`,
          selftext: post.selftext || null,
          link_url: post.url !== `https://www.reddit.com${post.permalink}` ? post.url : null,
          flair: post.link_flair_text || null,
          awards: post.total_awards_received || 0,
        },
        comments: comments.map(c => ({
          id: c.id,
          author: c.author,
          score: c.score,
          body: c.body,
          depth: c.depth,
          is_op: c.is_op,
          created: formatTimestamp(c.created_utc),
          replies_count: c.replies_count,
          permalink: c.permalink,
        })),
        meta: {
          scraped_at: new Date().toISOString(),
          sort: sort,
          max_depth: maxDepth,
        },
      };
      console.log(JSON.stringify(output, null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
