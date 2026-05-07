/**
 * SignSense — script.js
 * Real-time sign language recognition using MediaPipe + TensorFlow.js
 */

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const ALPHA_CLASSES  = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const DIGITS_CLASSES = ["0","1","2","3","4","5","6","7","8","9"];

const CONF_THRESHOLD    = 0.70;
const COOLDOWN_FRAMES   = 30;   // hold-to-confirm duration (~1s at 30fps)

const LANDMARK_COUNT    = 21;
const COORDS_PER_LM     = 3;    // x, y, z
const HAND_FEATURE_SIZE = LANDMARK_COUNT * COORDS_PER_LM; // 63

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let handLandmarker   = null;
let alphaModel       = null;
let digitsModel      = null;
let modelsLoaded     = { mp: false, alpha: false, digits: false };
let demoMode         = false;

let currentMode      = "alpha"; // "alpha" | "digits"
let lastAlphaLetter  = null;
let alphaConfirmCount = 0;
let lastAccepted     = null;    // prevent same sign repeating
let totalRecognized  = 0;
let cameraPaused     = false;

let webcamStream     = null;
let animFrameId      = null;
let lastTimestamp    = 0;
let fpsBuffer        = [];
let flipped          = false;

// ─────────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────────
const $ = id => document.getElementById(id);

const video          = $("webcam");
const canvas         = $("overlay-canvas");
const ctx            = canvas.getContext("2d");
const loaderOverlay  = $("loader-overlay");
const modalNoModel   = $("modal-no-model");

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", init);

async function init() {
  buildLetterGrid();
  bindUI();
  await loadAll();
}

// ─────────────────────────────────────────────
// LOADING SEQUENCE
// ─────────────────────────────────────────────
async function loadAll() {
  setStep("mp", "loading");
  setProgress(5);

  // Wait for MediaPipe ESM to be ready
  await waitForMP();

  try {
    const { FilesetResolver, HandLandmarker } = window._mpImport;
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 2
    });
    setStep("mp", "done");
    modelsLoaded.mp = true;
  } catch (e) {
    console.warn("MediaPipe load error:", e);
    setStep("mp", "error");
  }
  setProgress(25);

  // Alpha model
  setStep("alpha", "loading");
  try {
    alphaModel = await tf.loadLayersModel("models/alpha_model/model.json");
    const dummy = tf.zeros([1, HAND_FEATURE_SIZE]);
    alphaModel.predict(dummy).dispose();
    dummy.dispose();
    setStep("alpha", "done");
    modelsLoaded.alpha = true;
  } catch (e) {
    console.warn("Alpha model not found, demo mode:", e);
    setStep("alpha", "error");
    demoMode = true;
  }
  setProgress(50);

  // Digits model
  setStep("digits", "loading");
  try {
    digitsModel = await tf.loadLayersModel("models/numbers_model/model.json");
    const dummy2 = tf.zeros([1, HAND_FEATURE_SIZE]);
    digitsModel.predict(dummy2).dispose();
    dummy2.dispose();
    setStep("digits", "done");
    modelsLoaded.digits = true;
  } catch (e) {
    console.warn("Digits model not found, demo mode:", e);
    setStep("digits", "error");
    demoMode = true;
  }
  setProgress(75);

  if (demoMode) showModal();

  // Camera
  setStep("cam", "loading");
  await startCamera();
  setStep("cam", "done");
  setProgress(100);

  // Dismiss loader after 0.75s delay (let aura animation be visible)
  setTimeout(() => {
    loaderOverlay.style.opacity = "0";
    loaderOverlay.style.transition = "opacity .5s";
    setTimeout(() => loaderOverlay.classList.add("hidden"), 500);
    updateStatusReady();
  }, 750);
}

function waitForMP() {
  return new Promise(resolve => {
    const check = () => window._mpImport ? resolve() : setTimeout(check, 100);
    check();
  });
}

const STEP_LABELS = { mp:'Loading MediaPipe…', alpha:'Loading Alphabet Model…', digits:'Loading Numbers Model…', cam:'Starting Camera…' };
function setStep(id, state) {
  $(`dot-${id}`).className = `step-dot ${state}`;
  const sub = $("loader-sub-text");
  if (sub && state === 'loading') sub.textContent = STEP_LABELS[id] || 'Loading…';
  if (sub && state === 'done' && id === 'cam') sub.textContent = 'All systems ready!';
}

function setProgress(pct) {
  $("loader-fill").style.width = pct + "%";

  // Drive SVG circular ring
  const CIRC = 427.3;
  const offset = CIRC - (pct / 100) * CIRC;
  const ring = $("ring-fill"), glow = $("ring-glow"), pctEl = $("loader-pct");
  const sparkle = $("ring-sparkle"), aura = $("ring-aura");

  if (ring)  ring.style.strokeDashoffset  = offset;
  if (glow)  glow.style.strokeDashoffset  = offset;
  if (pctEl) pctEl.textContent = Math.round(pct) + "%";

  // Move sparkle dot to leading edge of arc
  if (sparkle) {
    if (pct > 0 && pct < 100) {
      sparkle.classList.add('active');
      const angle = (pct / 100) * 2 * Math.PI - Math.PI / 2; // starts at top
      const cx = 80 + 68 * Math.cos(angle);
      const cy = 80 + 68 * Math.sin(angle);
      sparkle.setAttribute('cx', cx);
      sparkle.setAttribute('cy', cy);
    } else if (pct >= 100) {
      sparkle.classList.remove('active');
    }
  }

  // Aura appears when fully loaded
  if (aura && pct >= 100) {
    aura.classList.add('active');
  }
}

function showModal() {
  setTimeout(() => modalNoModel.classList.remove("hidden"), 1200);
}

function updateStatusReady() {
  $("status-dot").className = "status-dot ready";
  $("status-text").textContent = demoMode ? "Demo Mode" : "Ready";
}

// ─────────────────────────────────────────────
// CAMERA
// ─────────────────────────────────────────────
async function startCamera() {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false
    });
    video.srcObject = webcamStream;
    await new Promise(r => video.onloadedmetadata = r);
    video.play();
    $("camera-placeholder").classList.add("hidden");
    video.style.display = "block";
    startLoop();
  } catch (e) {
    console.error("Camera error:", e);
    $("camera-placeholder").querySelector("p").textContent = "Camera access denied.";
  }
}

function startLoop() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  const loop = (ts) => {
    processFrame(ts);
    animFrameId = requestAnimationFrame(loop);
  };
  animFrameId = requestAnimationFrame(loop);
}

// ─────────────────────────────────────────────
// MAIN INFERENCE LOOP
// ─────────────────────────────────────────────
function processFrame(timestamp) {
  if (!video.videoWidth || cameraPaused) return;

  // FPS
  if (lastTimestamp) {
    const dt = timestamp - lastTimestamp;
    fpsBuffer.push(1000 / dt);
    if (fpsBuffer.length > 30) fpsBuffer.shift();
    $("stat-fps-val").textContent = Math.round(avg(fpsBuffer));
  }
  lastTimestamp = timestamp;

  // Sync canvas
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;

  if (!handLandmarker || !modelsLoaded.mp) {
    if (demoMode) runDemoMode(timestamp);
    return;
  }

  // MediaPipe inference
  const results = handLandmarker.detectForVideo(video, timestamp);
  const hands   = results.landmarks || [];

  $("stat-hands-val").textContent = hands.length;

  drawLandmarks(hands, results.handednesses || []);

  if (hands.length === 0) {
    setPredBadge("—", 0);
    // Hand removed — reset progress bar and allow re-detection
    lastAccepted = null;
    lastAlphaLetter = null;
    alphaConfirmCount = 0;
    $("cooldown-fill").style.width = "0%";
    $("cooldown-count").textContent = "Ready";
    return;
  }

  // Extract features (both hands, zero-padded if only 1)
  const features = extractFeatures(hands);

  if (currentMode === "alpha") {
    runSignMode(features, alphaModel, modelsLoaded.alpha, ALPHA_CLASSES);
  } else {
    runSignMode(features, digitsModel, modelsLoaded.digits, DIGITS_CLASSES);
  }
}

// ─────────────────────────────────────────────
// FEATURE EXTRACTION
// ─────────────────────────────────────────────
function extractFeatures(hands) {
  // Normalise each hand: subtract wrist, divide by max extent
  const flat = [];
  for (let h = 0; h < 2; h++) {
    if (h < hands.length) {
      const lms = hands[h];
      const wx = lms[0].x, wy = lms[0].y, wz = lms[0].z;
      const coords = lms.flatMap(l => [l.x - wx, l.y - wy, l.z - wz]);
      const maxVal = Math.max(...coords.map(Math.abs)) || 1;
      flat.push(...coords.map(v => v / maxVal));
    } else {
      flat.push(...new Array(HAND_FEATURE_SIZE).fill(0));
    }
  }
  return flat; // length = 126
}

// ─────────────────────────────────────────────
// UNIFIED SIGN MODE (single-frame MLP)
// Hold-to-confirm: bar fills while holding a sign steady,
// sign accepted only when bar reaches 100%.
// ─────────────────────────────────────────────
function runSignMode(features, model, isLoaded, classes) {
  if (!isLoaded) { if (demoMode) demoPredict(classes); return; }

  tf.tidy(() => {
    const singleHand = features.slice(0, HAND_FEATURE_SIZE);
    const input  = tf.tensor2d([singleHand], [1, HAND_FEATURE_SIZE]);
    const logits = model.predict(input);
    const probs  = logits.dataSync();
    handlePrediction(Array.from(probs), classes);
  });
}

function handlePrediction(probs, classes) {
  const top  = topK(probs, 3, classes);
  const best = top[0];

  setPredBadge(best.label, best.prob);
  $("stat-conf-val").textContent = pct(best.prob);
  highlightLetter(best.label);

  if (best.prob >= CONF_THRESHOLD) {
    if (best.label === lastAlphaLetter) {
      // Same sign — keep filling the bar
      alphaConfirmCount++;
    } else {
      // Different sign — restart the bar
      lastAlphaLetter = best.label;
      alphaConfirmCount = 1;
    }

    // Update the cooldown bar as a progress indicator (0% → 100%)
    const progress = Math.min(alphaConfirmCount / COOLDOWN_FRAMES, 1.0);
    $("cooldown-fill").style.width = (progress * 100) + "%";
    $("cooldown-count").textContent = progress < 1 ? `Hold steady...` : "Accepted!";

    // Accept sign when bar is full
    if (alphaConfirmCount >= COOLDOWN_FRAMES && best.label !== lastAccepted) {
      addLetterChar(best.label);
      totalRecognized++;
      $("stat-total-val").textContent = totalRecognized;
      lastAccepted = best.label;
      // Reset for next sign
      lastAlphaLetter = null;
      alphaConfirmCount = 0;
      $("cooldown-fill").style.width = "0%";
      $("cooldown-count").textContent = "Ready";
    }
  } else {
    // Confidence dropped — reset bar
    lastAlphaLetter = null;
    alphaConfirmCount = 0;
    $("cooldown-fill").style.width = "0%";
    $("cooldown-count").textContent = "Ready";
  }
}

// ─────────────────────────────────────────────
// DEMO MODE (simulated predictions)
// ─────────────────────────────────────────────
let _demoTick = 0;

function demoPredict(classes) {
  _demoTick++;
  if (_demoTick % 30 !== 0) return;
  const label = classes[Math.floor(Math.random() * classes.length)];
  const prob  = 0.75 + Math.random() * 0.22;
  const fakeProbs = classes.map(c => c === label ? prob : (1 - prob) / (classes.length - 1));
  handlePrediction(fakeProbs, classes);
}

function runDemoMode(ts) {
  _demoTick++;
  const hands = generateDemoHands(ts);
  drawLandmarks(hands, []);
  $("stat-hands-val").textContent = 1;
  const features = extractFeatures(hands);
  const classes = currentMode === "alpha" ? ALPHA_CLASSES : DIGITS_CLASSES;
  runSignMode(features, null, false, classes);
}

function generateDemoHands(ts) {
  const t = ts / 2000;
  const lms = Array.from({ length: 21 }, (_, i) => ({
    x: 0.5 + Math.sin(t + i * 0.3) * 0.15,
    y: 0.5 + Math.cos(t + i * 0.2) * 0.15,
    z: 0
  }));
  return [lms];
}

// ─────────────────────────────────────────────
// DRAWING
// ─────────────────────────────────────────────
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17]
];

function drawLandmarks(hands, handednesses) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  hands.forEach((lms, hi) => {
    const isRight = handednesses[hi]?.[0]?.categoryName === "Right";
    const clr     = isRight ? "#818cf8" : "#60a5fa";
    const glowClr = isRight ? "rgba(129,140,248,.35)" : "rgba(96,165,250,.35)";

    // Connections
    ctx.shadowColor = glowClr;
    ctx.shadowBlur  = 8;
    ctx.strokeStyle = clr;
    ctx.lineWidth   = 2;
    CONNECTIONS.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(lms[a].x * canvas.width, lms[a].y * canvas.height);
      ctx.lineTo(lms[b].x * canvas.width, lms[b].y * canvas.height);
      ctx.stroke();
    });

    // Joints
    ctx.shadowBlur = 0;
    lms.forEach((lm, i) => {
      const x = lm.x * canvas.width;
      const y = lm.y * canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, i === 0 ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? "#fff" : clr;
      ctx.fill();
    });
  });
}

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────
function setPredBadge(label, prob) {
  $("pred-letter").textContent = label;
  const p = Math.round(prob * 100);
  $("conf-fill").style.width = p + "%";
  $("conf-pct").textContent  = p + "%";
}

function addLetterChar(letter) {
  const ph = $("letter-placeholder");
  if (ph) ph.remove();
  const span = document.createElement("span");
  span.className = "letter-char";
  span.textContent = letter;
  $("letter-chars").appendChild(span);
  $("letter-buffer").scrollTop = 9999;
}

function highlightLetter(letter) {
  document.querySelectorAll(".letter-tile").forEach(t => {
    t.classList.toggle("active", t.dataset.letter === letter);
  });
}

function buildLetterGrid() {
  const grid = $("letter-grid");
  if (!grid) return;
  // Build for current mode
  rebuildGrid();
}

function rebuildGrid() {
  const grid = $("letter-grid");
  grid.innerHTML = "";
  const classes = currentMode === "alpha" ? ALPHA_CLASSES : DIGITS_CLASSES;
  classes.forEach(l => {
    const tile = document.createElement("div");
    tile.className = "letter-tile";
    tile.dataset.letter = l;
    tile.textContent = l;
    grid.appendChild(tile);
  });
}

// ─────────────────────────────────────────────
// MATH UTILS
// ─────────────────────────────────────────────
function topK(probs, k, classes) {
  return probs
    .map((p, i) => ({ label: classes[i] || `?${i}`, prob: p }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, k);
}

function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }

function pct(v) { return Math.round(v * 100) + "%"; }

// ─────────────────────────────────────────────
// MODE SWITCHING
// ─────────────────────────────────────────────
function switchMode(mode) {
  currentMode = mode;
  lastAlphaLetter = null;
  alphaConfirmCount = 0;
  lastAccepted = null;

  $("btn-mode-alpha").classList.toggle("active", mode === "alpha");
  $("btn-mode-digits").classList.toggle("active", mode === "digits");
  $("btn-mode-alpha").setAttribute("aria-selected", mode === "alpha");
  $("btn-mode-digits").setAttribute("aria-selected", mode === "digits");

  if (mode === "alpha") {
    $("mode-name").textContent  = "Alphabet A–Z Mode";
    $("mode-desc").textContent  = "Single frame → MLP → Letter classification";
    $("mode-badge").textContent = "MLP";
    $("grid-label").textContent = "ASL Alphabet Reference";
  } else {
    $("mode-name").textContent  = "Numbers 0–9 Mode";
    $("mode-desc").textContent  = "Single frame → MLP → Digit classification";
    $("mode-badge").textContent = "MLP";
    $("grid-label").textContent = "ASL Digits Reference";
  }

  rebuildGrid();
  $("cooldown-fill").style.width = "0%";
  $("cooldown-count").textContent = "Ready";
}

// ─────────────────────────────────────────────
// BIND UI EVENTS
// ─────────────────────────────────────────────
function bindUI() {
  // Mode toggle
  $("btn-mode-alpha").addEventListener("click", () => switchMode("alpha"));
  $("btn-mode-digits").addEventListener("click", () => switchMode("digits"));

  // Reset
  $("btn-reset-alpha").addEventListener("click", () => {
    $("letter-chars").innerHTML = "";
    $("alpha-sentence-tokens").innerHTML = "";
    lastAlphaLetter = null;
    alphaConfirmCount = 0;
    lastAccepted = null;
    totalRecognized = 0;
    $("stat-total-val").textContent = 0;
    $("cooldown-fill").style.width = "0%";
    $("cooldown-count").textContent = "Ready";
  });

  // Backspace
  $("btn-backspace-alpha").addEventListener("click", () => {
    const chars = $("letter-chars").children;
    if (chars.length) chars[chars.length - 1].remove();
  });

  // Space
  $("btn-space-alpha").addEventListener("click", () => {
    const span = document.createElement("span");
    span.className = "letter-char";
    span.style.background = "transparent";
    span.style.border = "1px dashed var(--border)";
    span.textContent = " ";
    $("letter-chars").appendChild(span);
  });

  // Commit word (letters → sentence)
  $("btn-commit-word").addEventListener("click", () => {
    const chars = Array.from($("letter-chars").children).map(c => c.textContent).join("");
    if (!chars.trim()) return;
    const ph = $("alpha-sentence-placeholder");
    if (ph) ph.remove();
    const tok = document.createElement("span");
    tok.className = "sentence-token";
    tok.textContent = chars.trim();
    $("alpha-sentence-tokens").appendChild(tok);
    $("letter-chars").innerHTML = "";
  });

  // Flip camera
  $("btn-flip").addEventListener("click", () => {
    flipped = !flipped;
    video.style.transform = flipped ? "scaleX(1)" : "scaleX(-1)";
  });

  // Camera stop/start
  $("btn-camera").addEventListener("click", () => {
    if (!webcamStream) return;
    cameraPaused = !cameraPaused;
    const tracks = webcamStream.getTracks();
    if (cameraPaused) {
      tracks.forEach(t => t.enabled = false);
      $("btn-camera").style.color = "var(--red)";
      $("btn-camera").title = "Start camera";
      $("status-dot").className = "status-dot";
      $("status-text").textContent = "Paused";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      tracks.forEach(t => t.enabled = true);
      $("btn-camera").style.color = "";
      $("btn-camera").title = "Stop camera";
      $("status-dot").className = "status-dot ready";
      $("status-text").textContent = demoMode ? "Demo Mode" : "Ready";
      lastAlphaLetter = null;
      alphaConfirmCount = 0;
    }
  });

  // Modal close
  $("btn-modal-close").addEventListener("click", () => {
    $("modal-no-model").classList.add("hidden");
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === " ") {
      e.preventDefault();
      $("btn-space-alpha").click();
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      $("btn-backspace-alpha").click();
    }
    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      switchMode(currentMode === "alpha" ? "digits" : "alpha");
    }
  });
}
