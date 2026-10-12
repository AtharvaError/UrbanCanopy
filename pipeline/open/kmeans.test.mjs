/**
 * The clustering labels every locality with a type, and that label is
 * published. Two things have to hold for it to be worth publishing: the
 * algorithm finds groups that are plainly there, and it finds the same ones
 * every time.
 *
 * Run: node --test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseClusters, kmeans, seededRandom, silhouette } from "./lib/kmeans.mjs";

/** Three tight, well-separated blobs of five points each. */
const BLOBS = [
  [0, 0], [0.1, 0.2], [-0.2, 0.1], [0.15, -0.1], [-0.1, -0.15],
  [10, 10], [10.2, 9.9], [9.8, 10.1], [10.1, 10.2], [9.9, 9.8],
  [0, 10], [0.2, 10.1], [-0.1, 9.9], [0.1, 10.2], [-0.2, 10],
];

const groupsOf = (assignments) => {
  const groups = new Map();
  assignments.forEach((a, i) => groups.set(a, [...(groups.get(a) ?? []), i]));
  return [...groups.values()].map((g) => g.join(",")).sort();
};

test("recovers three groups that are plainly there", () => {
  const { assignments } = kmeans(BLOBS, 3);
  assert.deepEqual(groupsOf(assignments), ["0,1,2,3,4", "10,11,12,13,14", "5,6,7,8,9"]);
});

test("gives the same clusters on every run", () => {
  const first = kmeans(BLOBS, 3);
  const second = kmeans(BLOBS, 3);
  assert.deepEqual(first.assignments, second.assignments);
  assert.equal(first.inertia, second.inertia);
});

test("draws the same sequence from the same seed, and a different one from another", () => {
  const a = seededRandom(7);
  const b = seededRandom(7);
  const c = seededRandom(8);
  const fromA = [a(), a(), a()];
  assert.deepEqual(fromA, [b(), b(), b()]);
  assert.notDeepEqual(fromA, [c(), c(), c()]);
  for (const value of fromA) assert.ok(value >= 0 && value < 1);
});

test("scores clean groups near 1 and a split through one group far lower", () => {
  const clean = silhouette(BLOBS, kmeans(BLOBS, 3).assignments);
  assert.ok(clean > 0.9, `expected a clean split, got ${clean}`);
  const forced = silhouette(BLOBS, kmeans(BLOBS, 4).assignments);
  assert.ok(forced < clean);
});

test("scores a single cluster as zero, not as an error", () => {
  assert.equal(silhouette(BLOBS, BLOBS.map(() => 0)), 0);
});

test("picks three for three blobs", () => {
  const { chosen, tried } = chooseClusters(BLOBS, [2, 3, 4]);
  assert.equal(chosen.k, 3);
  assert.deepEqual(tried.map((t) => t.k), [2, 3, 4]);
});

test("prefers the finer grouping only when it is nearly as clean", () => {
  // Two far-apart pairs of blobs: k=2 is clean, and k=4 is clean too, so the
  // finer one wins. With no tolerance the single cleanest wins instead.
  const pairs = [
    [0, 0], [0.1, 0.1], [0, 1.2], [0.1, 1.3],
    [20, 0], [20.1, 0.1], [20, 1.2], [20.1, 1.3],
  ];
  const strict = chooseClusters(pairs, [2, 3, 4], { tolerance: 0 });
  const loose = chooseClusters(pairs, [2, 3, 4], { tolerance: 1 });
  assert.ok(loose.chosen.k >= strict.chosen.k);
  assert.equal(loose.chosen.k, 4);
});

test("refuses a k it cannot fill", () => {
  assert.throws(() => kmeans(BLOBS, 0));
  assert.throws(() => kmeans(BLOBS, BLOBS.length + 1));
});
