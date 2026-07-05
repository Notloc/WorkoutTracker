// ---------- Plan ----------
const PLAN_KEY = "wt_plan_v1";

const FORMAT_EXAMPLE = {
  name: "My Plan",
  scheduleNote: "Mon / Wed / Fri, 48h rest between sessions.",
  warmup: ["5 min easy cardio", "Ramp into first compound: light x10 → ~50% x5 → ~75% x3 → working sets"],
  progressionRule: ["All sets hit top of rep range, clean form → add weight.", "Miss bottom twice in a row → drop weight ~10%."],
  deloadNote: "Every 4th week: same exercises at ~50% weight.",
  watchList: ["Anything you want flagged in Settings goes here."],
  exerciseNotes: { "Goblet Squat": "Dumbbell held vertically at chest." },
  days: [
    {
      label: "Day A",
      exercises: [
        { id: "a1", name: "Goblet Squat", sets: 3, repLow: 6, repHigh: 8, rest: 120, type: "weight", compound: true, note: "" },
      ],
    },
  ],
};

function loadPlan() {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return validatePlan(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

function savePlan() {
  if (plan) localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  else localStorage.removeItem(PLAN_KEY);
}

function validatePlan(p) {
  return !!(
    p &&
    Array.isArray(p.days) &&
    p.days.length > 0 &&
    p.days.every(
      (d) =>
        d &&
        typeof d.label === "string" &&
        Array.isArray(d.exercises) &&
        d.exercises.length > 0 &&
        d.exercises.every(
          (ex) =>
            ex &&
            typeof ex.id === "string" &&
            typeof ex.name === "string" &&
            typeof ex.sets === "number" &&
            typeof ex.repLow === "number" &&
            typeof ex.repHigh === "number"
        )
    )
  );
}

let plan = loadPlan();

// ---------- State ----------
const STORAGE_KEY = "wt_state_v1";

function defaultState() {
  return {
    unit: "kg",
    increment: 2.5,
    lastDayIndex: -1,
    exerciseState: {}, // id -> { nextWeight, missStreak, lastActualWeight }
    sessions: [], // newest first
  };
}

let state = loadState();
let activeTab = "today";
let deloadOverride = null; // null = auto, true/false = user forced

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed);
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- In-progress workout draft (autosave) ----------
// Persists whatever's typed into the Today tab so it survives the page
// being reloaded or the app process being killed mid-workout, before
// "Finish Session" ever runs.
const DRAFT_KEY = "wt_draft_v1";

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed.dayIndex === "number") ? parsed : null;
  } catch (e) {
    return null;
  }
}

function saveDraft() {
  if (!plan || activeTab !== "today") return;
  const dayIndex = nextDayIndex();
  const day = plan.days[dayIndex];
  const weights = {};
  const sets = {};
  day.exercises.forEach(ex => {
    const weightInput = document.getElementById(`w_${ex.id}`);
    if (weightInput) weights[ex.id] = weightInput.value;
    const setInputs = Array.from(document.querySelectorAll(`.set-input[data-ex="${ex.id}"]`));
    sets[ex.id] = setInputs.map(inp => inp.value);
  });
  draft = { dayIndex, date: todayISO(), deloadOverride, weights, sets };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function clearDraft() {
  draft = null;
  localStorage.removeItem(DRAFT_KEY);
}

function restoreDraftIntoToday() {
  if (!draft || draft.dayIndex !== nextDayIndex()) return;
  Object.entries(draft.weights || {}).forEach(([exId, val]) => {
    if (!val) return;
    const input = document.getElementById(`w_${exId}`);
    if (input) input.value = val;
  });
  Object.entries(draft.sets || {}).forEach(([exId, vals]) => {
    (vals || []).forEach((val, i) => {
      if (!val) return;
      const input = document.querySelector(`.set-input[data-ex="${exId}"][data-set="${i}"]`);
      if (input) {
        input.value = val;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  });
}

let draft = loadDraft();
if (plan && draft && draft.dayIndex === nextDayIndex() && typeof draft.deloadOverride === "boolean") {
  deloadOverride = draft.deloadOverride;
}

// ---------- Helpers ----------
function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function formatDateNice(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function isLastWeekOfMonth(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return d > lastDay - 7;
}

function nextDayIndex() {
  if (!plan || plan.days.length === 0) return 0;
  return (state.lastDayIndex + 1) % plan.days.length;
}

function roundToIncrement(value) {
  const inc = Number(state.increment) || 2.5;
  return Math.round(value / inc) * inc;
}

function fmtNum(n) {
  return Math.round(n * 100) / 100;
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) { /* audio not available */ }
}

// ---------- Rest timer ----------
// Driven by a target timestamp (restEndAt) rather than a decrementing counter,
// so the displayed time stays correct even if the interval is throttled or
// suspended while the app is backgrounded.
const restEl = document.getElementById("restTimer");
const restClockEl = document.getElementById("restClock");
const restLabelEl = document.getElementById("restLabel");
let restInterval = null;
let restEndAt = 0;

function startRest(seconds, label) {
  clearInterval(restInterval);
  restEndAt = Date.now() + seconds * 1000;
  restLabelEl.textContent = label || "Rest";
  updateRestClock();
  restEl.classList.remove("hidden");
  restInterval = setInterval(tickRest, 250);
}

function tickRest() {
  const remaining = Math.round((restEndAt - Date.now()) / 1000);
  if (remaining <= 0) {
    clearInterval(restInterval);
    restEndAt = Date.now();
    updateRestClock();
    vibrate([200, 100, 200]);
    beep();
    setTimeout(() => restEl.classList.add("hidden"), 1500);
    return;
  }
  updateRestClock();
}

function updateRestClock() {
  const remaining = Math.max(0, Math.round((restEndAt - Date.now()) / 1000));
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  restClockEl.textContent = mm + ":" + String(ss).padStart(2, "0");
}

document.getElementById("restAddBtn").addEventListener("click", () => { restEndAt += 15000; updateRestClock(); });
document.getElementById("restSkipBtn").addEventListener("click", () => {
  clearInterval(restInterval);
  restEl.classList.add("hidden");
});

// ---------- Hold timer (for time-based exercises like planks) ----------
// Driven by timestamps (holdPhaseEndAt / holdStartAt) rather than a
// per-tick counter, so it stays accurate even if the interval is throttled
// or suspended while the app is backgrounded.
const holdEl = document.getElementById("holdTimer");
const holdClockEl = document.getElementById("holdClock");
const holdLabelEl = document.getElementById("holdLabel");
const holdStopBtn = document.getElementById("holdStopBtn");
const holdGoalBtn = document.getElementById("holdGoalBtn");
let holdInterval = null;
let holdPhase = null; // "countdown" | "running"
let holdPhaseEndAt = 0; // countdown target timestamp
let holdStartAt = 0; // running phase start timestamp
let holdCountdown = 3; // last displayed countdown value
let holdElapsed = 0; // last displayed elapsed seconds
let holdTargetEx = null;
let holdTargetSet = null;
let holdTargetHigh = null;
let holdPastTarget = false;

function startHoldTimer(exId, setIndex, label, targetHigh) {
  clearInterval(holdInterval);
  holdTargetEx = exId;
  holdTargetSet = setIndex;
  holdTargetHigh = targetHigh;
  holdPhase = "countdown";
  holdPhaseEndAt = Date.now() + 3000;
  holdCountdown = 3;
  holdPastTarget = false;
  holdLabelEl.textContent = label;
  holdClockEl.textContent = String(holdCountdown);
  holdStopBtn.textContent = "Cancel";
  holdGoalBtn.classList.add("hidden");
  holdEl.classList.remove("hidden");
  vibrate(60);
  holdInterval = setInterval(tickHold, 200);
}

function tickHold() {
  const now = Date.now();
  if (holdPhase === "countdown") {
    const remaining = Math.ceil((holdPhaseEndAt - now) / 1000);
    if (remaining <= 0) {
      holdPhase = "running";
      holdStartAt = now;
      holdElapsed = 0;
      holdClockEl.textContent = "0s";
      holdStopBtn.textContent = "Stop & Log";
      vibrate(120);
    } else if (remaining !== holdCountdown) {
      holdCountdown = remaining;
      holdClockEl.textContent = String(holdCountdown);
      vibrate(60);
    }
  } else {
    const elapsed = Math.floor((now - holdStartAt) / 1000);
    if (elapsed !== holdElapsed) {
      holdElapsed = elapsed;
      holdClockEl.textContent = holdElapsed + "s";
      if (!holdPastTarget && holdTargetHigh && holdElapsed >= holdTargetHigh) {
        holdPastTarget = true;
        vibrate([60, 60, 60]);
        holdStopBtn.textContent = "Log Full";
        holdGoalBtn.textContent = `Log ${holdTargetHigh}`;
        holdGoalBtn.classList.remove("hidden");
      }
    }
  }
}

function logHoldValue(value) {
  clearInterval(holdInterval);
  holdEl.classList.add("hidden");
  const input = document.querySelector(`.set-input[data-ex="${holdTargetEx}"][data-set="${holdTargetSet}"]`);
  if (input) {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  holdPhase = null;
}

function stopHoldTimer() {
  if (holdPhase === "running") {
    logHoldValue(holdElapsed);
  } else {
    clearInterval(holdInterval);
    holdEl.classList.add("hidden");
    holdPhase = null;
  }
}

holdStopBtn.addEventListener("click", stopHoldTimer);
holdGoalBtn.addEventListener("click", () => logHoldValue(holdTargetHigh));

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (restInterval) tickRest();
  if (holdInterval) tickHold();
});

// ---------- Rendering ----------
const appEl = document.getElementById("app");
const tabbarEl = document.getElementById("tabbar");

function render() {
  if (!plan) {
    tabbarEl.style.display = "none";
    appEl.innerHTML = renderOnboarding();
    attachOnboardingHandlers();
    return;
  }
  tabbarEl.style.display = "";
  if (activeTab === "today") appEl.innerHTML = renderToday();
  else if (activeTab === "history") appEl.innerHTML = renderHistory();
  else appEl.innerHTML = renderSettings();
  attachHandlers();
  if (activeTab === "today") restoreDraftIntoToday();
}

function unitLabel() { return state.unit; }

function renderOnboarding() {
  return `
    <div class="page-header"><h1>Lift Log</h1></div>
    <div class="card">
      <h3>Load a plan to get started</h3>
      <p>This app doesn't come with a workout plan built in — you bring your own as a JSON file. Import one below, or load the sample to see how it works.</p>
      <label class="btn secondary" style="display:block;text-align:center;margin-bottom:8px;cursor:pointer;">
        Choose plan file&hellip;
        <input type="file" accept="application/json,.json" id="planFileInput" style="display:none;" />
      </label>
      <textarea class="data-box" id="planPasteBox" placeholder="...or paste plan JSON here"></textarea>
      <button class="btn secondary" id="planPasteBtn" type="button" style="margin-top:8px;margin-bottom:8px;">Import pasted JSON</button>
      <button class="btn" id="loadSampleBtn" type="button">Load sample plan</button>
    </div>
    <details class="card">
      <summary>Plan file format</summary>
      <p>A plan is a JSON file shaped roughly like this:</p>
      <pre style="white-space:pre-wrap;font-size:11px;color:var(--text-dim);background:var(--bg-elev-2);padding:10px;border-radius:8px;overflow-x:auto;">${JSON.stringify(FORMAT_EXAMPLE, null, 2)}</pre>
      <p>Only <code>days</code> is required (each with a <code>label</code> and at least one exercise). Exercise <code>type</code> is <code>weight</code> (default), <code>time</code> (bodyweight, log seconds), or <code>carry</code> (loaded, log distance). <code>id</code> must be unique and stable — it's how the app tracks progression across sessions. See <code>sample-plan.json</code> in the repo for a full example.</p>
    </details>
  `;
}

function renderToday() {
  const dayIndex = nextDayIndex();
  const day = plan.days[dayIndex];
  const iso = todayISO();
  const autoDeload = isLastWeekOfMonth(iso);
  const deload = deloadOverride === null ? autoDeload : deloadOverride;

  const warmupHtml = (plan.warmup && plan.warmup.length) ? `
    <details class="card">
      <summary>Warm-up</summary>
      <ul>${plan.warmup.map(w => `<li>${w}</li>`).join("")}</ul>
    </details>` : "";

  const deloadHtml = `
    <div class="deload-toggle">
      <div>
        <strong>Deload week</strong>
        <small>${autoDeload ? "Last week of the month — deload suggested." : "Working weight, ~50% off on deload."}</small>
      </div>
      <label class="switch">
        <input type="checkbox" id="deloadToggle" ${deload ? "checked" : ""} />
        <span class="track"><span class="thumb"></span></span>
      </label>
    </div>`;

  const exercisesHtml = day.exercises.map(ex => renderExerciseCard(ex, deload)).join("");

  return `
    <div class="page-header">
      <h1>${day.label}</h1>
      <span class="date">${formatDateNice(iso)}</span>
    </div>
    ${warmupHtml}
    ${deloadHtml}
    <div id="exerciseList">${exercisesHtml}</div>
    <div class="finish-bar">
      <button class="btn" id="finishBtn" type="button">Finish Session</button>
    </div>
  `;
}

function renderExerciseCard(ex, deload) {
  const st = state.exerciseState[ex.id] || { nextWeight: null, missStreak: 0 };
  let suggested = st.nextWeight;
  if (suggested != null && deload) suggested = roundToIncrement(suggested * 0.5);

  const exerciseNotes = plan.exerciseNotes || {};
  const noteExtra = exerciseNotes[ex.name] ? `<div class="ex-note">${exerciseNotes[ex.name]}</div>` : "";
  const watchExtra = ex.watch ? `<div class="ex-watch">${ex.watchNote || "Recurring discomfort here → get it looked at. Not a programming fix."}</div>` : "";

  const isTime = ex.type === "time";
  const showWeight = ex.type === "weight" || ex.type === "carry" || !ex.type;

  const weightRow = showWeight ? `
    <div class="weight-row">
      <label for="w_${ex.id}">Weight</label>
      <input class="weight-input" type="number" inputmode="decimal" step="0.5" id="w_${ex.id}"
        placeholder="${suggested != null ? suggested : "start weight"}"
        value="${suggested != null ? suggested : ""}" data-ex="${ex.id}" />
      <span class="unit-label">${unitLabel()}</span>
      ${suggested != null ? `<span class="suggested-pill">sugg. ${fmtNum(suggested)}${unitLabel()}</span>` : ""}
    </div>` : "";

  const perLeg = ex.perLeg ? " /leg" : "";
  const targetLabel = isTime ? `${ex.repLow}-${ex.repHigh}s` : ex.type === "carry" ? `${ex.repHigh}m` : `${ex.repLow}-${ex.repHigh}${perLeg}`;

  const setCells = Array.from({ length: ex.sets }).map((_, i) => {
    const def = ex.repHigh;
    const timerBtn = isTime ? `
        <button class="set-timer-btn" type="button" data-ex="${ex.id}" data-set="${i}" data-high="${ex.repHigh}"
          data-label="${ex.name} · Set ${i + 1}">⏱ Time it</button>` : "";
    return `
      <div class="set-cell">
        <label>Set ${i + 1}</label>
        <input class="set-input" type="number" inputmode="numeric" data-ex="${ex.id}" data-set="${i}"
          data-low="${ex.repLow}" data-high="${ex.repHigh}"
          placeholder="${def}" />
        ${timerBtn}
      </div>`;
  }).join("");

  return `
    <div class="card exercise-card" data-exid="${ex.id}">
      <div class="ex-name-row">
        <span class="ex-name">${ex.name}</span>
        <span class="ex-target">${ex.sets}×${targetLabel}</span>
      </div>
      ${ex.note ? `<div class="ex-note">${ex.note}</div>` : ""}
      ${noteExtra}
      ${watchExtra}
      ${weightRow}
      <div class="sets-row">${setCells}</div>
      <div class="ex-footer">
        <button class="rest-chip" type="button" data-rest="${ex.rest}" data-restlabel="${ex.name}">⏱ Rest ${ex.rest}s</button>
        <span class="result-tag" id="tag_${ex.id}"></span>
      </div>
    </div>
  `;
}

function renderHistory() {
  if (state.sessions.length === 0) {
    return `
      <div class="page-header"><h1>History</h1></div>
      <div class="empty-state">No sessions logged yet.<br/>Finish a workout on the Today tab and it'll show up here.</div>
    `;
  }
  const items = state.sessions.map((s, idx) => {
    const rows = s.exercises.map(e => {
      const setsStr = e.sets.map(v => v).join(", ");
      return `
        <div class="row">
          <span class="ex-detail-name">${e.name}</span>
          <span class="ex-detail-sets">${e.weight != null ? fmtNum(e.weight) + s.unit + " × " : ""}${setsStr}</span>
        </div>`;
    }).join("");
    return `
      <details class="session-item">
        <summary>
          <span class="session-title">${s.dayLabel}${s.deload ? '<span class="badge-deload">DELOAD</span>' : ""}</span>
          <span class="session-sub">${formatDateNice(s.date)}</span>
        </summary>
        <div class="session-detail">
          ${rows}
          <button class="btn danger" style="margin-top:10px;padding:8px;font-size:13px;" data-delete-session="${idx}" type="button">Delete session</button>
        </div>
      </details>`;
  }).join("");
  return `
    <div class="page-header"><h1>History</h1><span class="date">${state.sessions.length} sessions</span></div>
    ${items}
  `;
}

function renderSettings() {
  const dayCount = plan.days.length;
  return `
    <div class="page-header"><h1>Plan &amp; Settings</h1></div>

    <div class="card settings-group">
      <h3>${plan.name || "Untitled plan"}</h3>
      <p style="color:var(--text-dim);font-size:13px;margin:0 0 10px;">${dayCount} day${dayCount === 1 ? "" : "s"} in rotation.</p>
      <button class="btn secondary" id="exportPlanBtn" type="button" style="margin-bottom:8px;">Export current plan</button>
      <button class="btn danger" id="replacePlanBtn" type="button">Replace plan</button>
    </div>

    <div class="card settings-group">
      <div class="settings-row">
        <label>Units</label>
        <div class="seg" id="unitSeg">
          <button type="button" data-unit="kg" class="${state.unit === "kg" ? "active" : ""}">kg</button>
          <button type="button" data-unit="lb" class="${state.unit === "lb" ? "active" : ""}">lb</button>
        </div>
      </div>
      <div class="settings-row">
        <label>Weight increment</label>
        <input type="number" id="incrementInput" step="0.5" min="0.5" value="${state.increment}" />
      </div>
    </div>

    ${plan.progressionRule && plan.progressionRule.length ? `
    <details class="card">
      <summary>Progression rule</summary>
      <ul>${plan.progressionRule.map(x => `<li>${x}</li>`).join("")}</ul>
    </details>` : ""}

    ${(plan.deloadNote || plan.scheduleNote || plan.cardioNote) ? `
    <details class="card">
      <summary>Deload &amp; schedule</summary>
      ${plan.deloadNote ? `<p>${plan.deloadNote}</p>` : ""}
      ${plan.scheduleNote ? `<p>${plan.scheduleNote}</p>` : ""}
      ${plan.cardioNote ? `<p>${plan.cardioNote}</p>` : ""}
    </details>` : ""}

    ${plan.watchList && plan.watchList.length ? `
    <details class="card">
      <summary>Watch list</summary>
      <ul>${plan.watchList.map(x => `<li>${x}</li>`).join("")}</ul>
    </details>` : ""}

    ${plan.exerciseNotes && Object.keys(plan.exerciseNotes).length ? `
    <details class="card">
      <summary>Exercise cues</summary>
      <ul>${Object.entries(plan.exerciseNotes).map(([k, v]) => `<li><strong>${k}</strong> — ${v}</li>`).join("")}</ul>
    </details>` : ""}

    <div class="card settings-group">
      <h3>Data</h3>
      <p style="color:var(--text-dim);font-size:13px;margin:0 0 10px;">Everything is stored on this device only.</p>
      <button class="btn secondary" id="exportBtn" type="button" style="margin-bottom:8px;">Export data</button>
      <textarea class="data-box" id="importBox" placeholder="Paste exported JSON here to restore..."></textarea>
      <button class="btn secondary" id="importBtn" type="button" style="margin-top:8px;margin-bottom:8px;">Import data</button>
      <button class="btn danger" id="resetBtn" type="button">Reset all data</button>
    </div>
  `;
}

// ---------- Progression logic ----------
function evaluateSet(actual, low, high) {
  if (actual == null || actual === "") return null;
  const v = Number(actual);
  if (v >= high) return "top";
  if (v < low) return "miss";
  return "partial";
}

function finishSession() {
  const dayIndex = nextDayIndex();
  const day = plan.days[dayIndex];
  const iso = todayISO();
  const deload = deloadOverride === null ? isLastWeekOfMonth(iso) : deloadOverride;

  const loggedExercises = [];

  day.exercises.forEach(ex => {
    const weightInput = document.getElementById(`w_${ex.id}`);
    const weightVal = weightInput ? weightInput.value : "";
    const setInputs = Array.from(document.querySelectorAll(`.set-input[data-ex="${ex.id}"]`));
    const setVals = setInputs.map(inp => inp.value);
    const anyEntered = (weightVal !== "" && weightVal != null) || setVals.some(v => v !== "" && v != null);
    if (!anyEntered) return;

    const results = setVals.map(v => evaluateSet(v === "" ? null : v, ex.repLow, ex.repHigh));
    const enteredResults = results.filter(r => r !== null);
    const allTop = enteredResults.length > 0 && enteredResults.every(r => r === "top");
    const missedBottom = enteredResults.some(r => r === "miss");

    const weightNum = weightVal !== "" ? Number(weightVal) : null;

    loggedExercises.push({
      id: ex.id,
      name: ex.name,
      weight: weightNum,
      sets: setVals.map((v, i) => v === "" ? ex.repHigh : Number(v)),
    });

    if (!deload && weightNum != null) {
      const prevState = state.exerciseState[ex.id] || { nextWeight: null, missStreak: 0 };
      let nextWeight = weightNum;
      let missStreak = prevState.missStreak || 0;

      if (allTop) {
        nextWeight = roundToIncrement(weightNum + Number(state.increment));
        missStreak = 0;
      } else if (missedBottom) {
        missStreak += 1;
        if (missStreak >= 2) {
          nextWeight = roundToIncrement(weightNum * 0.9);
          missStreak = 0;
        } else {
          nextWeight = weightNum;
        }
      } else {
        nextWeight = weightNum;
        missStreak = 0;
      }

      state.exerciseState[ex.id] = { nextWeight, missStreak, lastActualWeight: weightNum };
    }
  });

  if (loggedExercises.length === 0) {
    alert("Log at least one exercise before finishing.");
    return;
  }

  state.sessions.unshift({
    date: iso,
    dayIndex,
    dayLabel: day.label,
    deload,
    unit: state.unit,
    exercises: loggedExercises,
  });
  state.lastDayIndex = dayIndex;
  deloadOverride = null;
  clearDraft();
  saveState();
  render();
}

// ---------- Event handling ----------
function attachOnboardingHandlers() {
  const fileInput = document.getElementById("planFileInput");
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => tryImportPlan(reader.result);
      reader.readAsText(file);
    });
  }

  const pasteBtn = document.getElementById("planPasteBtn");
  if (pasteBtn) {
    pasteBtn.addEventListener("click", () => {
      const box = document.getElementById("planPasteBox");
      tryImportPlan(box.value);
    });
  }

  const sampleBtn = document.getElementById("loadSampleBtn");
  if (sampleBtn) {
    sampleBtn.addEventListener("click", () => {
      fetch("sample-plan.json")
        .then(r => r.json())
        .then(p => {
          plan = p;
          savePlan();
          clearDraft();
          activeTab = "today";
          render();
        })
        .catch(() => alert("Couldn't load the sample plan."));
    });
  }
}

function tryImportPlan(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    alert("That doesn't look like valid JSON.");
    return;
  }
  if (!validatePlan(parsed)) {
    alert('That JSON isn\'t shaped like a plan — it needs a "days" array, each with a label and at least one exercise.');
    return;
  }
  plan = parsed;
  savePlan();
  clearDraft();
  activeTab = "today";
  render();
}

function attachHandlers() {
  document.querySelectorAll(".set-input").forEach(inp => {
    inp.addEventListener("input", () => {
      const low = Number(inp.dataset.low);
      const high = Number(inp.dataset.high);
      inp.classList.remove("hit", "miss");
      if (inp.value !== "") {
        const v = Number(inp.value);
        if (v >= high) inp.classList.add("hit");
        else if (v < low) inp.classList.add("miss");
      }
      saveDraft();
    });
  });

  document.querySelectorAll(".weight-input").forEach(inp => {
    inp.addEventListener("input", saveDraft);
  });

  document.querySelectorAll("[data-rest]").forEach(btn => {
    btn.addEventListener("click", () => {
      startRest(Number(btn.dataset.rest), btn.dataset.restlabel);
    });
  });

  document.querySelectorAll(".set-timer-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      startHoldTimer(btn.dataset.ex, Number(btn.dataset.set), btn.dataset.label, Number(btn.dataset.high));
    });
  });

  const deloadToggle = document.getElementById("deloadToggle");
  if (deloadToggle) {
    deloadToggle.addEventListener("change", () => {
      deloadOverride = deloadToggle.checked;
      saveDraft();
      render();
    });
  }

  const finishBtn = document.getElementById("finishBtn");
  if (finishBtn) finishBtn.addEventListener("click", finishSession);

  document.querySelectorAll("[data-delete-session]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const idx = Number(btn.dataset.deleteSession);
      if (confirm("Delete this session from history?")) {
        state.sessions.splice(idx, 1);
        saveState();
        render();
      }
    });
  });

  const unitSeg = document.getElementById("unitSeg");
  if (unitSeg) {
    unitSeg.querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => {
        state.unit = b.dataset.unit;
        saveState();
        render();
      });
    });
  }

  const incrementInput = document.getElementById("incrementInput");
  if (incrementInput) {
    incrementInput.addEventListener("change", () => {
      state.increment = Number(incrementInput.value) || 2.5;
      saveState();
    });
  }

  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const data = JSON.stringify(state, null, 2);
      const box = document.getElementById("importBox");
      box.value = data;
      box.select();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(data).then(() => alert("Copied to clipboard.")).catch(() => {});
      }
    });
  }

  const importBtn = document.getElementById("importBtn");
  if (importBtn) {
    importBtn.addEventListener("click", () => {
      const box = document.getElementById("importBox");
      try {
        const parsed = JSON.parse(box.value);
        state = Object.assign(defaultState(), parsed);
        saveState();
        alert("Data imported.");
        render();
      } catch (e) {
        alert("That doesn't look like valid exported data.");
      }
    });
  }

  const resetBtn = document.getElementById("resetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (confirm("This deletes all logged sessions and progression data on this device. Continue?")) {
        state = defaultState();
        clearDraft();
        saveState();
        render();
      }
    });
  }

  const exportPlanBtn = document.getElementById("exportPlanBtn");
  if (exportPlanBtn) {
    exportPlanBtn.addEventListener("click", () => {
      const data = JSON.stringify(plan, null, 2);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(data).then(() => alert("Plan JSON copied to clipboard.")).catch(() => prompt("Copy your plan JSON:", data));
      } else {
        prompt("Copy your plan JSON:", data);
      }
    });
  }

  const replacePlanBtn = document.getElementById("replacePlanBtn");
  if (replacePlanBtn) {
    replacePlanBtn.addEventListener("click", () => {
      if (confirm("Replace the current plan? Your logged history stays, but progression suggestions reset for any exercises not in the new plan.")) {
        plan = null;
        savePlan();
        render();
      }
    });
  }
}

document.getElementById("tabbar").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  activeTab = btn.dataset.tab;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b === btn));
  render();
});

render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
