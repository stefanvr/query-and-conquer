/**
 * Generic weighted hex pathfinder (Dijkstra with a binary-heap
 * frontier). Domain-agnostic on purpose: callers inject a `costFn`
 * (terrain move costs, unit-occupancy blocking, whatever else applies)
 * and this module just finds the cheapest path. Used for human move
 * legality/cost from Stage 4 on, and reused unmodified by hard AI in
 * Stage 7 -- see the implementation plan's "Pathfinding for hard AI"
 * note.
 *
 * Per design doc §3, "no partial moves; 0 = impassable" -- a costFn
 * returning 0 or a non-finite value for a step marks it impassable;
 * this module treats those identically (the step is skipped).
 */
import { neighborsInBounds } from "./neighbors.js";

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(item, priority) {
    this.items.push({ item, priority });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].priority <= this.items[i].priority) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = i * 2 + 2;
        let smallest = i;
        if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) smallest = left;
        if (right < this.items.length && this.items[right].priority < this.items[smallest].priority) smallest = right;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
        i = smallest;
      }
    }
    return top?.item;
  }
}

const cellKey = (c) => `${c.col},${c.row}`;

/**
 * @param {{
 *   start: {col: number, row: number},
 *   goal: {col: number, row: number},
 *   width: number,
 *   height: number,
 *   costFn: (to: {col: number, row: number}, from: {col: number, row: number}) => number,
 *   maxCost?: number
 * }} opts
 * @returns {{path: {col: number, row: number}[], cost: number} | null} null if unreachable within maxCost
 */
export function findPath({ start, goal, width, height, costFn, maxCost = Infinity }) {
  const dist = new Map([[cellKey(start), 0]]);
  const prev = new Map();
  const heap = new MinHeap();
  heap.push(start, 0);

  while (heap.size > 0) {
    const current = heap.pop();
    const currentCost = dist.get(cellKey(current));

    if (current.col === goal.col && current.row === goal.row) {
      return buildPath(prev, start, goal, currentCost);
    }

    for (const neighbor of neighborsInBounds(current, width, height)) {
      const stepCost = costFn(neighbor, current);
      if (!Number.isFinite(stepCost) || stepCost <= 0) continue; // impassable

      const newCost = currentCost + stepCost;
      if (newCost > maxCost) continue;

      const nk = cellKey(neighbor);
      if (!dist.has(nk) || newCost < dist.get(nk)) {
        dist.set(nk, newCost);
        prev.set(nk, current);
        heap.push(neighbor, newCost);
      }
    }
  }
  return null;
}

function buildPath(prev, start, goal, cost) {
  const path = [goal];
  let cur = goal;
  while (!(cur.col === start.col && cur.row === start.row)) {
    cur = prev.get(cellKey(cur));
    path.push(cur);
  }
  path.reverse();
  return { path, cost };
}

/**
 * All cells reachable from `start` within `budget`, with their cheapest
 * cost -- used for move-range highlighting ("IN RANGE").
 * @param {{start: {col: number, row: number}, width: number, height: number, costFn: Function, budget: number}} opts
 * @returns {Map<string, number>} cellKey -> cheapest cost to reach it
 */
export function reachableCells({ start, width, height, costFn, budget }) {
  const dist = new Map([[cellKey(start), 0]]);
  const heap = new MinHeap();
  heap.push(start, 0);

  while (heap.size > 0) {
    const current = heap.pop();
    const currentCost = dist.get(cellKey(current));

    for (const neighbor of neighborsInBounds(current, width, height)) {
      const stepCost = costFn(neighbor, current);
      if (!Number.isFinite(stepCost) || stepCost <= 0) continue;

      const newCost = currentCost + stepCost;
      if (newCost > budget) continue;

      const nk = cellKey(neighbor);
      if (!dist.has(nk) || newCost < dist.get(nk)) {
        dist.set(nk, newCost);
        heap.push(neighbor, newCost);
      }
    }
  }
  return dist;
}
