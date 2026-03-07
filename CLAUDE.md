# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## Workflow

For every new feature or bug fix, follow these steps in order:

1. **UX & edge case interview** — Before anything else, consider all UX edge cases and interview the user extensively about the boundaries and limits of the feature. Do not proceed until this is thorough.

2. **PRD** — Create a feature-specific PRD in `docs/prd-<feature-name>.md`. During drafting, flag any uncertainty and ask the user. Get explicit sign-off before moving on.

3. **Implementation plan** — Once the PRD is approved, produce a detailed technical implementation plan covering: specific tools/libraries, architecture changes, performance considerations, edge cases, and design decisions. Check in on anything unclear. Get explicit sign-off before moving on.

4. **Task list** — Once the implementation plan is approved, break it into the smallest possible atomic units of work as a task list. Each task should be independently actionable.

5. **Execution** — Work through tasks one at a time. After completing each task, stop and verify with the user before moving to the next.

## Verification

Before marking any task or feature complete, confirm all of the following:

1. All tests pass
2. Build is successful
3. Linting and tsc-compile pass
4. Tracer bullets for new features
Tracer bullets comes from the Pragmatic Programmer. When building systems, you want to write code that gets you feedback as quickly as possible. Tracer bullets are small slices of functionality that go through all layers of the system, allowing you to test and validate your approach early. This helps in identifying potential issues and ensures that the overall architecture is sound before investing significant time in development.

we also want to use a test driven development approach

# EXECUTION: RED

First, write tests that fail because the feature is not yet implemented.

Run the tests to check that they fail

Tests should focus on the publicly accessible interface of the system. They should test user behavior, not internal implementation details.

# EXECUTION: GREEN

Next, implement the minimum amount of code necessary to make the tests pass.

# EXECUTION: REFACTOR

Finally, ALWAYS refactor the code to improve its structure. Don't just refactor the new code — look for opportunities to improve existing code as well.

Ensure the code adheres to best practices:

- Code is clear and readable
- Functions and variables are well-named
- No duplicated code
- Proper error handling
- No exposed secrets or API keys
- Input validation implemented
- Good test coverage
- Performance considerations addressed

## Architecture

Single-file Express backend (`server.js`) + single-page frontend (`public/index.html`).

**Upload flow:**
1. Browser generates a UUID session ID, opens an SSE stream to `/api/progress/:sid`
2. Browser POSTs the zip to `/api/upload/:sid` (multer stores to OS tmpdir)
3. Server processes the zip in the background via `processUpload()`, streaming progress events
4. On completion, browser fetches `/api/routes/:sid` to get the parsed route array
5. Sessions live in-memory (`sessions` Map) and auto-expire after 1 hour

**Server-side parsing (`server.js`):**
- Unzips the Apple Health export, finds all `.gpx` files in `workout-routes/`
- Streams `export.xml` line-by-line to extract workout metadata (type, distance, calories) keyed by GPX filename
- Parses each GPX with `fast-xml-parser`, downsamples tracks to max 300 points
- Routes are never written to disk beyond the temp zip file (deleted after processing)

**Frontend (`public/index.html`):**
- Self-contained: all JS/CSS inline, no build step
- Leaflet (loaded from CDN) renders routes as polylines on a dark CartoDB tile layer
- Routes are colour-coded by year (`YEAR_COLORS`); workout types mapped in `TYPE_META`
- Upload card is shown/hidden via CSS class; panel and detail card appear post-upload

**Key data shape** (route object):
```js
{
  id, name, startTime, endTime, totalPoints,
  points: [[lat, lon], ...],  // max 300 sampled points
  type,           // HKWorkoutActivityType* string
  distance, distanceUnit, calories
}
```
