import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { analyzeIssue, summarizeIssue, generateEmbedding, findDuplicates } from './api/aiService.js';
import { submitVote, getVerification, getUserVote, addEvidence, getEvidence, calculateTrustScore } from './api/verificationService.js';
import {
  createNotification, markNotificationsRead, markAllRead,
  getUserNotifications, notifyIssueVerified, notifyCommentAdded,
  NOTIFICATION_TYPES,
} from './api/notificationService.js';
import { getOverview, getTrends, getCategoryDistribution, getHotspots, getLeaderboard, getSeverityTrend } from './api/analyticsService.js';
import { awardPoints, getUserGamificationStats } from './api/gamificationService.js';
import { processIssuePipeline, getAgentStatus } from './api/agentOrchestrator.js';
import { checkAllEscalations } from './api/agents/escalationAgent.js';
import { predictHotspots, forecastTrends, computeRiskZones, generatePredictionSummary } from './api/predictionService.js';
import { adminDb } from './api/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;

// ─── Storage Setup ───────────────────────────────────────────────
const UPLOAD_DIR = process.env.STORAGE_PATH
  ? process.env.STORAGE_PATH
  : process.env.NODE_ENV === 'production'
    ? path.join(__dirname, 'uploads')
    : path.join(__dirname, 'temp_uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|wav|mp3|mpeg|ogg/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (allowedTypes.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type .${ext} not supported`), false);
    }
  },
});

// ─── Middleware ──────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.log(`[SLOW] ${req.method} ${req.path} — ${duration}ms`);
    }
  });
  next();
});

// ─── Error Handling Middleware ───────────────────────────────────
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ════════════════════════════════════════════════════════════════
// ROUTES: File Upload
// ════════════════════════════════════════════════════════════════

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, filename: req.file.filename, path: req.file.path });
});

// ════════════════════════════════════════════════════════════════
// ROUTES: AI Analysis (Milestone 3)
// ════════════════════════════════════════════════════════════════

app.post('/api/ai/analyze', upload.single('file'), asyncHandler(async (req, res) => {
  const imagePath = req.file ? req.file.path : null;
  const textDescription = req.body.description || '';

  if (!imagePath && !textDescription) {
    return res.status(400).json({ error: 'Provide an image or text description' });
  }

  const analysis = await analyzeIssue(imagePath, textDescription);

  let fileUrl = null;
  if (req.file) {
    if (analysis.is_civic_issue === false) {
      // User requested: The media that is being rejected in issue upload, must also be then deleted from temp uploads
      try {
        fs.unlinkSync(req.file.path);
        console.log(`[Upload] Deleted rejected media: ${req.file.path}`);
      } catch (err) {
        console.error(`[Upload] Failed to delete rejected media: ${err.message}`);
      }
    } else {
      fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }
  }

  res.json({ ...analysis, media_url: fileUrl });
}));

app.post('/api/ai/summarize', asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  if (!title && !description) {
    return res.status(400).json({ error: 'Provide title or description' });
  }
  const summary = await summarizeIssue(title, description);
  res.json(summary);
}));

app.post('/api/ai/embed', asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Provide text to embed' });
  const embedding = await generateEmbedding(text);
  res.json({ embedding });
}));

app.post('/api/ai/check-duplicates', asyncHandler(async (req, res) => {
  const { text, existingIssues } = req.body;
  if (!text) return res.status(400).json({ error: 'Provide text' });

  const newEmbedding = await generateEmbedding(text);
  const result = findDuplicates(newEmbedding, existingIssues || []);
  res.json(result);
}));

// ════════════════════════════════════════════════════════════════
// ROUTES: Verification (Milestone 4)
// ════════════════════════════════════════════════════════════════

app.post('/api/verification/vote', asyncHandler(async (req, res) => {
  const { issue_id, user_id, vote, confidence, comment, user_name } = req.body;

  if (!issue_id || !user_id || !vote) {
    return res.status(400).json({ error: 'issue_id, user_id, and vote are required' });
  }

  const result = await submitVote(issue_id, user_id, vote, confidence, comment);

  // Send notification to issue reporter
  if (vote === 'confirm' || vote === 'reject') {
    try {
      const issueSnap = await adminDb.collection('issues').doc(issue_id).get();
      if (issueSnap.exists) {
        const issue = issueSnap.data();
        await notifyIssueVerified(issue_id, issue.title, user_name || 'A community member', issue.reporter_id);
      }
    } catch (err) {
      console.error('Failed to send verification notification:', err.message);
    }
  }

  res.json(result);
}));

app.get('/api/verification/:issueId', asyncHandler(async (req, res) => {
  const result = await getVerification(req.params.issueId);
  res.json(result);
}));

app.get('/api/verification/:issueId/user/:userId', asyncHandler(async (req, res) => {
  const vote = await getUserVote(req.params.issueId, req.params.userId);
  res.json({ has_voted: !!vote, vote });
}));

app.post('/api/verification/evidence', upload.single('file'), asyncHandler(async (req, res) => {
  const { issue_id, user_id, description } = req.body;
  if (!issue_id || !user_id) {
    return res.status(400).json({ error: 'issue_id and user_id are required' });
  }

  let mediaUrl = null;
  if (req.file) {
    mediaUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  }

  const result = await addEvidence(issue_id, user_id, mediaUrl, description || '');
  res.json({ ...result, media_url: mediaUrl });
}));

app.get('/api/verification/:issueId/evidence', asyncHandler(async (req, res) => {
  const evidence = await getEvidence(req.params.issueId);
  res.json(evidence);
}));

app.post('/api/trust-score/calculate', asyncHandler(async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  const result = await calculateTrustScore(user_id);
  res.json(result);
}));

// ════════════════════════════════════════════════════════════════
// ROUTES: Comments (Milestone 5)
// ════════════════════════════════════════════════════════════════

app.post('/api/issues/:issueId/comments', asyncHandler(async (req, res) => {
  const { user_id, user_name, user_avatar, text } = req.body;
  const { issueId } = req.params;

  if (!user_id || !text) {
    return res.status(400).json({ error: 'user_id and text are required' });
  }

  const commentRef = await adminDb
    .collection('issues')
    .doc(issueId)
    .collection('comments')
    .add({
      user_id,
      user_name: user_name || 'Anonymous',
      user_avatar: user_avatar || null,
      text: text.trim(),
      created_at: FieldValue.serverTimestamp(),
    });

  // Notify issue reporter
  try {
    const issueSnap = await adminDb.collection('issues').doc(issueId).get();
    if (issueSnap.exists) {
      const issue = issueSnap.data();
      if (issue.reporter_id !== user_id) {
        await notifyCommentAdded(issueId, issue.title, user_name, issue.reporter_id);
      }
    }
  } catch (err) {
    console.error('Failed to send comment notification:', err.message);
  }

  // Award points for commenting
  try {
    await adminDb.collection('users').doc(user_id).update({
      points: FieldValue.increment(2),
    });
  } catch (err) { /* ignore */ }

  res.json({ id: commentRef.id, success: true });
}));

app.get('/api/issues/:issueId/comments', asyncHandler(async (req, res) => {
  const { issueId } = req.params;

  const commentsSnap = await adminDb
    .collection('issues')
    .doc(issueId)
    .collection('comments')
    .orderBy('created_at', 'asc')
    .get();

  const comments = [];
  commentsSnap.forEach((doc) => {
    const data = doc.data();
    comments.push({
      id: doc.id,
      ...data,
      created_at: data.created_at?.toDate?.().toISOString() || null,
    });
  });

  res.json(comments);
}));

// ════════════════════════════════════════════════════════════════
// ROUTES: Notifications (Milestone 5)
// ════════════════════════════════════════════════════════════════

app.get('/api/notifications/:userId', asyncHandler(async (req, res) => {
  const { limit: limitParam, after } = req.query;
  const result = await getUserNotifications(
    req.params.userId,
    parseInt(limitParam) || 50,
    after || null,
  );
  res.json(result);
}));

app.post('/api/notifications/mark-read', asyncHandler(async (req, res) => {
  const { notification_ids } = req.body;
  if (!notification_ids || !Array.isArray(notification_ids)) {
    return res.status(400).json({ error: 'notification_ids array required' });
  }
  const result = await markNotificationsRead(notification_ids);
  res.json(result);
}));

app.post('/api/notifications/mark-all-read', asyncHandler(async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  const result = await markAllRead(user_id);
  res.json(result);
}));

// ════════════════════════════════════════════════════════════════
// CACHING MIDDLEWARE
// ════════════════════════════════════════════════════════════════

const memCache = new Map();
const cacheMiddleware = (durationSec) => (req, res, next) => {
  // Use originalUrl to include query params in the cache key
  const key = req.originalUrl;
  const cached = memCache.get(key);
  if (cached && Date.now() - cached.timestamp < durationSec * 1000) {
    return res.json(cached.data);
  }
  const originalJson = res.json;
  res.json = (body) => {
    memCache.set(key, { timestamp: Date.now(), data: body });
    originalJson.call(res, body);
  };
  next();
};

// ════════════════════════════════════════════════════════════════
// ROUTES: Analytics (Milestone 6)
// ════════════════════════════════════════════════════════════════

app.get('/api/analytics/overview', cacheMiddleware(300), asyncHandler(async (req, res) => {
  const { lat, lng, radius_km } = req.query;
  const overview = await getOverview(lat, lng, radius_km);
  res.json(overview);
}));

app.get('/api/analytics/trends', cacheMiddleware(300), asyncHandler(async (req, res) => {
  const { period, lat, lng, radius_km } = req.query;
  const trends = await getTrends(period || '30d', lat, lng, radius_km);
  res.json(trends);
}));

app.get('/api/analytics/categories', cacheMiddleware(300), asyncHandler(async (req, res) => {
  const { lat, lng, radius_km } = req.query;
  const categories = await getCategoryDistribution(lat, lng, radius_km);
  res.json(categories);
}));

app.get('/api/analytics/hotspots', cacheMiddleware(300), asyncHandler(async (req, res) => {
  const { lat, lng, radius_km } = req.query;
  const hotspots = await getHotspots(lat, lng, radius_km);
  res.json(hotspots);
}));

app.get('/api/analytics/leaderboard', cacheMiddleware(300), asyncHandler(async (req, res) => {
  const { limit: limitParam } = req.query;
  const leaderboard = await getLeaderboard(parseInt(limitParam) || 20);
  res.json(leaderboard);
}));

app.get('/api/analytics/severity-trends', cacheMiddleware(300), asyncHandler(async (req, res) => {
  const { period, lat, lng, radius_km } = req.query;
  const trends = await getSeverityTrend(period || '30d', lat, lng, radius_km);
  res.json(trends);
}));

// ════════════════════════════════════════════════════════════════
// Gamification Endpoints
// ════════════════════════════════════════════════════════════════

// Award points for an action (report, resolve, etc.)
app.post('/api/gamification/award', asyncHandler(async (req, res) => {
  const { user_id, action_type, issue_id } = req.body;
  if (!user_id || !action_type) {
    return res.status(400).json({ error: 'user_id and action_type are required' });
  }

  const result = await awardPoints(user_id, action_type, issue_id);
  res.json(result);
}));

// Get user gamification stats
app.get('/api/gamification/user/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const stats = await getUserGamificationStats(userId);
  res.json(stats);
}));

// ════════════════════════════════════════════════════════════════
// ROUTES: Agentic Workflow Layer (Milestone 8)
// ════════════════════════════════════════════════════════════════

// Process an issue through the full 5-agent pipeline
app.post('/api/agents/process-issue', asyncHandler(async (req, res) => {
  const { issue_id } = req.body;
  if (!issue_id) return res.status(400).json({ error: 'issue_id required' });

  // Verify issue exists
  const issueSnap = await adminDb.collection('issues').doc(issue_id).get();
  if (!issueSnap.exists) {
    return res.status(404).json({ error: 'Issue not found' });
  }

  // Run pipeline asynchronously and return immediately
  res.json({ status: 'processing', issue_id, message: 'Agent pipeline started' });

  // Process in background (don't await — the client polls for status)
  processIssuePipeline(issue_id).catch(err => {
    console.error(`[AgentPipeline] Background processing failed for ${issue_id}:`, err.message);
  });
}));

// Get agent pipeline status and logs for an issue
app.get('/api/agents/status/:issueId', asyncHandler(async (req, res) => {
  const status = await getAgentStatus(req.params.issueId);
  res.json(status);
}));

// Get agent logs for an issue
app.get('/api/agents/logs/:issueId', asyncHandler(async (req, res) => {
  const logsSnap = await adminDb
    .collection('issues')
    .doc(req.params.issueId)
    .collection('agent_logs')
    .orderBy('created_at', 'asc')
    .get();

  const logs = [];
  logsSnap.forEach((doc) => {
    const data = doc.data();
    logs.push({
      id: doc.id,
      ...data,
      created_at: data.created_at?.toDate?.()?.toISOString() || null,
    });
  });

  res.json(logs);
}));

// Run escalation check on all open issues
app.post('/api/agents/escalation-check', asyncHandler(async (req, res) => {
  const results = await checkAllEscalations();
  res.json(results);
}));

// ════════════════════════════════════════════════════════════════
// ROUTES: Predictive Analytics (Milestone 9)
// ════════════════════════════════════════════════════════════════

app.get('/api/predictions/hotspots', cacheMiddleware(900), asyncHandler(async (req, res) => {
  const { lat, lng, radius_km } = req.query;
  const hotspots = await predictHotspots(lat, lng, radius_km);
  res.json(hotspots);
}));

app.get('/api/predictions/trends', cacheMiddleware(900), asyncHandler(async (req, res) => {
  const { lat, lng, radius_km } = req.query;
  const trends = await forecastTrends(lat, lng, radius_km);
  res.json(trends);
}));

app.get('/api/predictions/risk-zones', cacheMiddleware(900), asyncHandler(async (req, res) => {
  const { lat, lng, radius_km } = req.query;
  const riskZones = await computeRiskZones(lat, lng, radius_km);
  res.json(riskZones);
}));

app.get('/api/predictions/summary', cacheMiddleware(900), asyncHandler(async (req, res) => {
  const { lat, lng, radius_km } = req.query;
  const summary = await generatePredictionSummary(lat, lng, radius_km);
  res.json(summary);
}));

// ════════════════════════════════════════════════════════════════
// Health Check
// ════════════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    ai: !!process.env.GEMINI_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
    firebase_admin: !!adminDb,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ─── Global Error Handler ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  if (err.message?.includes('cannot verify your own')) {
    return res.status(403).json({ error: err.message });
  }
  if (err.message?.includes('not found')) {
    return res.status(404).json({ error: err.message });
  }
  if (err.message?.includes('required') || err.message?.includes('Invalid')) {
    return res.status(400).json({ error: err.message });
  }

  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// ─── Start Server ───────────────────────────────────────────────
app.listen(port, '0.0.0.0', () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║     CivicPulse AI Backend — v0.5.0        ║`);
  console.log(`║     Milestones 1-9 Complete               ║`);
  console.log(`╠══════════════════════════════════════════════╣`);
  console.log(`║  Server:    http://0.0.0.0:${port}           ║`);
  console.log(`║  Uploads:   ${UPLOAD_DIR.slice(-30).padEnd(32)}║`);
  console.log(`║  Gemini AI: ${(process.env.GEMINI_API_KEY ? 'Configured ✓' : 'NOT SET ✗').padEnd(32)}║`);
  console.log(`║  Groq AI:   ${(process.env.GROQ_API_KEY ? 'Configured ✓' : 'NOT SET ✗').padEnd(32)}║`);
  console.log(`║  Firebase:  ${(adminDb ? 'Admin SDK ✓' : 'NOT INIT ✗').padEnd(32)}║`);
  console.log(`║  Agents:    5 autonomous agents ✓           ║`);
  console.log(`║  Predict:   Hotspot + Trend + Risk ✓        ║`);
  console.log(`╚═════════════════════════════════════════════╝\n`);
});
