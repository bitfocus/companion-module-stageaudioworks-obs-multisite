# Changelog

All notable changes to this module are recorded here.

## [0.3.1]

- **A campus can drop a cue.** New **Campus: Drop a cue** action, with a name of
  your own, reaching every other site under that box's site name. Works against
  OBS (the plugin's `decoder/cue` request) and against a campus player
  (`POST /api/cue`).
- **Cues show who set them.** The **Jump to a marker** list labels each cue with
  the site that dropped it, so a cue set at another campus is never mistaken for
  the main site's.

## [0.3.0]

- **Markers are properly controllable.** The **Jump to a marker** list is built
  from the room's own markers — from the plugin and from an appliance alike —
  rather than being empty, and **Drop a marker** is filled in once the main
  site's status arrives instead of being frozen empty at start-up. Both lists are
  re-registered when they change, so a cue the main site drops becomes a button
  without reloading the module.
- **One button per cue.** Each configured marker is now generated as its own
  preset button — _Drop Sermon Start_, _Jump to Offering_ — so nobody has to open
  a dropdown mid-service to reach the cue they can see coming.
- **The recordings list is fetched on connect**, and there is a new **Refresh the
  recordings list** action. Previously nothing ever asked for it, so "Load a
  recording" stayed empty however long you waited.
- Marker buttons carry the cue's **label**, never its id: an id is a timestamp
  and reads as nothing on a button. The action turns a label back into the
  newest marker of that name, so the same cue dropped twice is one button.

## [0.2.0]

- **A campus player appliance can be driven directly.** The connection now has a
  **Connect to** choice: OBS, as before, or a campus player. The appliance has
  no OBS at all, so the module talks to its own HTTP API instead — nothing to
  install on that box, and no password involved.
- The same actions, feedbacks, variables and presets work against either end,
  because both offer the same controls. The two places the appliance names a
  command differently (`follow-live` for `return-to-live`, `load` for
  `load-event`) are a table in one file, and there is a test pinning it.
- Against an appliance the module polls about once a second, since a player
  pushes nothing to listen for.
- The encoder's actions, feedbacks, variables and presets are not offered
  against an appliance: a player only ever receives, and a button that can only
  refuse is worse than one that is not there.
- The port field defaults to 0, meaning "4455 for OBS, 8080 for a campus
  player", so one field covers both.

## [0.1.0]

First functional version.

- Connect to OBS over obs-websocket, and to the `obs-multisite` vendor.
- Actions: Go live, End, Drop a marker; Play, Stop, Hold, Resume, Catch up,
  Return to the room, Jog, Seek, Sit behind live, Jump to a marker, Load a
  recording; and a pass-through for any vendor request.
- Feedbacks: on air; playing / held / buffering / loading; no source; the
  recording has ended; more than N seconds behind live; link degraded or
  offline.
- Variables for both halves, so a button can show the state as text.
- Two preset banks for the main site and a campus.
- State is seeded by asking on connect and by a slow poll, as well as by the
  plugin's pushed events, so a module that connects mid-event shows the truth
  immediately rather than waiting for the next change.
- First tested against a real OBS: the connection, both halves' commands and the
  feedbacks. It has not yet been through a full event.
