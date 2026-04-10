---
name: reddit-feedback
version: "1.1.0"
description: "Scrape Reddit post engagement data (upvotes, comments, ratio) from any post URL. No API keys needed. Use when user shares a Reddit URL and wants to analyze engagement, read comments, get feedback, or track post performance. TRIGGER: reddit url, post engagement, reddit comments, upvotes, scrape reddit."
argument-hint: 'reddit-feedback https://www.reddit.com/r/sub/comments/xyz'
allowed-tools: Bash, Read, Write
user-invocable: true
author: FrancisCliment123
license: MIT
homepage: https://github.com/FrancisCliment123/reddit-feedback-skill
repository: https://github.com/FrancisCliment123/reddit-feedback-skill
metadata:
  openclaw:
    emoji: "📊"
    requires:
      bins:
        - node
    homepage: https://github.com/FrancisCliment123/reddit-feedback-skill
    tags:
      - reddit
      - engagement
      - scraping
      - feedback
      - analytics
---

# Reddit Feedback Scraper

Scrape engagement data from any public Reddit post. No API keys, no OAuth, no rate limit issues.

## Script

```bash
node ~/.claude/skills/reddit-feedback/scripts/scrape.js <reddit_url> [--comments N] [--depth N] [--sort best|new|top|controversial]
```

Default: `--comments 100 --depth 5 --sort best`

Returns JSON with:
- `post`: title, author, subreddit, score, upvote_ratio, num_comments, created, flair, selftext
- `comments[]`: id, author, score, body, depth, is_op, created, replies_count, permalink

## How to use

When given a Reddit URL, run the scrape script and **show ALL comments to the user exactly as returned** — every single one with its author, score, and full text. Do NOT summarize, filter, or select only "top" comments. Do NOT draw conclusions or give analysis unless explicitly asked.

The purpose of this skill is to feed raw engagement data to an agent that will make its own conclusions. Present the data completely and faithfully.

Output format:

1. Post metrics: title, score, upvote_ratio, num_comments, whether it was removed
2. Every comment, listed in order, with: author, score, body (full text), depth (0 = top-level reply)

For multiple posts (`multi-scrape.js`): show each post's full comment list separately.

## Multiple posts

```bash
node ~/.claude/skills/reddit-feedback/scripts/multi-scrape.js <url1> <url2> ... [--sort-by score|comments|ratio|date]
```

## Notes

- No API keys needed — uses Reddit's public `.json` endpoints
- Public posts only — cannot access private subreddits or removed content
- If post shows `[removed]`, the moderator deleted it but comments may still be available
