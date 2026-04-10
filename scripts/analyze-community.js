#!/usr/bin/env node
/**
 * Reddit Community Analyzer
 * Scrapes a subreddit's top posts, rules, and writing patterns
 * to understand what makes content succeed in that community.
 *
 * Usage:
 *   node analyze-community.js <subreddit> [--top-count N] [--timeframe all|month|week] [--include-comments]
 *
 * Examples:
 *   node analyze-community.js r/startups
 *   node analyze-community.js entrepreneur --top-count 50 --timeframe month --include-comments
 */

const { execSync } = require('child_process');

function fetch(targetUrl) {
  const result = execSync(
    'curl -s -L -A "reddit-feedback-bot/1.0 (by /u/claude-skill)" --url ' + JSON.stringify(targetUrl),
    { encoding: 'utf8', timeout: 20000, maxBuffer: 10 * 1024 * 1024, shell: true }
  );
  return result;
}

function safeParse(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Warning: Failed to parse ${label} response`);
    return null;
  }
}

function normalizeSub(input) {
  let sub = input.trim().replace(/^\/?(r\/)?/, '').replace(/\/+$/, '');
  return sub;
}

function formatTimestamp(utc) {
  return new Date(utc * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function getDayOfWeek(utc) {
  return new Date(utc * 1000).toLocaleDateString('en-US', { weekday: 'long' });
}

function getHourUTC(utc) {
  return new Date(utc * 1000).getUTCHours();
}

// Extract top-level comments from a post
function extractTopComments(data, maxComments = 10) {
  if (!Array.isArray(data) || data.length < 2) return [];
  const children = data[1]?.data?.children || [];
  const comments = [];
  for (const child of children) {
    if (child.kind === 't1' && comments.length < maxComments) {
      const d = child.data;
      comments.push({
        author: d.author,
        score: d.score,
        body: d.body,
        body_length: d.body ? d.body.length : 0,
        is_op: d.is_submitter,
        replies_count: d.replies?.data?.children?.filter(c => c.kind === 't1').length || 0,
      });
    }
  }
  return comments;
}

// Analyze title patterns
function analyzeTitles(posts) {
  const lengths = posts.map(p => p.title.length);
  const wordCounts = posts.map(p => p.title.split(/\s+/).length);

  const startsWithQuestion = posts.filter(p => /^(how|what|why|when|where|who|is|are|do|does|can|should|would|has|have|did)/i.test(p.title));
  const hasQuestion = posts.filter(p => p.title.includes('?'));
  const allCaps = posts.filter(p => p.title === p.title.toUpperCase() && p.title.length > 10);
  const hasNumbers = posts.filter(p => /\d/.test(p.title));
  const hasBrackets = posts.filter(p => /[\[\(]/.test(p.title));
  const hasEmoji = posts.filter(p => /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(p.title));

  // Common opening words
  const openingWords = {};
  posts.forEach(p => {
    const first = p.title.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
    if (first.length > 1) openingWords[first] = (openingWords[first] || 0) + 1;
  });
  const topOpeningWords = Object.entries(openingWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count, pct: ((count / posts.length) * 100).toFixed(1) + '%' }));

  return {
    avg_length: (lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(0),
    median_length: lengths.sort((a, b) => a - b)[Math.floor(lengths.length / 2)],
    avg_word_count: (wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length).toFixed(1),
    question_titles_pct: ((hasQuestion.length / posts.length) * 100).toFixed(1) + '%',
    starts_with_question_pct: ((startsWithQuestion.length / posts.length) * 100).toFixed(1) + '%',
    has_numbers_pct: ((hasNumbers.length / posts.length) * 100).toFixed(1) + '%',
    has_brackets_pct: ((hasBrackets.length / posts.length) * 100).toFixed(1) + '%',
    has_emoji_pct: ((hasEmoji.length / posts.length) * 100).toFixed(1) + '%',
    all_caps_pct: ((allCaps.length / posts.length) * 100).toFixed(1) + '%',
    top_opening_words: topOpeningWords,
  };
}

// Analyze post content patterns
function analyzeContent(posts) {
  const selfPosts = posts.filter(p => p.is_self);
  const linkPosts = posts.filter(p => !p.is_self);

  const selfTextLengths = selfPosts
    .filter(p => p.selftext && p.selftext !== '[removed]')
    .map(p => p.selftext.length);

  const flairs = {};
  posts.forEach(p => {
    const f = p.flair || '(none)';
    flairs[f] = (flairs[f] || 0) + 1;
  });
  const flairDist = Object.entries(flairs)
    .sort((a, b) => b[1] - a[1])
    .map(([flair, count]) => ({ flair, count, pct: ((count / posts.length) * 100).toFixed(1) + '%' }));

  return {
    self_post_pct: ((selfPosts.length / posts.length) * 100).toFixed(1) + '%',
    link_post_pct: ((linkPosts.length / posts.length) * 100).toFixed(1) + '%',
    avg_selftext_length: selfTextLengths.length > 0
      ? (selfTextLengths.reduce((a, b) => a + b, 0) / selfTextLengths.length).toFixed(0)
      : 0,
    median_selftext_length: selfTextLengths.length > 0
      ? selfTextLengths.sort((a, b) => a - b)[Math.floor(selfTextLengths.length / 2)]
      : 0,
    flair_distribution: flairDist,
  };
}

// Analyze engagement patterns
function analyzeEngagement(posts) {
  const scores = posts.map(p => p.score);
  const ratios = posts.map(p => p.upvote_ratio);
  const commentCounts = posts.map(p => p.num_comments);

  // Time patterns
  const dayDist = {};
  const hourDist = {};
  posts.forEach(p => {
    const day = getDayOfWeek(p.created_utc);
    const hour = getHourUTC(p.created_utc);
    dayDist[day] = (dayDist[day] || 0) + 1;
    hourDist[hour] = (hourDist[hour] || 0) + 1;
  });

  const bestDays = Object.entries(dayDist)
    .sort((a, b) => b[1] - a[1])
    .map(([day, count]) => ({ day, count }));

  const bestHours = Object.entries(hourDist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hour, count]) => ({ hour_utc: parseInt(hour), count }));

  return {
    avg_score: (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(0),
    median_score: scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)],
    max_score: Math.max(...scores),
    avg_upvote_ratio: (ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(3),
    avg_comments: (commentCounts.reduce((a, b) => a + b, 0) / commentCounts.length).toFixed(0),
    median_comments: commentCounts.sort((a, b) => a - b)[Math.floor(commentCounts.length / 2)],
    best_posting_days: bestDays,
    best_posting_hours_utc: bestHours,
  };
}

// Analyze comment writing style from top comments
function analyzeCommentStyle(allComments) {
  if (allComments.length === 0) return null;

  const lengths = allComments.map(c => c.body_length);
  const wordCounts = allComments.map(c => c.body.split(/\s+/).length);

  // Formatting patterns
  const usesBullets = allComments.filter(c => /^[\-\*]\s/m.test(c.body));
  const usesParagraphs = allComments.filter(c => c.body.includes('\n\n'));
  const usesLinks = allComments.filter(c => /https?:\/\/|(\[.*\]\(.*\))/.test(c.body));
  const usesQuotes = allComments.filter(c => /^>/m.test(c.body));
  const usesBold = allComments.filter(c => /\*\*.*\*\*/.test(c.body));
  const usesPersonalAnecdote = allComments.filter(c => /\b(I |my |me |I'm|I've|I was)\b/i.test(c.body));

  // Tone indicators
  const positiveIndicators = allComments.filter(c =>
    /\b(great|awesome|love|amazing|excellent|thanks|helpful|agree|exactly|this)\b/i.test(c.body)
  );
  const negativeIndicators = allComments.filter(c =>
    /\b(wrong|bad|terrible|disagree|no|nope|stop|don't|wouldn't)\b/i.test(c.body)
  );
  const helpfulIndicators = allComments.filter(c =>
    /\b(try|suggest|recommend|consider|should|could|might|here's|tip|advice)\b/i.test(c.body)
  );

  return {
    total_analyzed: allComments.length,
    avg_length_chars: (lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(0),
    avg_word_count: (wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length).toFixed(0),
    median_word_count: wordCounts.sort((a, b) => a - b)[Math.floor(wordCounts.length / 2)],
    formatting: {
      uses_bullets_pct: ((usesBullets.length / allComments.length) * 100).toFixed(1) + '%',
      uses_paragraphs_pct: ((usesParagraphs.length / allComments.length) * 100).toFixed(1) + '%',
      uses_links_pct: ((usesLinks.length / allComments.length) * 100).toFixed(1) + '%',
      uses_quotes_pct: ((usesQuotes.length / allComments.length) * 100).toFixed(1) + '%',
      uses_bold_pct: ((usesBold.length / allComments.length) * 100).toFixed(1) + '%',
    },
    tone: {
      personal_anecdote_pct: ((usesPersonalAnecdote.length / allComments.length) * 100).toFixed(1) + '%',
      positive_tone_pct: ((positiveIndicators.length / allComments.length) * 100).toFixed(1) + '%',
      negative_tone_pct: ((negativeIndicators.length / allComments.length) * 100).toFixed(1) + '%',
      helpful_advice_pct: ((helpfulIndicators.length / allComments.length) * 100).toFixed(1) + '%',
    },
    top_comments_examples: allComments
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(c => ({
        score: c.score,
        word_count: c.body.split(/\s+/).length,
        body_preview: c.body.slice(0, 500),
      })),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node analyze-community.js <subreddit> [--top-count N] [--timeframe all|month|week] [--include-comments]');
    console.error('Example: node analyze-community.js r/startups --top-count 50 --include-comments');
    process.exit(1);
  }

  const sub = normalizeSub(args[0]);
  let topCount = 25;
  let timeframe = 'all';
  let includeComments = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--top-count' && args[i + 1]) topCount = parseInt(args[i + 1]);
    if (args[i] === '--timeframe' && args[i + 1]) timeframe = args[i + 1];
    if (args[i] === '--include-comments') includeComments = true;
  }

  // Cap at 100 (Reddit API limit per page)
  topCount = Math.min(topCount, 100);

  console.error(`Analyzing r/${sub}...`);

  // 1. Fetch subreddit about info
  console.error('  Fetching subreddit info...');
  const aboutRaw = fetch(`https://www.reddit.com/r/${sub}/about.json`);
  const aboutData = safeParse(aboutRaw, 'about');

  // 2. Fetch subreddit rules
  console.error('  Fetching rules...');
  const rulesRaw = fetch(`https://www.reddit.com/r/${sub}/about/rules.json`);
  const rulesData = safeParse(rulesRaw, 'rules');

  // 3. Fetch top posts (primary timeframe)
  console.error(`  Fetching top ${topCount} posts (${timeframe})...`);
  const topRaw = fetch(`https://www.reddit.com/r/${sub}/top.json?t=${timeframe}&limit=${topCount}`);
  const topData = safeParse(topRaw, 'top posts');

  // 4. Fetch hot posts (current trending)
  console.error('  Fetching hot posts...');
  const hotRaw = fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=25`);
  const hotData = safeParse(hotRaw, 'hot posts');

  // Build subreddit info
  let subredditInfo = null;
  if (aboutData?.data) {
    const d = aboutData.data;
    subredditInfo = {
      name: d.display_name_prefixed,
      title: d.title,
      description: d.public_description || d.description?.slice(0, 500) || null,
      subscribers: d.subscribers,
      active_users: d.accounts_active,
      created: formatTimestamp(d.created_utc),
      over18: d.over18,
      submission_type: d.submission_type, // "any", "link", "self"
      allowed_media: {
        images: d.allow_images,
        videos: d.allow_videos,
        galleries: d.allow_galleries,
        polls: d.allow_polls,
      },
      spoilers_enabled: d.spoilers_enabled,
      wiki_enabled: d.wiki_enabled,
      submit_text: d.submit_text || null,  // text shown on submission page
      submit_text_label: d.submit_text_label || null,
      submit_link_label: d.submit_link_label || null,
    };
  }

  // Build rules
  let rules = [];
  if (rulesData?.rules) {
    rules = rulesData.rules.map(r => ({
      title: r.short_name,
      description: r.description || null,
      kind: r.kind, // "link", "comment", "all"
      violation_reason: r.violation_reason,
    }));
  }

  // Parse posts
  const topPosts = topData?.data?.children?.map(c => c.data) || [];
  const hotPosts = hotData?.data?.children?.map(c => c.data) || [];

  if (topPosts.length === 0 && hotPosts.length === 0) {
    console.error('Error: No posts found. Check that the subreddit exists and is public.');
    process.exit(1);
  }

  // Optionally fetch comments from top 5 posts for style analysis
  let commentStyle = null;
  if (includeComments) {
    console.error('  Fetching comments from top posts for style analysis...');
    const allComments = [];
    const postsToAnalyze = topPosts.slice(0, 5);
    for (const post of postsToAnalyze) {
      const postUrl = `https://www.reddit.com${post.permalink}.json?limit=20&depth=1&sort=top`;
      console.error(`    Fetching comments for: ${post.title.slice(0, 60)}...`);
      try {
        const postRaw = fetch(postUrl);
        const postData = safeParse(postRaw, 'post comments');
        if (postData) {
          const comments = extractTopComments(postData, 20);
          allComments.push(...comments);
        }
      } catch (e) {
        console.error(`    Warning: Failed to fetch comments for post`);
      }
    }
    if (allComments.length > 0) {
      commentStyle = analyzeCommentStyle(allComments);
    }
  }

  // Analyze patterns
  const allPosts = topPosts; // Use top posts as the primary dataset
  const titleAnalysis = analyzeTitles(allPosts);
  const contentAnalysis = analyzeContent(allPosts);
  const engagementAnalysis = analyzeEngagement(allPosts);

  // Sample top posts for reference
  const topPostSamples = topPosts.slice(0, 10).map(p => ({
    title: p.title,
    score: p.score,
    upvote_ratio: p.upvote_ratio,
    num_comments: p.num_comments,
    flair: p.link_flair_text || null,
    is_self: p.is_self,
    selftext_preview: p.selftext ? p.selftext.slice(0, 300) : null,
    created: formatTimestamp(p.created_utc),
    awards: p.total_awards_received || 0,
  }));

  // Hot post samples (what's working RIGHT NOW)
  const hotPostSamples = hotPosts.slice(0, 10).map(p => ({
    title: p.title,
    score: p.score,
    upvote_ratio: p.upvote_ratio,
    num_comments: p.num_comments,
    flair: p.link_flair_text || null,
    is_self: p.is_self,
    selftext_preview: p.selftext ? p.selftext.slice(0, 300) : null,
    created: formatTimestamp(p.created_utc),
    age_hours: ((Date.now() / 1000 - p.created_utc) / 3600).toFixed(1),
  }));

  const output = {
    subreddit: subredditInfo,
    rules: rules,
    analysis: {
      based_on: `Top ${allPosts.length} posts (timeframe: ${timeframe})`,
      title_patterns: titleAnalysis,
      content_patterns: contentAnalysis,
      engagement: engagementAnalysis,
      comment_style: commentStyle,
    },
    samples: {
      top_posts: topPostSamples,
      hot_posts_now: hotPostSamples,
    },
    meta: {
      analyzed_at: new Date().toISOString(),
      subreddit: `r/${sub}`,
      top_count: allPosts.length,
      timeframe: timeframe,
      comments_analyzed: includeComments,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
