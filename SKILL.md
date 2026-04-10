---
name: reddit-feedback
version: "2.0.0"
description: "Scrape Reddit post engagement data (upvotes, comments, ratio) and reply to comments via browser automation. No API keys needed. Use when user shares a Reddit URL and wants to analyze engagement, read comments, get feedback, track post performance, or reply to comments. TRIGGER: reddit url, post engagement, reddit comments, upvotes, scrape reddit, reply comment."
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
      - reply
      - comments
---

# Reddit Feedback — Scrape + Reply

Read engagement data and reply to comments on any public Reddit post. No API keys, no OAuth.

## 1. Read comments: `scrape.js`

```bash
node ~/.claude/skills/reddit-feedback/scripts/scrape.js <reddit_url> [--comments N] [--depth N] [--sort best|new|top|controversial]
```

Default: `--comments 100 --depth 5 --sort best`

Returns JSON with:
- `post`: title, author, subreddit, score, upvote_ratio, num_comments, created, flair, selftext
- `comments[]`: id, author, score, body, depth, is_op, created, replies_count, permalink

### How to present results

When given a Reddit URL, run the scrape script and **show ALL comments to the user exactly as returned** — every single one with its author, score, and full text. Do NOT summarize, filter, or select only "top" comments. Do NOT draw conclusions or give analysis unless explicitly asked.

Present the data completely and faithfully so the agent can make its own conclusions.

## 2. Reply to comment: `reply.js`

```bash
node ~/.claude/skills/reddit-feedback/scripts/reply.js <comment_permalink> "reply text" [--browser chrome|brave]
```

Uses Playwright to open the user's real browser (with existing Reddit session) and post a reply.

**Requirements:**
- The browser (Chrome or Brave) must be CLOSED before running — Playwright needs exclusive access to the profile
- The user must be logged into Reddit in that browser
- First run: `npm install` in `~/.claude/skills/reddit-feedback/` to install Playwright

**Supported browsers:**
- `--browser chrome` (default)
- `--browser brave`

**IMPORTANT:** Always ask the user for confirmation before replying. Show them the exact reply text and which comment you want to reply to. Never reply automatically without explicit approval.

## 3. Multiple posts: `multi-scrape.js`

```bash
node ~/.claude/skills/reddit-feedback/scripts/multi-scrape.js <url1> <url2> ... [--sort-by score|comments|ratio|date]
```

## Full workflow example

```
1. Scrape post → get all comments with scores and text
2. Agent analyzes engagement and identifies comments worth replying to
3. Agent drafts replies
4. User confirms → reply.js posts them via browser
```

## Notes

- **Scraping**: No API keys — uses Reddit's public `.json` endpoints
- **Replying**: Uses your real browser session — no API keys or tokens needed
- **Close browser first** before using reply.js
- Public posts only — cannot access private subreddits or removed content
- Keep reply volume low (2-3 per day) to avoid Reddit suspicion
- If post shows `[removed]`, the moderator deleted it but comments may still be available
