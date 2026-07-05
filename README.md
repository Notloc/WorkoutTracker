# Lift Log

A small installable web app for tracking a weight-training plan on your phone. No login, no backend — everything is stored on-device in the browser. The app doesn't ship with a workout plan built in; you load your own as a JSON file.

## Using it

Open the deployed page (or `index.html` locally), then on first run either:

- **Choose plan file** — pick a `.json` file matching the format below
- **Paste plan JSON** — paste the JSON text directly
- **Load sample plan** — loads `sample-plan.json` so you can see how it works

Once a plan is loaded, the app rotates through its days, suggests a weight for each exercise based on your last session's performance, runs a rest timer, and keeps a local history. Everything lives in `localStorage` on that browser/device — install it to your home screen (Safari/Chrome share menu → "Add to Home Screen") for an app-like feel and offline use.

Swap or update your plan any time from **Plan & Settings → Replace plan**. Your logged history stays; progression suggestions reset only for exercises whose `id` no longer appears in the new plan.

## Plan file format

A plan is a JSON object:

```json
{
  "name": "My Plan",
  "scheduleNote": "Mon / Wed / Fri, 48h rest between sessions.",
  "cardioNote": "Optional notes about cardio.",
  "warmup": ["5 min easy cardio", "Ramp into first compound: light x10 → ~50% x5 → ~75% x3 → working sets"],
  "progressionRule": ["All sets hit top of rep range, clean form → add weight.", "Miss bottom twice in a row → drop weight ~10%."],
  "deloadNote": "Every 4th week: same exercises at ~50% weight.",
  "watchList": ["Anything you want flagged in Settings."],
  "exerciseNotes": { "Goblet Squat": "Dumbbell held vertically at chest." },
  "days": [
    {
      "label": "Day A",
      "exercises": [
        {
          "id": "a_squat",
          "name": "Goblet Squat",
          "sets": 3,
          "repLow": 6,
          "repHigh": 8,
          "rest": 120,
          "type": "weight",
          "compound": true,
          "note": "",
          "watch": false,
          "perLeg": false
        }
      ]
    }
  ]
}
```

Only `days` is required — every other top-level field is optional and just fills in the Plan & Settings info cards. `days` needs at least one entry, each with a `label` and at least one exercise.

### Exercise fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Stable, unique string. This is how progression tracking follows an exercise across sessions — don't change it once you've logged sessions against it. |
| `name` | yes | Display name. Matched against `exerciseNotes` for the cue shown on the card. |
| `sets` | yes | Number of sets. |
| `repLow` / `repHigh` | yes | The working rep range. Hitting `repHigh` on every set (clean form) suggests a weight increase next time; dropping below `repLow` on any set holds weight, and doing so twice in a row drops it ~10%. |
| `rest` | no | Rest time in seconds, shown as a tappable timer chip. |
| `type` | no | `weight` (default, log weight + reps), `time` (bodyweight, log seconds — e.g. planks), or `carry` (loaded, log distance in the reps fields — e.g. farmer's carries). |
| `compound` | no | Informational only; not currently used to change behavior. |
| `note` | no | Short line shown under the exercise name. |
| `watch` | no | Shows a highlighted caution banner (use for anything injury-sensitive). |
| `watchNote` | no | Custom text for that banner; falls back to a generic message if omitted. |
| `perLeg` | no | Labels the rep range "/leg" for unilateral work. |

See `sample-plan.json` for a complete two-day example.

## Data

- **Plan** — `localStorage` key `wt_plan_v1`. Export/replace from Plan & Settings.
- **Sessions & progression** — `localStorage` key `wt_state_v1`. Export/import/reset from Plan & Settings → Data.

Nothing leaves the device; there's no server component.
