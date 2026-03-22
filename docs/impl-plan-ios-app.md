# Implementation Plan: Activity Map iOS App

## Architecture

**Pattern:** MVVM

```
ActivityMapApp
└── ContentView
    ├── PermissionDeniedView          (if HealthKit denied)
    ├── LoadingView                   (while fetching)
    └── MapContainerView              (main screen)
        ├── MKMapView (UIViewRepresentable)
        ├── FilterBarView             (activity type chips)
        ├── RouteListSheet            (bottom sheet)
        │   └── RouteRowView
        └── RouteDetailCard           (overlay, tap to dismiss)
```

**Key classes/structs:**

| Name | Role |
|------|------|
| `WorkoutRoute` | Data model — one parsed route |
| `HealthKitManager` | Permission request + all HealthKit queries |
| `RouteViewModel` | `@ObservableObject` holding routes, filter state, loading state |
| `MapViewController` | `UIViewRepresentable` wrapping `MKMapView` |

## Data Model

```swift
struct WorkoutRoute: Identifiable {
    let id: UUID
    let type: HKWorkoutActivityType
    let name: String          // human-readable type name
    let startDate: Date
    let duration: TimeInterval
    let distanceKm: Double?
    let calories: Double?
    let coordinates: [CLLocationCoordinate2D]  // max 300 points
    var color: UIColor { yearColor(startDate) }
    var year: Int { Calendar.current.component(.year, from: startDate) }
}
```

## HealthKit Fetch Flow

1. Request read auth for: `HKWorkout`, `HKSeriesType.workoutRoute()`
2. `HKSampleQuery` — fetch all `HKWorkout` objects, sorted by startDate ascending
3. For each workout, `HKSampleQuery` on `HKWorkoutRoute` predicate linked to that workout
4. For each route, `HKWorkoutRouteQuery` — streams `[CLLocation]` in batches
5. Downsample: `stride(from: 0, to: points.count, by: max(1, points.count / 300))`
6. Skip routes with < 2 points; skip workouts with no route
7. Publish each route as it loads (`@Published var routes`) — map updates incrementally

## MapKit Approach

Use `UIViewRepresentable` wrapping `MKMapView` (not SwiftUI `Map`) for:
- Full polyline tap detection via `MKMapViewDelegate`
- Custom tile overlay support later (CartoDB dark tiles)
- Better performance with many overlays

**Tap detection:** On tap, find closest `MKPolyline` overlay within a hit-test radius (~20pt).

**Highlighting:** Selected route polyline gets a thicker white stroke rendered on top.

## Colour Coding

```swift
func yearColor(_ date: Date) -> UIColor {
    switch Calendar.current.component(.year, from: date) {
    case 2026: return .systemOrange
    case 2025: return .systemGreen
    case 2024: return .systemBlue
    case 2023: return .systemRed
    case 2022: return .systemPurple
    default:   return .systemGray
    }
}
```

## Filter Bar

- Horizontal `ScrollView` of toggle chips, derived from unique types in loaded routes
- "All" chip always first
- Selecting a type: set `RouteViewModel.selectedType`, map hides non-matching overlays, list filters

## Route List (Bottom Sheet)

- SwiftUI `.sheet(isPresented:)` with `presentationDetents([.medium, .large])`
- `List` of `RouteRowView` — type icon, name, date, distance
- Tapping a row: sets `selectedRoute`, map camera animates to that route's bounding rect, detail card appears

## Route Detail Card

- Floating overlay anchored to bottom of screen, above the sheet
- Shows: type icon + name, date, duration, distance, calories (or "—")
- Dismissed by tapping X or tapping elsewhere on map

## Permission Denied Screen

- Shown when `HKAuthorizationStatus == .sharingDenied` or `.notDetermined` after denial
- Button opens `UIApplication.openSettingsURLString`

## Loading State

- `@Published var isLoading = true` until all routes fetched
- Simple centered `ProgressView` with "Loading your routes…" label
- Routes render on map incrementally as they load (no need to wait for all)

## Performance Considerations

- All HealthKit queries run on a background `Task`
- Route coordinates downsampled to 300 pts before publishing to main thread
- Map overlays added in batches of 50 to avoid main thread stalls
- `MKMapView` reuses overlay renderers via delegate cache

## Project Setup

- **Xcode project name:** `ActivityMap`
- **Bundle ID:** `com.lvchk.activitymap`
- **Entitlements:** `com.apple.developer.healthkit`
- **Info.plist keys:**
  - `NSHealthShareUsageDescription` — "Activity Map reads your workout routes to display them on the map."
- **Min deployment target:** iOS 17.0
- **Repo:** `~/activity-map-ios` → GitHub `activity-map-ios`

## File Structure

```
ActivityMap/
├── ActivityMapApp.swift
├── ContentView.swift
├── Models/
│   └── WorkoutRoute.swift
├── ViewModels/
│   └── RouteViewModel.swift
├── Services/
│   └── HealthKitManager.swift
├── Views/
│   ├── MapContainerView.swift
│   ├── MapViewController.swift      (UIViewRepresentable)
│   ├── FilterBarView.swift
│   ├── RouteListView.swift
│   ├── RouteRowView.swift
│   ├── RouteDetailCard.swift
│   ├── LoadingView.swift
│   └── PermissionDeniedView.swift
└── Helpers/
    └── Extensions.swift             (yearColor, type name/icon, unit conversion)
```

## TDD Approach

Unit-testable logic (no Xcode UI tests yet):
- `downsample(points:maxCount:)` — pure function, easy to test
- `yearColor(date:)` — pure function
- `WorkoutRoute` init from mock `HKWorkout` data
- Filter logic in `RouteViewModel`

HealthKit queries are not unit-testable (require device) — covered by tracer bullet on device.

## Tracer Bullet

Earliest meaningful slice to validate the full stack:
1. App launches → requests HealthKit permission
2. Fetches the 5 most recent routes
3. Renders them as polylines on the map

Once that works end-to-end on device, expand to all routes.
