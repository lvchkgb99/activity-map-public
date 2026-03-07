'use strict';

const express  = require('express');
const multer   = require('multer');
const unzipper = require('unzipper');
const readline = require('readline');
const { XMLParser }      = require('fast-xml-parser');
const { join, basename } = require('path');
const { randomUUID }     = require('crypto');
const fs = require('fs');
const os = require('os');

const app    = express();
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// ── In-memory stores ──────────────────────────────────────────────────────────
// sid → { routes, done, error, lastEvent }
const sessions   = new Map();
// sid → SSE response
const sseClients = new Map();

// ── GPX helpers ───────────────────────────────────────────────────────────────
function normalizeArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function samplePoints(pts, max = 300) {
  if (pts.length <= max) return pts;
  const step = Math.ceil(pts.length / max);
  return pts.filter((_, i) => i % step === 0);
}

function parseGPXContent(content, filename) {
  try {
    const result = parser.parse(content);
    const trk    = result?.gpx?.trk;
    if (!trk) return null;

    const pts = [], times = [];
    for (const seg of normalizeArray(trk.trkseg)) {
      for (const pt of normalizeArray(seg.trkpt)) {
        pts.push([parseFloat(pt['@_lat']), parseFloat(pt['@_lon'])]);
        times.push(pt.time);
      }
    }
    if (pts.length < 2) return null;

    return {
      id:          filename.replace('.gpx', ''),
      name:        trk.name || '',
      startTime:   times[0]              || null,
      endTime:     times[times.length-1] || null,
      totalPoints: pts.length,
      points:      samplePoints(pts, 300),
      type: null, distance: null, distanceUnit: null, calories: null,
    };
  } catch { return null; }
}

// Extracts a named XML attribute from a line of text
function xmlAttr(line, name) {
  const m = line.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
}

// ── SSE helpers ───────────────────────────────────────────────────────────────
function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function notify(sid, event) {
  const session = sessions.get(sid);
  if (session) session.lastEvent = event;
  const client = sseClients.get(sid);
  if (client) sendSSE(client, event);
}

// ── Upload processing ─────────────────────────────────────────────────────────
async function processUpload(sid, filePath) {
  const session = sessions.get(sid);
  try {
    notify(sid, { progress: 5, message: 'Opening zip...' });

    const dir      = await unzipper.Open.file(filePath);
    const gpxFiles = dir.files.filter(
      f => f.path.endsWith('.gpx') && !f.path.includes('__MACOSX')
    );

    if (!gpxFiles.length) {
      throw new Error('No GPX routes found. Make sure you export from the Health app on your iPhone.');
    }

    notify(sid, { progress: 10, message: `Found ${gpxFiles.length} routes. Reading workout data...` });

    // ── Parse export.xml for workout metadata (type, distance, calories) ──────
    const workoutMeta = {};
    const xmlFile = dir.files.find(f => f.path.endsWith('export.xml'));
    if (xmlFile) {
      const stream = xmlFile.stream();
      const rl     = readline.createInterface({ input: stream, crlfDelay: Infinity });
      let current  = null;

      for await (const line of rl) {
        const t = line.trim();

        if (/^<Workout workoutActivityType/.test(t)) {
          current = {
            type: xmlAttr(t, 'workoutActivityType'),
            distance: null, distanceUnit: null, calories: null,
          };
        } else if (t.startsWith('<WorkoutStatistics ') && current) {
          const type = xmlAttr(t, 'type') || '';
          const sum  = parseFloat(xmlAttr(t, 'sum') || '0') || null;
          const unit = xmlAttr(t, 'unit');
          if (type.startsWith('HKQuantityTypeIdentifierDistance') && sum && !current.distance) {
            current.distance = sum; current.distanceUnit = unit;
          }
          if (type === 'HKQuantityTypeIdentifierActiveEnergyBurned' && sum) {
            current.calories = sum;
          }
        } else if (t.startsWith('<FileReference ') && current) {
          const p = xmlAttr(t, 'path');
          if (p?.includes('/workout-routes/')) {
            workoutMeta[p.split('/').pop()] = { ...current };
          }
        } else if (t === '</Workout>') {
          current = null;
        }
      }

      notify(sid, {
        progress: 30,
        message: `Matched ${Object.keys(workoutMeta).length} workout records. Parsing routes...`,
      });
    }

    // ── Parse GPX files ───────────────────────────────────────────────────────
    const routes = [];
    for (let i = 0; i < gpxFiles.length; i++) {
      const file = gpxFiles[i];
      const name = basename(file.path);
      try {
        const buf   = await file.buffer();
        const route = parseGPXContent(buf.toString(), name);
        if (route) {
          const meta = workoutMeta[name] || {};
          routes.push({
            ...route,
            type:         meta.type         ?? null,
            distance:     meta.distance     ?? null,
            distanceUnit: meta.distanceUnit ?? null,
            calories:     meta.calories     ?? null,
          });
        }
      } catch (_) { /* skip malformed GPX */ }

      // Send progress every 20 files to avoid flooding SSE
      if (i % 20 === 0 || i === gpxFiles.length - 1) {
        notify(sid, {
          progress: 30 + Math.round((i + 1) / gpxFiles.length * 65),
          message:  `Parsing route ${i + 1} of ${gpxFiles.length}...`,
        });
      }
    }

    session.routes = routes;
    session.done   = true;
    notify(sid, { progress: 100, message: `Done! Loaded ${routes.length} routes.`, done: true });

    // Auto-clear session after 1 hour
    setTimeout(() => sessions.delete(sid), 3_600_000);

  } catch (e) {
    session.done  = true;
    session.error = e.message;
    notify(sid, { error: e.message, done: true });
  } finally {
    fs.unlink(filePath, () => {});
  }
}

// ── Multer (disk storage handles large Health exports) ────────────────────────
const upload = multer({
  dest:   os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

// ── HTTP routes ───────────────────────────────────────────────────────────────
app.use(express.static(join(__dirname, 'public')));

// SSE stream for upload progress
app.get('/api/progress/:sid', (req, res) => {
  const { sid } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.set(sid, res);

  // If processing already started, replay last known event
  const session = sessions.get(sid);
  if (session?.lastEvent) sendSSE(res, session.lastEvent);

  req.on('close', () => sseClients.delete(sid));
});

// Accept zip upload, kick off background processing
app.post('/api/upload/:sid', upload.single('file'), (req, res) => {
  const { sid } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file received' });

  sessions.set(sid, { routes: [], done: false, error: null, lastEvent: null });
  res.json({ ok: true });

  processUpload(sid, req.file.path); // fire and forget
});

// Fetch processed routes for a session
app.get('/api/routes/:sid', (req, res) => {
  const { sid } = req.params;
  const session = sessions.get(sid);
  if (!session)        return res.status(404).json({ error: 'Session not found' });
  if (!session.done)   return res.status(202).json({ processing: true });
  if (session.error)   return res.status(422).json({ error: session.error });
  res.json(session.routes);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Public app → http://localhost:${PORT}`));
