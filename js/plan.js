// Plan data derived from workout_plan_final.md
// repLow/repHigh define the working rep range used by the progression rule.
// type: 'weight' (log weight+reps), 'time' (log seconds, bodyweight), 'carry' (log weight+distance)

const PLAN = {
  scheduleNote: "Mon / Wed / Fri, or any pattern with 48h rest between sessions.",
  cardioNote: "Optional, 1-2x/week walking. Doesn't take priority over lifting recovery.",

  restNotes: {
    compound: 120,
    row: 90,
    accessory: 60,
  },

  warmup: [
    "5 min easy cardio (bike, row erg, walk)",
    "First 1-2 compound lifts: empty/lightest x10 → ~50% working weight x5 → ~75% working weight x3 → working sets",
    "Day B & C, before RDL/OHP: band pull-aparts or light face pulls, 2x15",
    "Pure accessories: skip the ramp, go straight to working weight",
  ],

  progressionRule: [
    "All sets hit top of rep range, clean form → add weight next session (smallest available increment).",
    "Some sets hit it, some don't → repeat same weight.",
    "Miss bottom of rep range on any set → repeat same weight. Miss it two sessions in a row → drop weight ~10% and rebuild.",
  ],

  deloadNote: "Month-end: deload week — same exercises, ~50% working weight, same reps. Then reassess. If OHP or RDL are capped by discomfort rather than strength, see a physio.",

  watchList: [
    "If goblet squat or leg press starts feeling stale or aggravates anything, swap it.",
    "Shoulder discomfort on OHP at light weight/low fatigue → get it looked at. Not a programming fix.",
  ],

  days: {
    A: {
      label: "Day A",
      exercises: [
        { id: "a_squat", name: "Goblet Squat / Leg Press", sets: 3, repLow: 6, repHigh: 8, rest: 120, type: "weight", compound: true, note: "" },
        { id: "a_bench", name: "Dumbbell Bench Press", sets: 3, repLow: 6, repHigh: 8, rest: 120, type: "weight", compound: true, note: "" },
        { id: "a_row", name: "Seated Cable Row", sets: 3, repLow: 8, repHigh: 10, rest: 90, type: "weight", note: "Torso still" },
        { id: "a_facepull", name: "Face Pulls", sets: 3, repLow: 13, repHigh: 15, rest: 60, type: "weight", note: "" },
        { id: "a_plank", name: "Plank", sets: 3, repLow: 30, repHigh: 45, rest: 60, type: "time", note: "" },
      ],
    },
    B: {
      label: "Day B",
      exercises: [
        { id: "b_rdl", name: "Romanian Deadlift", sets: 3, repLow: 6, repHigh: 8, rest: 120, type: "weight", compound: true, note: "Start very light." },
        { id: "b_incline", name: "Incline Dumbbell Press", sets: 3, repLow: 8, repHigh: 10, rest: 90, type: "weight", note: "" },
        { id: "b_pulldown", name: "Lat Pulldown", sets: 3, repLow: 8, repHigh: 10, rest: 90, type: "weight", note: "" },
        { id: "b_lunge", name: "Walking Lunges", sets: 2, repLow: 8, repHigh: 10, rest: 90, type: "weight", perLeg: true, note: "Bodyweight to start" },
        { id: "b_crunch", name: "Cable Crunch", sets: 3, repLow: 10, repHigh: 12, rest: 60, type: "weight", note: "Crunch with torso, not arms" },
      ],
    },
    C: {
      label: "Day C",
      exercises: [
        { id: "c_legpress", name: "Leg Press / Split Squat", sets: 3, repLow: 6, repHigh: 8, rest: 120, type: "weight", compound: true, note: "" },
        { id: "c_ohp", name: "Dumbbell Overhead Press", sets: 2, repLow: 8, repHigh: 10, rest: 120, type: "weight", compound: true, note: "Light weight.", watch: true },
        { id: "c_row", name: "Chest-Supported Row", sets: 3, repLow: 8, repHigh: 10, rest: 90, type: "weight", note: "" },
        { id: "c_lateral", name: "Lateral Raise", sets: 3, repLow: 13, repHigh: 15, rest: 60, type: "weight", note: "Light weight" },
        { id: "c_carry", name: "Farmer's Carry", sets: 3, repLow: 30, repHigh: 30, rest: 60, type: "carry", note: "" },
      ],
    },
  },

  exerciseNotes: {
    "Goblet Squat / Leg Press": "Dumbbell held vertically at chest, squat between legs.",
    "Face Pulls": "Cable at head height, pull to face, elbows high/wide.",
    "Romanian Deadlift": "Hip hinge (push hips back), not a squat. Watch a video first.",
    "Lat Pulldown": "Pull with elbows, not hands.",
    "Chest-Supported Row": "Chest braced on angled bench/machine.",
    "Dumbbell Overhead Press": "Stop immediately at any pinch or discomfort.",
  },
};

const DAY_ORDER = ["A", "B", "C"];
