#!/usr/bin/env node
// One-time script: picks 10 GPX routes from the private app, anonymises them,
// and writes data/demo-routes.json for the public app.
// Run from the activity-map-public directory: node scripts/generate-demo.js

const { readFile, writeFile } = require('fs/promises');
const { join } = require('path');
const { XMLParser } = require('fast-xml-parser');

const ORIGINAL_DATA = join(__dirname, '../../activity-map/data');
const OUTPUT        = join(__dirname, '../data/demo-routes.json');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// How many of each type to include
const QUOTA = {
  HKWorkoutActivityTypeWalking: 3,
  HKWorkoutActivityTypeCycling: 3,
  HKWorkoutActivityTypeHiking:  2,
  HKWorkoutActivityTypeRunning: 1,
  HKWorkoutActivityTypeRowing:  1,
};

function normalizeArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function samplePoints(pts, max = 300) {
  if (pts.length <= max) return pts;
  const step = Math.ceil(pts.length / max);
  return pts.filter((_, i) => i % step === 0);
}

// Apply a unique random offset to every route so no real location is revealed.
// Keeps the shape (street patterns) but moves the route ±~10 km.
function anonymise(points) {
  const latOff = (Math.random() - 0.5) * 0.18;
  const lonOff = (Math.random() - 0.5) * 0.18;
  return points.map(([lat, lon]) => [
    parseFloat((lat + latOff).toFixed(6)),
    parseFloat((lon + lonOff).toFixed(6)),
  ]);
}

async function parseGPX(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const result  = parser.parse(content);
  const trk     = result?.gpx?.trk;
  if (!trk) throw new Error('No track found');

  const pts = [], times = [];
  for (const seg of normalizeArray(trk.trkseg)) {
    for (const pt of normalizeArray(seg.trkpt)) {
      pts.push([parseFloat(pt['@_lat']), parseFloat(pt['@_lon'])]);
      times.push(pt.time);
    }
  }
  if (pts.length < 2) throw new Error('Too few points');
  return { points: samplePoints(pts, 300), startTime: times[0], endTime: times[times.length - 1] };
}

async function main() {
  const workouts = JSON.parse(await readFile(join(ORIGINAL_DATA, 'workouts.json'), 'utf-8'));

  // Group files by activity type, sorted by filename (roughly chronological)
  const byType = {};
  for (const [file, meta] of Object.entries(workouts)) {
    if (!byType[meta.type]) byType[meta.type] = [];
    byType[meta.type].push({ file, ...meta });
  }

  const demo = [];

  for (const [type, quota] of Object.entries(QUOTA)) {
    const pool = byType[type] || [];
    if (!pool.length) { console.warn(`No routes for ${type}`); continue; }

    // Spread picks evenly across the pool
    const picks = [];
    for (let i = 0; i < quota; i++) {
      const idx = Math.round(i * (pool.length - 1) / Math.max(quota - 1, 1));
      picks.push(pool[idx]);
    }

    for (const workout of picks) {
      try {
        const gpxPath = join(ORIGINAL_DATA, workout.file);
        const { points } = await parseGPX(gpxPath);

        demo.push({
          id:           `demo_${demo.length + 1}`,
          type,
          startTime:    null,   // timestamps stripped for privacy
          endTime:      null,
          distance:     workout.distance     ? parseFloat(workout.distance.toFixed(2))     : null,
          distanceUnit: workout.distanceUnit ?? null,
          calories:     workout.calories     ? Math.round(workout.calories)                 : null,
          totalPoints:  points.length,
          points:       anonymise(points),
          isDemo:       true,
        });

        const label = type.replace('HKWorkoutActivityType', '');
        console.log(`  [${label}] ${workout.file}`);
      } catch (e) {
        console.error(`  Failed ${workout.file}: ${e.message}`);
      }
    }
  }

  await writeFile(OUTPUT, JSON.stringify(demo, null, 2));
  console.log(`\nWrote ${demo.length} demo routes → ${OUTPUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
