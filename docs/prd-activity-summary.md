# PRD: Activity Summary Feature

## Overview

Add a Summary view to the Activity Map app that gives users a high-level statistical overview of their uploaded workout data, broken down by year and workout type.

## Goals

- Let users quickly understand the scope of their activity history at a glance
- Surface meaningful aggregates without requiring users to scroll through individual routes
- Stay consistent with the existing app aesthetic and self-contained architecture (no new dependencies)

## User Story

As a user who has uploaded their Apple Health export, I want to see a summary of my total workouts, distance, and calories — broken down by year and workout type — so I can get a sense of my overall activity history.

## UI Design

### Placement

A "Summary" tab added to the left panel (alongside the existing route list), visible only after upload. Switching to Summary does not affect the map — all routes remain visible.

### Layout

**Year tabs** across the top: `All | 2019 | 2020 | 2021 | 2022 | 2023 | 2024` (only years present in data are shown; "All" is the default).

**Stat cards** below the tabs (3 in a row):
- Total Workouts
- Total Distance (with unit)
- Total Calories

**Type breakdown table** below the stat cards:
- One row per workout type present in the selected year(s)
- Columns: Type icon + name | Count | Distance
- Sorted by count descending
- Types with no distance data show "—" in the distance column

### Distance Unit

Use the unit (`distanceUnit`) from the route objects. If mixed units exist in the dataset, convert everything to km for aggregation and display.

## Data & Logic

- All computation runs client-side in the browser, derived from the existing `routes` array already fetched from `/api/routes/:sid`
- No new API endpoints required
- Summary recalculates whenever the year tab changes
- Workouts missing distance or calorie data are included in counts but excluded from distance/calorie totals (displayed as "—" if all workouts in selection have no data, otherwise just omitted from sum)

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Only 1 workout | Summary displays normally |
| All workouts missing distance | Distance stat shows "—" |
| All workouts missing calories | Calories stat shows "—" |
| Only 1 year in data | Year tabs show "All" + that single year |
| Workout type not in TYPE_META | Display raw type string, no icon |
| Mixed distance units | Convert all to km, label as "km" |

## Out of Scope

- Filtering the map by year via the summary tabs (map always shows all routes)
- Charts or graphs
- Pace / speed calculations
- Export of summary data

## Success Criteria

- Summary tab appears after upload and shows correct aggregates
- Year tabs filter stats correctly
- No new external dependencies introduced
- Works on mobile (responsive layout)
