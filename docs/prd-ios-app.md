# PRD: Activity Map iOS App

## Overview

A native iOS app that reads workout route data directly from HealthKit and visualises GPS tracks on a map — no zip upload required. Mirrors the core experience of the web app but as a standalone native app.

## Goals

- Let the user see all their historical workout routes on a map directly from HealthKit
- Provide activity type filtering and year-based colour coding
- Tap a route on the map to see workout detail
- No server, no upload, fully local

## Out of Scope (for now)

- Workouts without GPS routes (e.g. gym, yoga) — ignored entirely
- Summary/stats tab
- iPad support
- Sharing or cloud sync
- Caching / offline mode
- App Store distribution

## Tech Stack

- **Language:** Swift
- **UI:** SwiftUI
- **Maps:** MapKit (fastest to get running; can switch tile layer later)
- **Health data:** HealthKit (`HKWorkoutRoute`, `HKWorkout`)
- **Minimum iOS:** 17.0
- **Xcode project:** `~/activity-map-ios` (separate repo: `activity-map-ios`)

## Screens

### 1. Map Screen (initial screen)

- Full-screen MapKit map, dark appearance
- All workout routes rendered as polylines, colour-coded by year
- Toolbar / floating button to open the route list panel
- Activity type filter (native filter chips or picker)
- On launch: requests HealthKit permission, then loads all routes

### 2. Route List Panel (sheet or sidebar)

- Slides up from bottom (or side panel on larger iPhones)
- Lists all routes with: activity type icon + name, date, distance
- Tapping a row highlights that route on the map and shows the detail card
- Filterable by activity type (synced with map filter)

### 3. Route Detail Card

- Appears on top of map when a route or list item is tapped
- Shows: activity type, date, duration, distance, calories
- "Close" button to dismiss

### 4. Permission Denied Screen

- Shown if HealthKit access is denied
- Message explaining why access is needed
- Button that deep-links to Settings → Health → app

## Colour Coding

Same scheme as web app, extended for older years:

| Year | Colour |
|------|--------|
| 2026 | Orange |
| 2025 | Green  |
| 2024 | Blue   |
| 2023 | Red    |
| 2022 | Purple |
| ≤2021 | Grey  |

## Data & Logic

- On launch, query HealthKit for all `HKWorkout` objects that have associated `HKWorkoutRoute`
- For each route, fetch the CLLocation array from the route's `HKWorkoutRoute`
- Derive: type, startDate, duration, totalDistance, totalEnergyBurned from the `HKWorkout`
- All processing on a background thread; show a loading indicator while fetching
- Data lives in memory for the session; no persistence

## Activity Type Filter

- Derived dynamically from the loaded data (only show types that exist)
- Default: "All"
- Selecting a type hides all other polylines on the map and filters the list

## Performance

- Load all routes at launch (can optimise later)
- Downsample GPS points to max 300 per route (same as web app) to keep map responsive
- Show a progress indicator during the initial HealthKit fetch

## Edge Cases

| Scenario | Behaviour |
|---|---|
| HealthKit permission denied | Show permission screen with Settings deep-link |
| HealthKit permission not yet asked | Ask on launch |
| Workout has no GPS route | Skip silently |
| Zero routes after load | Show empty state: "No workout routes found" |
| Route has < 2 points | Skip (can't draw a line) |
| Mixed distance units | Convert to km for display |

## Success Criteria

- App launches and shows all historical routes on the map
- Year colour coding matches spec
- Activity type filter works
- Tapping a route shows correct detail
- HealthKit permission denied state handled gracefully
- Runs on a real iPhone (iOS 17+)
