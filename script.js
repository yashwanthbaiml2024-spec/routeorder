/**
 * script.js — RouteMaster Order Picker
 *
 * Responsibilities
 * ────────────────
 *  1. Read & validate the JSON input from the textarea.
 *  2. Call findShortestRoute() from algorithm.js.
 *  3. Display the JSON result.
 *  4. Draw the warehouse grid (drawGrid).
 *  5. Animate the picker moving step-by-step (animatePath).
 */

// ─────────────────────────────────────────────────────────────
//  DOM references
// ─────────────────────────────────────────────────────────────
const fileInput        = document.getElementById('json-file-input');
const loadFileBtn      = document.getElementById('load-file-btn');
const fileNameDisplay  = document.getElementById('file-name-display');
const uploadStatus     = document.getElementById('upload-status');
const findBtn          = document.getElementById('find-route-btn');
const jsonInput        = document.getElementById('json-input');
const jsonOutput       = document.getElementById('json-output');
const gridContainer    = document.getElementById('grid-container');
const gridPlaceholder  = document.getElementById('grid-placeholder');
const animationControls= document.getElementById('animation-controls');
const animateBtn       = document.getElementById('animate-btn');
const speedRange       = document.getElementById('speed-range');
const speedDisplay     = document.getElementById('speed-display');

// ─────────────────────────────────────────────────────────────
//  Module-level state
// ─────────────────────────────────────────────────────────────
let lastGrid    = null;   // parsed grid from the most recent run
let lastPath    = null;   // full path array [[r,c], ...]
let lastStart   = null;
let lastTargets = null;
let animationId = null;   // timeout reference for cancellation
let statsChartInstance = null; // Chart.js instance

// ─────────────────────────────────────────────────────────────
//  File upload — enable Load button when a file is chosen
// ─────────────────────────────────────────────────────────────

// "Choose File" button triggers the hidden file input via JS
const chooseFileBtn = document.getElementById('choose-file-btn');
chooseFileBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) {
    fileNameDisplay.textContent = file.name;
    loadFileBtn.disabled = false;
    setUploadStatus('', '');
  } else {
    fileNameDisplay.textContent = 'No file chosen';
    loadFileBtn.disabled = true;
  }
});

// ─────────────────────────────────────────────────────────────
//  "Load" button — read, validate, inject into textarea & run
// ─────────────────────────────────────────────────────────────
loadFileBtn.addEventListener('click', () => {
  const file = fileInput.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (event) => {
    // ── 1. Parse JSON ────────────────────────────────────────
    let data;
    try {
      data = JSON.parse(event.target.result);
    } catch (err) {
      setUploadStatus(`❌ Invalid JSON: ${err.message}`, 'error');
      return;
    }

    // ── 2. Validate required fields (case-insensitive keys) ──
    const GRID   = data.GRID  ?? data.grid;
    const START  = data.START ?? data.start;

    if (!GRID || !START) {
      setUploadStatus('❌ JSON must contain GRID and START keys (uppercase or lowercase).', 'error');
      return;
    }

    // ── 3. Validate GRID ─────────────────────────────────────
    if (!Array.isArray(GRID) || GRID.length === 0 || !Array.isArray(GRID[0])) {
      setUploadStatus('❌ GRID must be a non-empty 2-D array.', 'error');
      return;
    }

    const rows = GRID.length;
    const cols = GRID[0].length;

    // ── 4. Find target cell (value 2) inside GRID ───────────────
    const targetCells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (GRID[r][c] === 2) targetCells.push([r, c]);
      }
    }

    if (targetCells.length === 0) {
      setUploadStatus('❌ No target found. Place at least one cell with value 2 in GRID.', 'error');
      return;
    }

    // ── 5. Validate START ─────────────────────────────────────
    if (!Array.isArray(START) || START.length !== 2 ||
        START[0] < 0 || START[0] >= rows || START[1] < 0 || START[1] >= cols) {
      setUploadStatus(`❌ START [${START}] must be [row, col] within the grid bounds (${rows}×${cols}).`, 'error');
      return;
    }

    if (GRID[START[0]][START[1]] === 1) {
      setUploadStatus(`❌ START position [${START}] is on an obstacle.`, 'error');
      return;
    }

    // ── 6. Populate textarea (GRID already has 2, pass as-is) ─────
    jsonInput.value = prettyPrint({ grid: GRID, start: START });

    setUploadStatus(
      `✅ Loaded: ${file.name} — Grid ${rows}×${cols}, Start [${START}], Targets: ${targetCells.length}`,
      'success'
    );

    // ── 7. Auto-trigger Find Route ────────────────────────────
    findBtn.click();
  };

  reader.onerror = () => {
    setUploadStatus('❌ Failed to read the file.', 'error');
  };

  reader.readAsText(file);
});

/** Helper: set upload status message with a style class. */
function setUploadStatus(message, type) {
  uploadStatus.textContent = message;
  uploadStatus.className = `upload-status${type ? ' upload-status--' + type : ''}`;
}

// ─────────────────────────────────────────────────────────────
//  Textarea auto-format — pretty-print JSON on blur
// ─────────────────────────────────────────────────────────────
jsonInput.addEventListener('blur', () => {
  try {
    const parsed = JSON.parse(jsonInput.value);
    jsonInput.value = prettyPrint(parsed);
  } catch {
    // leave as-is if the JSON is currently invalid
  }
});

// ─────────────────────────────────────────────────────────────
//  Speed slider
// ─────────────────────────────────────────────────────────────
speedRange.addEventListener('input', () => {
  speedDisplay.textContent = `${speedRange.value} ms`;
});

// ─────────────────────────────────────────────────────────────
//  "Find Route" button
// ─────────────────────────────────────────────────────────────
findBtn.addEventListener('click', () => {
  // Stop any running animation
  cancelAnimation();

  // ── 1. Parse JSON ──────────────────────────────────────────
  let input;
  try {
    input = JSON.parse(jsonInput.value);
  } catch (err) {
    showError(`JSON parse error: ${err.message}`);
    return;
  }

  // ── 2. Validate structure ──────────────────────────────────
  const { grid, start } = input;

  if (!Array.isArray(grid)  || grid.length === 0)  { showError('"grid" must be a non-empty 2-D array.'); return; }
  if (!Array.isArray(start) || start.length !== 2) { showError('"start" must be [row, col].'); return; }

  // ── 3. Run BFS algorithm ───────────────────────────────────
  // findShortestRoute automatically locates the single value-2 cell in the grid
  let result;
  try {
    result = findShortestRoute(grid, start);
  } catch (err) {
    showError(err.message);
    return;
  }

  // ── 4. Show JSON output (syntax-highlighted) ────────────────
  jsonOutput.innerHTML = syntaxHighlight(prettyPrint(result));
  jsonOutput.style.color = '';  // reset inline color — CSS classes take over

  // ── 5. Save state & draw the grid ─────────────────────────
  const targets = result.targets || [];

  lastGrid    = grid;
  lastPath    = result.path;
  lastStart   = start;
  lastTargets = targets;

  drawGrid(grid, result.path, start, targets);
  updateDashboard(result);

  // ── 6. Show animation controls & panels ────────────────────
  gridPlaceholder.hidden = true;
  animationControls.hidden = false;
  animateBtn.disabled = false;
  animateBtn.textContent = '▶️ Animate Path';
  
  const statsContainer = document.getElementById('stats-container');
  if (statsContainer) statsContainer.hidden = false;
  
  const gridLabel = document.getElementById('grid-label');
  if (gridLabel) gridLabel.hidden = false;
  
  const gridLegend = document.getElementById('grid-legend');
  if (gridLegend) gridLegend.hidden = false;
});

// ─────────────────────────────────────────────────────────────
//  "Animate Path" button
// ─────────────────────────────────────────────────────────────
animateBtn.addEventListener('click', () => {
  if (!lastPath) return;

  // Reset grid to static view first, then animate
  drawGrid(lastGrid, lastPath, lastStart, lastTargets, /* showPath= */ false);
  animateBtn.disabled = true;
  animateBtn.textContent = '⏳ Animating…';

  animatePath(lastGrid, lastPath, lastStart, lastTargets, () => {
    // Callback when animation finishes
    animateBtn.disabled = false;
    animateBtn.textContent = '🔁 Replay Animation';
  });
});

// ─────────────────────────────────────────────────────────────
//  drawGrid(grid, path, start, targets, showPath=true)
//
//  Renders the warehouse grid into #grid-container.
//  showPath controls whether the green path cells are shown
//  immediately (true) or left blank for the animator (false).
// ─────────────────────────────────────────────────────────────
function drawGrid(grid, path, start, targets, showPath = true) {
  const rows = grid.length;
  const cols = grid[0].length;

  // Build a quick-lookup Set for path cells and targets
  const pathSet    = new Set(path.map(([r, c]) => `${r},${c}`));
  const targetSet  = new Set(targets.map(([r, c]) => `${r},${c}`));
  const startKey   = `${start[0]},${start[1]}`;

  // Configure CSS Grid columns
  gridContainer.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  gridContainer.innerHTML = ''; // clear previous render

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.dataset.row = r;
      cell.dataset.col = c;

      const key = `${r},${c}`;

      if (grid[r][c] === 1) {
        // Obstacle
        cell.classList.add('obstacle');
      } else if (key === startKey) {
        // Start position
        cell.classList.add('start');
        cell.title = 'Start';
      } else if (targetSet.has(key)) {
        // Target item
        cell.classList.add('target');
        cell.textContent = '📦';
        cell.title = 'Target';
      } else if (showPath && pathSet.has(key)) {
        // Calculated path
        cell.classList.add('path');
      } else {
        // Walkable empty floor
        cell.classList.add('walkable');
      }

      gridContainer.appendChild(cell);
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  animatePath(grid, path, start, targets, onComplete)
//
//  Steps through each position in `path`, updating the CSS
//  classes of cells to show the picker moving along the route.
// ─────────────────────────────────────────────────────────────
function animatePath(grid, path, start, targets, onComplete) {
  const targetSet = new Set(targets.map(([r, c]) => `${r},${c}`));
  const startKey  = `${start[0]},${start[1]}`;
  const delay     = parseInt(speedRange.value, 10);

  let step = 0;

  function getCell(r, c) {
    return gridContainer.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
  }

  /** Returns a directional arrow character based on movement from [pr,pc] → [r,c]. */
  function getArrow(pr, pc, r, c) {
    if (r < pr) return '↑'; // up
    if (r > pr) return '↓'; // down
    if (c < pc) return '←'; // left
    if (c > pc) return '→'; // right
    return '●';             // no movement (start cell)
  }

  function tick() {
    if (step >= path.length) {
      if (onComplete) onComplete();
      return;
    }

    const [r, c] = path[step];
    const key = `${r},${c}`;

    // Move walker: turn the previous walker cell into a visited trail
    if (step > 0) {
      const [pr, pc] = path[step - 1];
      const prevKey  = `${pr},${pc}`;
      const prevCell = getCell(pr, pc);
      if (prevCell) {
        prevCell.classList.remove('walker');
        // Restore the correct visual class for the previous cell
        if (prevKey === startKey) {
          prevCell.classList.add('start');
          prevCell.textContent = '';
        } else if (targetSet.has(prevKey)) {
          prevCell.classList.add('target');
          prevCell.textContent = '✅';  // collected!
        } else {
          prevCell.textContent = '';
          prevCell.classList.add('visited');
        }
      }
    }

    // Highlight current cell as the walker with a direction arrow
    const currCell = getCell(r, c);
    if (currCell) {
      currCell.classList.remove('walkable', 'path', 'start', 'target', 'visited', 'path-reveal');
      if (step > 0) {
        const [pr, pc] = path[step - 1];
        currCell.textContent = getArrow(pr, pc, r, c);
      } else {
        currCell.textContent = '●'; // starting cell marker
      }
      currCell.classList.add('walker');
    }

    step++;
    animationId = setTimeout(tick, delay);
  }

  tick();
}

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

/** Cancel any running animation. */
function cancelAnimation() {
  if (animationId !== null) {
    clearTimeout(animationId);
    animationId = null;
  }
}

/** Display an error message in the output area. */
function showError(message) {
  jsonOutput.innerHTML = `<span class="json-error">❌  Error: ${message}</span>`;
  jsonOutput.style.color = '';
}

/**
 * prettyPrint(obj)
 * Like JSON.stringify with 2-space indent, but keeps arrays whose every
 * element is a number (e.g. [row, col] coordinate pairs) on a single line.
 */
function prettyPrint(obj, indent = 2) {
  const pad = (n) => ' '.repeat(n);

  function fmt(val, depth) {
    if (val === null)             return 'null';
    if (typeof val === 'boolean') return String(val);
    if (typeof val === 'number')  return String(val);
    if (typeof val === 'string')  return JSON.stringify(val);

    if (Array.isArray(val)) {
      // Keep flat numeric arrays (coordinate pairs, etc.) on one line
      if (val.length === 0)                         return '[]';
      if (val.every(v => typeof v === 'number'))    return '[' + val.join(', ') + ']';

      const inner = val.map(v => pad((depth + 1) * indent) + fmt(v, depth + 1));
      return '[\n' + inner.join(',\n') + '\n' + pad(depth * indent) + ']';
    }

    if (typeof val === 'object') {
      const entries = Object.entries(val).map(
        ([k, v]) => pad((depth + 1) * indent) + JSON.stringify(k) + ': ' + fmt(v, depth + 1)
      );
      return '{\n' + entries.join(',\n') + '\n' + pad(depth * indent) + '}';
    }

    return String(val);
  }

  return fmt(obj, 0);
}

/**
 * syntaxHighlight(jsonStr)
 * Returns an HTML string with <span> tags for JSON syntax colouring.
 */
function syntaxHighlight(jsonStr) {
  const escaped = jsonStr
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"|/.test(match)) {
        cls = /:$/.test(match) ? 'json-key' : 'json-string';
      } else if (/true|false/.test(match)) {
        cls = 'json-bool';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

// ─────────────────────────────────────────────────────────────
//  Dynamic Grid Interaction
// ─────────────────────────────────────────────────────────────
gridContainer.addEventListener('click', (e) => {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  
  const r = parseInt(cell.dataset.row, 10);
  const c = parseInt(cell.dataset.col, 10);

  let data;
  try {
    data = JSON.parse(jsonInput.value);
  } catch (err) {
    return; // Cannot update if JSON is invalid
  }

  const GRID = data.GRID ?? data.grid;
  if (!GRID || !GRID[r]) return;

  // Cycle 0 -> 1 -> 2 -> 0
  GRID[r][c] = (GRID[r][c] + 1) % 3;

  jsonInput.value = prettyPrint(data);
  
  // Also stop any ongoing animation when user updates grid
  if (animationId) clearTimeout(animationId);
  
  findBtn.click();
});

// ─────────────────────────────────────────────────────────────
//  updateDashboard(result)
//  Updates the metrics and chart shown in the Route Statistics panel.
// ─────────────────────────────────────────────────────────────
function updateDashboard(result) {
  const steps = result.total_steps || 0;
  const targetsCollected = result.targets_collected || 0;
  
  const estimatedTime = steps; // 1 step = 1 second
  const pathEfficiency = steps > 0 ? ((targetsCollected / steps) * 100).toFixed(1) : 0;
  
  document.getElementById('total-steps').textContent = steps;
  document.getElementById('targets-collected').textContent = targetsCollected;
  document.getElementById('estimated-time').textContent = `${estimatedTime} sec`;
  document.getElementById('path-efficiency').textContent = `${pathEfficiency}%`;
  document.getElementById('algorithm-used').textContent = 'BFS';
  
  const canvasObj = document.getElementById('statsChart');
  if(!canvasObj) return;

  const ctx = canvasObj.getContext('2d');
  
  if (statsChartInstance) {
    statsChartInstance.destroy();
  }
  
  statsChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Metrics'],
      datasets: [
        {
          label: 'Total Steps',
          data: [steps],
          backgroundColor: 'rgba(56, 189, 248, 0.7)',
          borderColor: 'rgba(56, 189, 248, 1)',
          borderWidth: 1
        },
        {
          label: 'Targets Collected',
          data: [targetsCollected],
          backgroundColor: 'rgba(245, 158, 11, 0.7)',
          borderColor: 'rgba(245, 158, 11, 1)',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#e2e8f0' },
          grid: { color: '#334155' }
        },
        x: {
          ticks: { color: '#e2e8f0' },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { labels: { color: '#e2e8f0' } }
      }
    }
  });
}

window.addEventListener('DOMContentLoaded', () => findBtn.click());
