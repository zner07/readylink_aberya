'use strict';
/* Map geometry for the server.

   The frontend draws the map in SVG "map units" (x from 0 to 1000, y from 0 to 611). x,y are NOT latitude and longitude.
   The server stores real latitude/longitude and converts to and from map units with the SAME constants
   the frontend uses (GEO in js/map-data.js). A test reads js/map-data.js and fails if the two ever drift apart.
   The boundary check uses the original OpenStreetMap file data/alangilan.geojson. */
const fs = require('node:fs');

const GEO = Object.freeze({
  lo0: 121.0557737,
  la1: 13.7888539,
  kx: 108114.828,
  ky: 110570,
  s: 0.390271,
  ox: 40.0,
  oy: 40.675,
});
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 611;

const xyToLatLng = (x, y) => ({
  lat: GEO.la1 - (y - GEO.oy) / GEO.s / GEO.ky,
  lng: GEO.lo0 + (x - GEO.ox) / GEO.s / GEO.kx,
});

const latLngToXy = (lat, lng) => ({
  x: (lng - GEO.lo0) * GEO.kx * GEO.s + GEO.ox,
  y: (GEO.la1 - lat) * GEO.ky * GEO.s + GEO.oy,
});

const isInsideMapBounds = (x, y) => x >= 0 && x <= MAP_WIDTH && y >= 0 && y <= MAP_HEIGHT;

/* Ray-casting point-in-polygon test. ring is an array of [lng, lat] pairs (GeoJSON order). */
function pointInRing(ring, lng, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* Reads the boundary file once and returns the helpers the services need. */
function createGeo(boundaryFile) {
  const geojson = JSON.parse(fs.readFileSync(boundaryFile, 'utf8'));
  const feature = geojson.type === 'FeatureCollection' ? geojson.features[0] : geojson;
  const geometry = feature && feature.geometry;
  if (!geometry || geometry.type !== 'Polygon') throw new Error(`${boundaryFile} must contain one Polygon.`);
  const ring = geometry.coordinates[0];
  return {
    ring,
    xyToLatLng,
    latLngToXy,
    isInsideMapBounds,
    isInsideBoundary: (lat, lng) => pointInRing(ring, lng, lat),
  };
}

module.exports = { createGeo, xyToLatLng, latLngToXy, isInsideMapBounds, GEO, MAP_WIDTH, MAP_HEIGHT };
