/**
 * algorithm.js — RouteMaster Order Picker
 *
 * Implements Breadth-First Search (BFS) to find the shortest route
 * visiting ALL target cells in the grid using a greedy nearest-
 * neighbour strategy.
 *
 * Grid conventions
 * ─────────────────
 *  0  walkable cell
 *  1  obstacle (blocked)
 *  2  target item  ← ONE OR MORE cells may have this value
 *
 * Coordinates use [row, col] format (row 0 = top of the grid).
 */

// ─────────────────────────────────────────────────────────────
//  Core BFS — find shortest path from `start` to `end`
// ─────────────────────────────────────────────────────────────

/**
 * bfs(grid, start, end)
 *
 * Returns an array of [row, col] positions representing the
 * shortest walkable path from start to end, inclusive.
 * Returns null when no path exists.
 *
 * @param {number[][]} grid  - 2-D warehouse grid
 * @param {number[]}   start - [row, col] starting cell
 * @param {number[]}   end   - [row, col] target cell
 * @returns {number[][]|null}
 */
function bfs(grid, start, end) {
  const rows = grid.length;
  const cols = grid[0].length;

  // Four cardinal directions: right, left, down, up
  const directions = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];

  // Each queue item → [ currentCell, pathSoFar ]
  const queue = [[start, [start]]];
  const visited = new Set();
  visited.add(`${start[0]},${start[1]}`);

  while (queue.length > 0) {
    const [current, path] = queue.shift();
    const [r, c] = current;

    // Reached the destination
    if (r === end[0] && c === end[1]) {
      return path;
    }

    for (const [dr, dc] of directions) {
      const nr = r + dr;
      const nc = c + dc;
      const key = `${nr},${nc}`;

      const inBounds = nr >= 0 && nr < rows && nc >= 0 && nc < cols;
      const passable = inBounds && grid[nr][nc] !== 1; // not an obstacle
      const notSeen = !visited.has(key);

      if (passable && notSeen) {
        visited.add(key);
        queue.push([[nr, nc], [...path, [nr, nc]]]);
      }
    }
  }

  return null; // No path found
}

// ─────────────────────────────────────────────────────────────
//  Helper — locate ALL target cells (value 2) in the grid
// ─────────────────────────────────────────────────────────────

/**
 * findAllTargetsInGrid(grid)
 *
 * Scans the grid and returns every [row, col] whose value is 2.
 * Throws if no target is found.
 *
 * @param {number[][]} grid
 * @returns {number[][]} array of [row, col]
 */
function findAllTargetsInGrid(grid) {
  const found = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] === 2) found.push([r, c]);
    }
  }
  if (found.length === 0) throw new Error('No target (value 2) found in the grid.');
  return found;
}

// ─────────────────────────────────────────────────────────────
//  Main exported function
// ─────────────────────────────────────────────────────────────

/**
 * findShortestRoute(grid, start)
 *
 * Locates ALL target cells (value 2) in the grid, then uses a
 * greedy nearest-neighbour BFS strategy to visit every target
 * in the order that minimises each individual hop.
 *
 * Algorithm steps
 * ───────────────
 * 1. Collect all cells with value 2 as the target list.
 * 2. From the current position BFS to every remaining target;
 *    pick the closest one (shortest path).
 * 3. Stitch that sub-path onto the full route, advance current
 *    position, remove target from the remaining list.
 * 4. Repeat until all reachable targets are collected.
 * 5. Return the stitched path and statistics.
 *
 * @param {number[][]} grid  - 2-D warehouse grid (one or more cells equal 2)
 * @param {number[]}   start - [row, col] starting cell
 * @returns {{ total_steps: number, path: number[][], targets: number[][], targets_collected: number, visit_order: number[][], unreachable: number }}
 */
function findShortestRoute(grid, start) {
  // Step 1 — collect all targets
  const allTargets = findAllTargetsInGrid(grid);
  const remaining  = allTargets.map(t => [...t]);

  let current    = start;
  let fullPath   = [start];
  let totalSteps = 0;
  const visitOrder = [];

  // Step 2-4 — greedy nearest-neighbour
  while (remaining.length > 0) {
    let bestPath   = null;
    let bestTarget = null;
    let bestIdx    = -1;

    for (let i = 0; i < remaining.length; i++) {
      const p = bfs(grid, current, remaining[i]);
      if (p && (!bestPath || p.length < bestPath.length)) {
        bestPath   = p;
        bestTarget = remaining[i];
        bestIdx    = i;
      }
    }

    if (!bestPath) break; // remaining targets are unreachable

    // Stitch — skip the first node (already the last in fullPath)
    fullPath   = fullPath.concat(bestPath.slice(1));
    totalSteps += bestPath.length - 1;
    visitOrder.push(bestTarget);
    current    = bestTarget;
    remaining.splice(bestIdx, 1);
  }

  // Step 5 — build result
  return {
    total_steps:        totalSteps,
    path:               fullPath,
    targets:            allTargets,
    targets_collected:  visitOrder.length,
    visit_order:        visitOrder,
    unreachable:        remaining.length,
  };
}
