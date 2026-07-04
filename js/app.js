// ---------- State ----------
const STORAGE_KEY = "wt_state_v1";

function defaultState() {
  return {
    unit: "kg",
    increment: 2.5,
    lastDayKey: null,
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

function nextDayKey() {
  if (!state.lastDayKey) return "A";
  const idx = DAY_ORDER.indexOf(state.lastDayKey);
  return DAY_ORDER[(idx + 1) % DAY_ORDER.length];
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
const restEl = document.getElementById("restTimer");
const restClockEl = document.getElementById("restClock");
const restLabelEl = document.getElementById("restLabel");
let restInterval = null;
let restRemaining = 0;

function startRest(seconds, label) {
  clearInterval(restInterval);
  restRemaining = seconds;
  restLabelEl.textContent = label || "Rest";
  updateRestClock();
  restEl.classList.remove("hidden");
  restInterval = setInterval(() => {
    restRemaining -= 1;
    if (restRemaining <= 0) {
      clearInterval(restInterval);
      restRemaining = 0;
      updateRestClock();
      vibrate([200, 100, 200]);
      beep();
      setTimeout(() => restEl.classList.add("hidden"), 1500);
      return;
    }
    updateRestClock();
  }, 1000);
}

function updateRestClock() {
  const mm = Math.floor(restRemaining / 60);
  const ss = restRemaining % 60;
  restClockEl.textContent = mm + ":" + String(ss).padStart(2, "0");
}

document.getElementById("restAddBtn").addEventListener("click", () => { restRemaining += 15; updateRestClock(); });
document.getElementById("restSkipBtn").addEventListener("click", () => {
  clearInterval(restInterval);
  restEl.classList.add("hidden");
});

// ---------- Rendering ----------
const appEl = document.getElementById("app");

function render() {
  if (activeTab === "today") appEl.innerHTML = renderToday();
  else if (activeTab === "history") appEl.innerHTML = renderHistory();
  else appEl.innerHTML = renderSettings();
  attachHandlers();
}

function unitLabel() { return state.unit; }

function renderToday() {
  const dayKey = nextDayKey();
  const day = PLAN.days[dayKey];
  const iso = todayISO();
  const autoDeload = isLastWeekOfMonth(iso);
  const deload = deloadOverride === null ? autoDeload : deloadOverride;

  const warmupHtml = `
    <details class="card">
      <summary>Warm-up</summary>
      <ul>${PLAN.warmup.map(w => `<li>${w}</li>`).join("")}</ul>
    </details>`;

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

  const noteExtra = PLAN.exerciseNotes[ex.name] ? `<div class="ex-note">${PLAN.exerciseNotes[ex.name]}</div>` : "";
  const watchExtra = ex.watch ? `<div class="ex-watch">Recurring shoulder discomfort here, even light/fresh → get it looked at. Not a programming fix.</div>` : "";

  const isTime = ex.type === "time";
  const showWeight = ex.type === "weight" || ex.type === "carry";
  const unit = isTime ? "sec" : ex.type === "carry" && ex.repHigh > 100 ? "m" : "";

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
    return `
      <div class="set-cell">
        <label>Set ${i + 1}</label>
        <input class="set-input" type="number" inputmode="numeric" data-ex="${ex.id}" data-set="${i}"
          data-low="${ex.repLow}" data-high="${ex.repHigh}"
          placeholder="${def}" />
      </div>`;
  }).join("");

  return `
    <div class="card exercise-card" data-exid="${ex.id}">
      <div class="ex-name-row">
        <span class="ex-name">${ex.name}</span>
        <span class="ex-target">${ex.sets}×${targetLabel}${isTime ? "" : ""}</span>
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
    const day = PLAN.days[s.dayKey];
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
          <span class="session-title">${day.label}${s.deload ? '<span class="badge-deload">DELOAD</span>' : ""}</span>
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
  return `
    <div class="page-header"><h1>Plan &amp; Settings</h1></div>

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

    <details class="card">
      <summary>Progression rule</summary>
      <ul>${PLAN.progressionRule.map(x => `<li>${x}</li>`).join("")}</ul>
    </details>

    <details class="card">
      <summary>Deload &amp; schedule</summary>
      <p>${PLAN.deloadNote}</p>
      <p>${PLAN.scheduleNote}</p>
      <p>${PLAN.cardioNote}</p>
    </details>

    <details class="card">
      <summary>Watch list</summary>
      <ul>${PLAN.watchList.map(x => `<li>${x}</li>`).join("")}</ul>
    </details>

    <details class="card">
      <summary>Exercise cues</summary>
      <ul>${Object.entries(PLAN.exerciseNotes).map(([k, v]) => `<li><strong>${k}</strong> — ${v}</li>`).join("")}</ul>
    </details>

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
  const dayKey = nextDayKey();
  const day = PLAN.days[dayKey];
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
    dayKey,
    deload,
    unit: state.unit,
    exercises: loggedExercises,
  });
  state.lastDayKey = dayKey;
  deloadOverride = null;
  saveState();
  render();
}

// ---------- Event handling ----------
function attachHandlers() {
  document.querySelectorAll(".set-input").forEach(inp => {
    inp.addEventListener("input", () => {
      const low = Number(inp.dataset.low);
      const high = Number(inp.dataset.high);
      inp.classList.remove("hit", "miss");
      if (inp.value === "") return;
      const v = Number(inp.value);
      if (v >= high) inp.classList.add("hit");
      else if (v < low) inp.classList.add("miss");
    });
  });

  document.querySelectorAll("[data-rest]").forEach(btn => {
    btn.addEventListener("click", () => {
      startRest(Number(btn.dataset.rest), btn.dataset.restlabel);
    });
  });

  const deloadToggle = document.getElementById("deloadToggle");
  if (deloadToggle) {
    deloadToggle.addEventListener("change", () => {
      deloadOverride = deloadToggle.checked;
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
        saveState();
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
