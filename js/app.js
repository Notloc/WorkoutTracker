// ---------- Library ----------
// Plans are an inventory: any number of imported plan JSONs, each kept as its
// own library entry. Nothing gets replaced on import anymore.
const LIBRARY_KEY = "wt_library_v1";

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

function genId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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

function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(e => e && e.id && validatePlan(e.plan)) : [];
  } catch (e) {
    return [];
  }
}

function saveLibrary() {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
}

function addPlanToLibrary(planObj) {
  const entry = { id: genId(), name: planObj.name || "Untitled plan", plan: planObj, addedAt: new Date().toISOString(), archived: false };
  library.push(entry);
  saveLibrary();
  return entry;
}

function findLibraryEntry(planId) {
  return library.find(e => e.id === planId) || null;
}

let library = loadLibrary();

// ---------- State ----------
const STORAGE_KEY = "wt_state_v2";

function defaultState() {
  return {
    unit: "kg",
    increment: 2.5,
    exerciseState: {}, // "planId:exerciseId" -> {nextWeight, missStreak, lastActualWeight}
    sessions: [], // newest first
    lastWorkout: null, // {planId, dayIndex} -- preselect convenience only, never auto-starts
  };
}

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

let state = loadState();
let activeTab = "workout";
let deloadOverride = null; // null = auto, true/false = user forced

// ---------- Active workout (draft: autosave + "what's currently active") ----------
// Persists whatever's typed into the workout screen so it survives the page
// being reloaded or the app process being killed mid-workout, before
// "Finish Session" ever runs. Its mere existence also means "there's an
// active workout" -- the Workout tab shows a plan/day picker when there's no
// draft, and the exercise-entry screen when there is one.
const DRAFT_KEY = "wt_draft_v1";

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed.dayIndex === "number" && typeof parsed.planId === "string") ? parsed : null;
  } catch (e) {
    return null;
  }
}

function startWorkout(planId, dayIndex) {
  draft = { planId, dayIndex, date: todayISO(), deloadOverride: null, weights: {}, sets: {}, editingSessionId: null };
  deloadOverride = null;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  render();
}

function saveDraft() {
  if (!draft || activeTab !== "workout") return;
  const entry = findLibraryEntry(draft.planId);
  const day = entry ? entry.plan.days[draft.dayIndex] : null;
  if (!day) return;
  const weights = {};
  const sets = {};
  day.exercises.forEach(ex => {
    const weightInput = document.getElementById(`w_${ex.id}`);
    if (weightInput) weights[ex.id] = weightInput.value;
    const setInputs = Array.from(document.querySelectorAll(`.set-input[data-ex="${ex.id}"]`));
    sets[ex.id] = setInputs.map(inp => inp.value);
  });
  draft.weights = weights;
  draft.sets = sets;
  draft.deloadOverride = deloadOverride;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function clearDraft() {
  draft = null;
  localStorage.removeItem(DRAFT_KEY);
}

function restoreDraftIntoWorkout() {
  if (!draft) return;
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
if (draft && typeof draft.deloadOverride === "boolean") {
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

function setActiveTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  render();
}

function render() {
  if (library.length === 0) {
    tabbarEl.style.display = "none";
    appEl.innerHTML = renderOnboarding();
    attachImportFormHandlers();
    return;
  }
  tabbarEl.style.display = "";
  if (activeTab === "workout") appEl.innerHTML = renderWorkoutTab();
  else if (activeTab === "library") appEl.innerHTML = renderLibraryTab();
  else if (activeTab === "history") appEl.innerHTML = renderHistory();
  else appEl.innerHTML = renderSettings();
  attachHandlers();
  if (activeTab === "workout" && draft) restoreDraftIntoWorkout();
}

function unitLabel() { return state.unit; }

function renderImportForm(heading, intro) {
  return `
    <div class="card">
      <h3>${heading}</h3>
      ${intro ? `<p>${intro}</p>` : ""}
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
      <p>Only <code>days</code> is required (each with a <code>label</code> and at least one exercise). Exercise <code>type</code> is <code>weight</code> (default), <code>time</code> (bodyweight, log seconds), or <code>carry</code> (loaded, log distance). <code>id</code> must be unique and stable within this plan — it's how the app tracks progression across sessions. See <code>sample-plan.json</code> in the repo for a full example.</p>
    </details>
  `;
}

function renderOnboarding() {
  return `
    <div class="page-header"><h1>Lift Log</h1></div>
    ${renderImportForm(
      "Load a plan to get started",
      "This app doesn't come with a workout plan built in — you bring your own as a JSON file. Import one below, or load the sample to see how it works."
    )}
  `;
}

function renderPicker() {
  const active = library.filter(e => !e.archived);
  if (active.length === 0) {
    return `
      <div class="page-header"><h1>Start a workout</h1></div>
      <div class="empty-state">No active plans.<br/>Add or restore one from the Library tab.</div>
    `;
  }
  const cardsHtml = active.map(entry => `
    <div class="card">
      <h3>${entry.name}</h3>
      <p style="color:var(--text-dim);font-size:13px;margin:0 0 10px;">${entry.plan.days.length} day${entry.plan.days.length === 1 ? "" : "s"}</p>
      <div class="day-pick-list">
        ${entry.plan.days.map((d, i) => {
          const isLast = state.lastWorkout && state.lastWorkout.planId === entry.id && state.lastWorkout.dayIndex === i;
          return `<button class="btn secondary day-pick-btn${isLast ? " active" : ""}" type="button" data-plan="${entry.id}" data-day="${i}" style="margin-bottom:8px;">${d.label}</button>`;
        }).join("")}
      </div>
    </div>
  `).join("");
  return `
    <div class="page-header"><h1>Start a workout</h1></div>
    ${cardsHtml}
  `;
}

function renderWorkoutTab() {
  if (!draft) return renderPicker();
  const entry = findLibraryEntry(draft.planId);
  const day = entry ? entry.plan.days[draft.dayIndex] : null;
  if (!entry || !day) {
    return `
      <div class="page-header"><h1>Workout</h1></div>
      <div class="empty-state">That workout's plan isn't available anymore.<br/>Pick something else below.</div>
      ${renderPicker()}
    `;
  }
  return renderActiveWorkout(entry, day);
}

function renderActiveWorkout(entry, day) {
  const iso = todayISO();
  const autoDeload = isLastWeekOfMonth(iso);
  const deload = deloadOverride === null ? autoDeload : deloadOverride;
  const isEditing = !!draft.editingSessionId;

  const warmupHtml = (entry.plan.warmup && entry.plan.warmup.length) ? `
    <details class="card">
      <summary>Warm-up</summary>
      <ul>${entry.plan.warmup.map(w => `<li>${w}</li>`).join("")}</ul>
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

  const editingBannerHtml = isEditing ? `
    <div class="card" style="border-color:var(--warn);">
      <strong style="color:var(--warn);">Editing a past session</strong>
      <p style="margin:6px 0 0;">Saving corrects that session's logged numbers and its weight suggestion. If a later session already built on top of it, the suggestion may not fully re-thread.</p>
      <button class="btn secondary" id="cancelEditBtn" type="button" style="margin-top:10px;">Cancel edit</button>
    </div>` : "";

  const exercisesHtml = day.exercises.map(ex => renderExerciseCard(ex, deload, entry)).join("");

  return `
    <div class="page-header">
      <h1>${day.label}</h1>
      <span class="date">${formatDateNice(iso)}</span>
    </div>
    <p style="color:var(--text-dim);font-size:13px;margin:-10px 0 14px;">${entry.name}</p>
    ${editingBannerHtml}
    ${warmupHtml}
    ${deloadHtml}
    <div id="exerciseList">${exercisesHtml}</div>
    <div class="finish-bar">
      <button class="btn secondary" id="switchWorkoutBtn" type="button" style="margin-bottom:10px;">Switch workout</button>
      <button class="btn" id="finishBtn" type="button">${isEditing ? "Save Changes" : "Finish Session"}</button>
    </div>
  `;
}

function renderExerciseCard(ex, deload, entry) {
  const stateKey = `${entry.id}:${ex.id}`;
  const st = state.exerciseState[stateKey] || { nextWeight: null, missStreak: 0 };
  let suggested = st.nextWeight;
  if (suggested != null && deload) suggested = roundToIncrement(suggested * 0.5);

  const exerciseNotes = entry.plan.exerciseNotes || {};
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

function renderLibraryTab() {
  const active = library.filter(e => !e.archived);
  const archived = library.filter(e => e.archived);

  const planDetailsHtml = (entry) => {
    const p = entry.plan;
    const sections = [];
    if (p.progressionRule && p.progressionRule.length) {
      sections.push(`<details><summary>Progression rule</summary><ul>${p.progressionRule.map(x => `<li>${x}</li>`).join("")}</ul></details>`);
    }
    if (p.deloadNote || p.scheduleNote || p.cardioNote) {
      sections.push(`<details><summary>Deload &amp; schedule</summary>${p.deloadNote ? `<p>${p.deloadNote}</p>` : ""}${p.scheduleNote ? `<p>${p.scheduleNote}</p>` : ""}${p.cardioNote ? `<p>${p.cardioNote}</p>` : ""}</details>`);
    }
    if (p.watchList && p.watchList.length) {
      sections.push(`<details><summary>Watch list</summary><ul>${p.watchList.map(x => `<li>${x}</li>`).join("")}</ul></details>`);
    }
    if (p.exerciseNotes && Object.keys(p.exerciseNotes).length) {
      sections.push(`<details><summary>Exercise cues</summary><ul>${Object.entries(p.exerciseNotes).map(([k, v]) => `<li><strong>${k}</strong> — ${v}</li>`).join("")}</ul></details>`);
    }
    return sections.join("");
  };

  const activeCardsHtml = active.map(entry => `
    <div class="card settings-group">
      <h3>${entry.name}</h3>
      <p style="color:var(--text-dim);font-size:13px;margin:0 0 10px;">${entry.plan.days.length} day${entry.plan.days.length === 1 ? "" : "s"}</p>
      ${planDetailsHtml(entry)}
      <button class="btn secondary" data-export-plan="${entry.id}" type="button" style="margin-top:10px;margin-bottom:8px;">Export</button>
      <button class="btn danger" data-archive-plan="${entry.id}" type="button">Archive</button>
    </div>
  `).join("");

  const archivedHtml = archived.length ? `
    <details class="card">
      <summary>Archived plans (${archived.length})</summary>
      ${archived.map(entry => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--border);">
          <span>${entry.name}</span>
          <span style="display:flex;gap:6px;flex:none;">
            <button class="btn secondary" data-restore-plan="${entry.id}" type="button" style="display:inline-block;width:auto;padding:6px 10px;font-size:12px;">Restore</button>
            <button class="btn danger" data-purge-plan="${entry.id}" type="button" style="display:inline-block;width:auto;padding:6px 10px;font-size:12px;">Delete permanently</button>
          </span>
        </div>
      `).join("")}
    </details>` : "";

  return `
    <div class="page-header"><h1>Library</h1><span class="date">${active.length} plan${active.length === 1 ? "" : "s"}</span></div>
    ${activeCardsHtml}
    ${renderImportForm("Import a plan")}
    ${archivedHtml}
  `;
}

function renderHistory() {
  if (state.sessions.length === 0) {
    return `
      <div class="page-header"><h1>History</h1></div>
      <div class="empty-state">No sessions logged yet.<br/>Finish a workout on the Workout tab and it'll show up here.</div>
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
          <span class="session-title">${s.planName ? s.planName + " — " : ""}${s.dayLabel}${s.deload ? '<span class="badge-deload">DELOAD</span>' : ""}</span>
          <span class="session-sub">${formatDateNice(s.date)}</span>
        </summary>
        <div class="session-detail">
          ${rows}
          <button class="btn secondary" style="margin-top:10px;padding:8px;font-size:13px;" data-edit-session="${idx}" type="button">Edit</button>
          <button class="btn danger" style="margin-top:8px;padding:8px;font-size:13px;" data-delete-session="${idx}" type="button">Delete session</button>
        </div>
      </details>`;
  }).join("");
  return `
    <div class="page-header"><h1>History</h1><span class="date">${state.sessions.length} sessions</span></div>
    ${items}
  `;
}

function renderSettings() {
  return `
    <div class="page-header"><h1>Settings</h1></div>

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

    <div class="card settings-group">
      <h3>Data</h3>
      <p style="color:var(--text-dim);font-size:13px;margin:0 0 10px;">Everything is stored on this device only. Export includes your whole plan library.</p>
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
  if (!draft) return;
  const entry = findLibraryEntry(draft.planId);
  const day = entry ? entry.plan.days[draft.dayIndex] : null;
  if (!entry || !day) {
    alert("This workout's plan isn't available anymore.");
    return;
  }

  const iso = todayISO();
  const deload = deloadOverride === null ? isLastWeekOfMonth(iso) : deloadOverride;
  const editingId = draft.editingSessionId || null;
  const existingIdx = editingId ? state.sessions.findIndex(s => s.sessionId === editingId) : -1;

  // First pass: validate + compute what would be logged, without mutating any
  // shared state yet (so a bail-out on "nothing entered" leaves everything
  // exactly as it was, including any session being edited).
  const computed = [];
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

    computed.push({
      ex, weightNum, allTop, missedBottom,
      sets: setVals.map((v, i) => v === "" ? ex.repHigh : Number(v)),
    });
  });

  if (computed.length === 0) {
    alert("Log at least one exercise before finishing.");
    return;
  }

  // Now safe to mutate. If re-finishing an edited session, undo the
  // progression effect its original finish applied, so redoing it below
  // doesn't double-count.
  if (existingIdx !== -1 && state.sessions[existingIdx].priorExerciseState) {
    Object.entries(state.sessions[existingIdx].priorExerciseState).forEach(([key, prev]) => {
      if (prev == null) delete state.exerciseState[key];
      else state.exerciseState[key] = prev;
    });
  }

  const loggedExercises = [];
  const priorExerciseState = {};

  computed.forEach(({ ex, weightNum, allTop, missedBottom, sets }) => {
    loggedExercises.push({ id: ex.id, name: ex.name, weight: weightNum, sets });

    const stateKey = `${entry.id}:${ex.id}`;
    if (!deload && weightNum != null) {
      priorExerciseState[stateKey] = state.exerciseState[stateKey] || null;
      const prevState = state.exerciseState[stateKey] || { nextWeight: null, missStreak: 0 };
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

      state.exerciseState[stateKey] = { nextWeight, missStreak, lastActualWeight: weightNum };
    }
  });

  const sessionRecord = {
    sessionId: editingId || genId(),
    date: existingIdx !== -1 ? state.sessions[existingIdx].date : iso,
    planId: entry.id,
    planName: entry.name || entry.plan.name || "Plan",
    dayIndex: draft.dayIndex,
    dayLabel: day.label,
    deload,
    unit: state.unit,
    exercises: loggedExercises,
    priorExerciseState,
  };

  if (existingIdx !== -1) state.sessions[existingIdx] = sessionRecord;
  else state.sessions.unshift(sessionRecord);

  state.lastWorkout = { planId: entry.id, dayIndex: draft.dayIndex };
  deloadOverride = null;
  clearDraft();
  saveState();
  render();
}

function editSession(idx) {
  const s = state.sessions[idx];
  if (!s) return;
  const entry = findLibraryEntry(s.planId);
  const day = entry ? entry.plan.days[s.dayIndex] : null;
  if (!entry || !day) {
    alert("This session's plan isn't available anymore, so it can't be reopened for editing.");
    return;
  }
  if (draft && !confirm("You have a workout in progress. Discard it and reopen this session instead?")) return;

  const weights = {};
  const sets = {};
  s.exercises.forEach(e => {
    weights[e.id] = e.weight != null ? String(e.weight) : "";
    sets[e.id] = e.sets.map(v => String(v));
  });
  draft = {
    planId: s.planId,
    dayIndex: s.dayIndex,
    date: s.date,
    deloadOverride: s.deload,
    weights, sets,
    editingSessionId: s.sessionId,
  };
  deloadOverride = s.deload;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  setActiveTab("workout");
}

// ---------- Event handling ----------
function attachImportFormHandlers() {
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
          if (!validatePlan(p)) { alert("Sample plan failed to load correctly."); return; }
          addPlanToLibrary(p);
          activeTab = library.length === 1 ? "workout" : "library";
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
  addPlanToLibrary(parsed);
  activeTab = library.length === 1 ? "workout" : "library";
  render();
}

function attachHandlers() {
  attachImportFormHandlers();

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

  document.querySelectorAll(".day-pick-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      startWorkout(btn.dataset.plan, Number(btn.dataset.day));
    });
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

  const switchWorkoutBtn = document.getElementById("switchWorkoutBtn");
  if (switchWorkoutBtn) {
    switchWorkoutBtn.addEventListener("click", () => {
      if (confirm("Discard this in-progress workout and pick a different one?")) {
        clearDraft();
        deloadOverride = null;
        render();
      }
    });
  }

  const cancelEditBtn = document.getElementById("cancelEditBtn");
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", () => {
      if (confirm("Discard these edits? The session keeps its original logged numbers.")) {
        clearDraft();
        deloadOverride = null;
        setActiveTab("history");
      }
    });
  }

  const finishBtn = document.getElementById("finishBtn");
  if (finishBtn) finishBtn.addEventListener("click", finishSession);

  document.querySelectorAll("[data-edit-session]").forEach(btn => {
    btn.addEventListener("click", () => {
      editSession(Number(btn.dataset.editSession));
    });
  });

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

  document.querySelectorAll("[data-archive-plan]").forEach(btn => {
    btn.addEventListener("click", () => {
      const entry = findLibraryEntry(btn.dataset.archivePlan);
      if (entry && confirm(`Archive "${entry.name}"? It'll drop off your active list but stays in History and can be restored anytime.`)) {
        entry.archived = true;
        saveLibrary();
        render();
      }
    });
  });

  document.querySelectorAll("[data-restore-plan]").forEach(btn => {
    btn.addEventListener("click", () => {
      const entry = findLibraryEntry(btn.dataset.restorePlan);
      if (entry) {
        entry.archived = false;
        saveLibrary();
        render();
      }
    });
  });

  document.querySelectorAll("[data-purge-plan]").forEach(btn => {
    btn.addEventListener("click", () => {
      const entry = findLibraryEntry(btn.dataset.purgePlan);
      if (entry && confirm(`Permanently delete "${entry.name}"? This can't be undone. Past sessions logged against it stay in History.`)) {
        library = library.filter(e => e.id !== entry.id);
        saveLibrary();
        render();
      }
    });
  });

  document.querySelectorAll("[data-export-plan]").forEach(btn => {
    btn.addEventListener("click", () => {
      const entry = findLibraryEntry(btn.dataset.exportPlan);
      if (!entry) return;
      const data = JSON.stringify(entry.plan, null, 2);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(data).then(() => alert("Plan JSON copied to clipboard.")).catch(() => prompt("Copy your plan JSON:", data));
      } else {
        prompt("Copy your plan JSON:", data);
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
      const data = JSON.stringify({ state, library }, null, 2);
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
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.library) && parsed.state) {
          state = Object.assign(defaultState(), parsed.state);
          library = parsed.library.filter(e => e && e.id && validatePlan(e.plan));
          saveLibrary();
        } else {
          state = Object.assign(defaultState(), parsed);
        }
        clearDraft();
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
      if (confirm("This deletes all logged sessions and progression data on this device. Your plan library is kept. Continue?")) {
        state = defaultState();
        clearDraft();
        saveState();
        render();
      }
    });
  }
}

document.getElementById("tabbar").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  setActiveTab(btn.dataset.tab);
});

render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
