'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GEO, xyToLatLng, latLngToXy, isInsideMapBounds } = require('../../src/services/geo');
const { FRONTEND_DIR, geo } = require('../helpers/env');
const { loadSampleRows } = require('../../src/services/seedService');

const mapData = fs.readFileSync(path.join(FRONTEND_DIR, 'js', 'map-data.js'), 'utf8');

test('GEO constants are identical to the ones in the frontend (js/map-data.js)', () => {
  const text = /const GEO=\{([^}]*)\}/.exec(mapData);
  assert.ok(text, 'could not find GEO in js/map-data.js');
  const frontend = Object.fromEntries(text[1].split(',').map((p) => p.split(':').map((s) => s.trim())).map(([k, v]) => [k, Number(v)]));
  assert.deepEqual({ ...GEO }, frontend, 'server/src/services/geo.js and js/map-data.js disagree. Update both together.');
});

test('the boundary file projected with GEO reproduces the frontend POLY (the polygon the map draws)', () => {
  const poly = JSON.parse(/const POLY=(\[\[.*?\]\]);/s.exec(mapData)[1]);
  assert.equal(poly.length, geo.ring.length);
  let worst = 0;
  geo.ring.forEach(([lng, lat], i) => {
    const { x, y } = latLngToXy(lat, lng);
    worst = Math.max(worst, Math.abs(x - poly[i][0]), Math.abs(y - poly[i][1]));
  });
  assert.ok(worst < 0.1, `largest difference was ${worst} map units`);
});

test('x,y -> lat,lng -> x,y returns the same point', () => {
  for (const [x, y] of [[500, 300], [355, 81], [123.4, 456.7], [0, 0], [1000, 611]]) {
    const { lat, lng } = xyToLatLng(x, y);
    const back = latLngToXy(lat, lng);
    assert.ok(Math.abs(back.x - x) < 1e-6 && Math.abs(back.y - y) < 1e-6, `${x},${y}`);
  }
});

test('lat/lng values are real coordinates near Alangilan, Batangas City', () => {
  const { lat, lng } = xyToLatLng(500, 300);
  assert.ok(lat > 13.77 && lat < 13.80, `lat ${lat}`);
  assert.ok(lng > 121.05 && lng < 121.08, `lng ${lng}`);
});

test('map bounds are 0..1000 by 0..611', () => {
  assert.equal(isInsideMapBounds(0, 0), true);
  assert.equal(isInsideMapBounds(1000, 611), true);
  assert.equal(isInsideMapBounds(-0.1, 10), false);
  assert.equal(isInsideMapBounds(10, 611.1), false);
  assert.equal(isInsideMapBounds(1001, 10), false);
});

test('boundary check: inside points pass, outside points fail', () => {
  const inside = xyToLatLng(500, 300);
  assert.equal(geo.isInsideBoundary(inside.lat, inside.lng), true);
  const corner = xyToLatLng(5, 5); // inside the map rectangle but outside the barangay
  assert.equal(geo.isInsideBoundary(corner.lat, corner.lng), false);
  assert.equal(geo.isInsideBoundary(14.5, 121.0), false); // far away
});

test('all 12 sample reports are inside the barangay boundary', () => {
  const rows = loadSampleRows(FRONTEND_DIR);
  assert.equal(rows.length, 12);
  for (const r of rows) {
    const { lat, lng } = xyToLatLng(r.x, r.y);
    assert.equal(geo.isInsideBoundary(lat, lng), true, r.id);
  }
});

test('createGeo rejects a file that is not a polygon', () => {
  const { tempDir, removeDir } = require('../helpers/env');
  const { createGeo } = require('../../src/services/geo');
  const dir = tempDir();
  try {
    const file = path.join(dir, 'point.geojson');
    fs.writeFileSync(file, JSON.stringify({ type: 'Feature', geometry: { type: 'Point', coordinates: [121, 13] } }));
    assert.throws(() => createGeo(file), /must contain one Polygon/);
  } finally {
    removeDir(dir);
  }
});
