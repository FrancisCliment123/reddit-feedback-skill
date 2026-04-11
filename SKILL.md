---
name: reddit-feedback
version: "3.0.0"
description: "Scrape Reddit post engagement data (upvotes, comments, ratio), analyze subreddit communities, craft optimized posts, and reply to comments via browser automation. No API keys needed. Use when user shares a Reddit URL, wants to analyze engagement, read comments, get feedback, track post performance, analyze a subreddit community, craft a Reddit post, or reply to comments. TRIGGER: reddit url, post engagement, reddit comments, upvotes, scrape reddit, reply comment, analyze subreddit, craft post, community analysis, viral post."
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
      - community
      - viral
      - post-crafting
---

# Reddit Feedback — Scrape + Analyze + Craft + Reply

Read engagement data, analyze communities, craft optimized posts, and reply to comments on any public Reddit post. No API keys, no OAuth.

## 1. Analyze a community: `analyze-community.js`

```bash
node ~/.claude/skills/reddit-feedback/scripts/analyze-community.js <subreddit> [--top-count N] [--timeframe all|month|week] [--include-comments]
```

Default: `--top-count 25 --timeframe all`

Use `--include-comments` to also analyze comment writing style from top posts (slower but much richer data).

Returns JSON with:
- `subreddit`: name, description, subscribers, active users, submission types allowed, submit_text (rules shown on post page)
- `rules[]`: title, description, kind (link/comment/all), violation_reason
- `analysis.title_patterns`: avg length, question %, opening words, numbers/brackets/emoji usage
- `analysis.content_patterns`: self vs link post %, avg selftext length, flair distribution
- `analysis.engagement`: avg/median/max score, upvote ratio, comment counts, best posting days & hours (UTC)
- `analysis.comment_style` (if `--include-comments`): avg length, formatting patterns (bullets, paragraphs, links, bold), tone (personal anecdotes, positive/negative/helpful), top comment examples
- `samples.top_posts`: the 10 top posts with title, score, flair, selftext preview
- `samples.hot_posts_now`: the 10 currently hot posts (what's working right now)

### How to use community analysis for post crafting

After running the analysis, use the data to craft posts by following this process:

**Step 1 — Understand the rules:** Read every rule. If a rule bans self-promotion, link posts, or certain topics, the post MUST avoid those. This is the #1 reason posts get removed.

**Step 2 — Match the style:** Look at `title_patterns` and `content_patterns`:
- If top titles are questions, frame as a question
- If most posts are self-posts, don't post a link
- Match the typical title length and word count
- Use the most common flairs
- Match the selftext length (don't write 2000 chars if the median is 300)

**Step 3 — Match the tone:** Look at `comment_style.tone`:
- If high `personal_anecdote_pct` → the community values personal stories, include "I" statements
- If high `helpful_advice_pct` → frame the post as sharing something useful
- If high `positive_tone_pct` → keep it upbeat and constructive
- Match formatting style (bullets vs paragraphs, use of bold, etc.)

**Step 4 — Optimize timing:** Post during the `best_posting_hours_utc` and `best_posting_days` for maximum initial engagement.

**Step 5 — Adapt the user's message:** Take what the user wants to say and reshape it to match ALL of the above patterns while keeping their core message intact. The goal is native-sounding content that won't trigger mod removal and naturally appeals to the community.

**IMPORTANT:** When crafting a post, always present the draft to the user for approval. Show:
1. The proposed title
2. The proposed body/selftext
3. The suggested flair
4. The recommended posting time
5. A brief explanation of WHY these choices were made (which patterns they match)

Never post automatically. The user must approve every post.

## 2. Read comments: `scrape.js`

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

## 3. Reply to comment: `reply.js`

```bash
node ~/.claude/skills/reddit-feedback/scripts/reply.js <comment_permalink> "reply text" [--browser chrome|brave]
```

Uses Playwright to open the user's real browser (with existing Reddit session) and post a reply. Works on **Windows, macOS, and Linux**.

**Requirements:**
- The browser (Chrome or Brave) must be CLOSED before running — Playwright needs exclusive access to the profile
- The user must be logged into Reddit in that browser
- First run: `npm install` in `~/.claude/skills/reddit-feedback/` to install Playwright

**Supported browsers:**
- `--browser chrome` (default)
- `--browser brave`

**Platform notes:**
- **Windows**: Uses junction points (`mklink /J`) and `taskkill`
- **macOS**: Uses symlinks (`ln -s`) and `pkill`. Browser paths: `/Applications/Google Chrome.app`, `/Applications/Brave Browser.app`
- **Linux**: Uses symlinks (`ln -s`) and `pkill`. Browser paths: `/usr/bin/google-chrome`, `/usr/bin/brave-browser`

**IMPORTANT:** Always ask the user for confirmation before replying. Show them the exact reply text and which comment you want to reply to. Never reply automatically without explicit approval.

## 4. Multiple posts: `multi-scrape.js`

```bash
node ~/.claude/skills/reddit-feedback/scripts/multi-scrape.js <url1> <url2> ... [--sort-by score|comments|ratio|date]
```

## Workflow A — Analyze engagement & reply

```
1. Scrape post → get all comments with scores and text
2. Agent analyzes engagement and identifies comments worth replying to
3. Agent drafts replies
4. User confirms → reply.js posts them via browser
```

## Workflow B — Community analysis & post crafting

```
1. User says what subreddit they want to post in and what they want to say
2. Run analyze-community.js with --include-comments on the target subreddit
3. Agent studies: rules, title patterns, content patterns, engagement data, comment style, top/hot post examples
4. Agent crafts a post that:
   a. Follows ALL subreddit rules (no rule violations = no removal)
   b. Matches the title style (length, format, question vs statement)
   c. Matches the content style (selftext length, formatting, tone)
   d. Uses appropriate flair
   e. Incorporates the user's core message naturally
   f. Is optimized for the best posting day/hour
5. Agent presents draft with rationale to user
6. User approves, edits, or asks for revision
7. User posts manually (or via browser automation in future)
```

## 5. Promotion guide: `PROMO-GUIDE.md`

See [PROMO-GUIDE.md](PROMO-GUIDE.md) for a complete guide on promoting on Reddit without getting banned — covering rules, subreddit tiers, timing, writing style, account building, and a 30-day execution plan. When crafting posts via community analysis (Workflow B), always cross-reference this guide.

## Notes

- **Scraping**: No API keys — uses Reddit's public `.json` endpoints
- **Replying**: Uses your real browser session — no API keys or tokens needed
- **Community analysis**: Uses Reddit's public `.json` endpoints for subreddit info, rules, and posts
- **Close browser first** before using reply.js
- Public posts only — cannot access private subreddits or removed content
- Keep reply volume low (2-3 per day) to avoid Reddit suspicion
- If post shows `[removed]`, the moderator deleted it but comments may still be available
