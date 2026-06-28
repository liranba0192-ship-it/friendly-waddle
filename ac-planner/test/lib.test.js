// בדיקות יחידה לפונקציות הטהורות. הרצה: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distance,
  polylineLengthPx,
  distancePointToSegment,
  nearestRouteToPoint,
  nearestSegmentIndex,
} from '../src/lib/geometry.js';
import { imageToScreen, screenToImage, zoomAtPoint, fitImage } from '../src/lib/transform.js';
import { computePixelsPerMeter, pxToMeters, routeLengthMeters, formatMeters } from '../src/lib/scale.js';

test('distance', () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('polylineLengthPx', () => {
  assert.equal(polylineLengthPx([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 4 }]), 5);
  assert.equal(polylineLengthPx([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }]), 20);
  assert.equal(polylineLengthPx([{ x: 1, y: 1 }]), 0);
  assert.equal(polylineLengthPx([]), 0);
});

test('distancePointToSegment', () => {
  // נקודה מעל אמצע קטע אופקי
  assert.equal(distancePointToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3);
  // נקודה מעבר לקצה הקטע — מרחק לקצה
  assert.equal(distancePointToSegment({ x: 13, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3);
});

test('nearestRouteToPoint + maxDist', () => {
  const routes = [
    { id: 'a', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    { id: 'b', points: [{ x: 0, y: 100 }, { x: 10, y: 100 }] },
  ];
  const hit = nearestRouteToPoint(routes, { x: 5, y: 2 }, 20);
  assert.equal(hit.route.id, 'a');
  assert.equal(nearestRouteToPoint(routes, { x: 5, y: 50 }, 10), null);
});

test('nearestSegmentIndex', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  assert.equal(nearestSegmentIndex({ x: 5, y: 1 }, pts), 0);
  assert.equal(nearestSegmentIndex({ x: 11, y: 5 }, pts), 1);
});

test('transform round-trip', () => {
  const vp = { scale: 2, x: 50, y: -30 };
  const p = { x: 12, y: 34 };
  const back = screenToImage(imageToScreen(p, vp), vp);
  assert.ok(Math.abs(back.x - p.x) < 1e-9);
  assert.ok(Math.abs(back.y - p.y) < 1e-9);
});

test('zoomAtPoint keeps image point under pointer', () => {
  const vp = { scale: 1, x: 0, y: 0 };
  const pointer = { x: 100, y: 100 };
  const before = screenToImage(pointer, vp);
  const next = zoomAtPoint(vp, pointer, 3);
  const after = screenToImage(pointer, next);
  assert.ok(Math.abs(after.x - before.x) < 1e-9);
  assert.ok(Math.abs(after.y - before.y) < 1e-9);
  assert.equal(next.scale, 3);
});

test('zoomAtPoint clamps', () => {
  const vp = { scale: 1, x: 0, y: 0 };
  assert.equal(zoomAtPoint(vp, { x: 0, y: 0 }, 999).scale, 12);
  assert.equal(zoomAtPoint(vp, { x: 0, y: 0 }, 0.0001).scale, 0.1);
});

test('fitImage centers', () => {
  const vp = fitImage(100, 100, 500, 300, 0);
  assert.equal(vp.scale, 3); // min(500/100, 300/100) = 3
  // ממורכז אנכית: (300 - 300)/2 = 0 ; אופקית: (500-300)/2 = 100
  assert.equal(vp.x, 100);
  assert.equal(vp.y, 0);
});

test('computePixelsPerMeter', () => {
  assert.equal(computePixelsPerMeter({ x: 0, y: 0 }, { x: 400, y: 0 }, 4), 100);
  assert.equal(computePixelsPerMeter({ x: 0, y: 0 }, { x: 0, y: 0 }, 4), null);
  assert.equal(computePixelsPerMeter({ x: 0, y: 0 }, { x: 400, y: 0 }, 0), null);
  assert.equal(computePixelsPerMeter({ x: 0, y: 0 }, { x: 400, y: 0 }, -1), null);
});

test('pxToMeters + routeLengthMeters', () => {
  assert.equal(pxToMeters(500, 100), 5);
  assert.equal(pxToMeters(500, null), null);
  const pts = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }];
  assert.equal(routeLengthMeters(pts, 100), 7); // (300+400)/100
  assert.equal(routeLengthMeters(pts, null), null);
});

test('formatMeters', () => {
  assert.equal(formatMeters(4.3), '4.30 מ׳');
  assert.equal(formatMeters(12.5), '12.50 מ׳');
  assert.equal(formatMeters(null), '—');
  assert.equal(formatMeters(NaN), '—');
});
