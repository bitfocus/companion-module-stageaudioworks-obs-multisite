## obs-multisite

Control a Multisite broadcast from Companion: start and stop the event at the
main site, and drive a campus feed's timeslipping — play, hold, catch up, jog —
with buttons that light up to show what is actually happening.

It can drive either end of the system: **OBS** running the obs-multisite plugin,
or a **campus player** appliance, which has no OBS and answers over its own HTTP
interface. Pick which when you add the connection; the buttons are the same.

### Configuration

- **Connect to** — _OBS_ or _a campus player appliance_.
- **Host** — where that machine is. `127.0.0.1` if Companion is on the same machine.
- **Port** — leave 0 for the default: **4455** for OBS, **8080** for a campus player.
- **OBS WebSocket password** — OBS only, from Tools → WebSocket Server Settings,
  if you set one.

**For OBS** you also need the obs-multisite plugin loaded (Tools → Multisite, or
a Multisite source in the scene) and the WebSocket Server turned on. The module
opens its own connection, so the host, port and password are the same values you
may have given the OBS Studio module — Companion modules each own their
connection.

**For a campus player** there is nothing to switch on, and no password: the
appliance's interface is guarded by the network it is on and by its own Lock.

### Actions

**Main site (encoder) — OBS only.** A campus player only ever receives, so these
are not offered against one.

- **Go live** — start the event. Leave the name blank to name it with the
  current time, exactly as the dock does.
- **End the broadcast** — finish cleanly.
- **Drop a marker** — pick one of the markers the main site published, or type
  your own. The list is the main site's configured cues, and fills in as soon as
  it is connected.

**Campus (decoder)**

- **Play / Stop / Hold / Resume** — the transport. _Hold_ keeps the picture on
  screen and stops advancing; _Resume_ continues from where it stopped.
- **Catch up to live** — jump to the live edge.
- **Return to the room** — stop playing a past recording and follow whatever the
  room is live with.
- **Jog** — step forward or back by a number of seconds (negative goes back).
- **Seek** — go to a clock time within the recording (seconds from midnight).
- **Sit behind live** — hold a constant delay behind live. Zero returns to the
  live edge.
- **Jump to a marker** — go to a cue. The list is _this room's_ markers: the ones
  any site has actually dropped, on either end, each showing the site that set
  it. A cue dropped while you are watching appears in the list by itself.
- **Campus: Drop a cue** — drop a cue with a name of your own from this campus.
  Every site sees it, carrying this box's site name, so a cue set here is never
  mistaken for the main site's.
- **Load a recording** — play a past event from this room. Pinning does not
  follow the room afterwards.
- **Refresh the recordings list** — ask the room what it has recorded. The list
  is filled in when the module connects; this is for after an event ends.

**Any obs-multisite request** — call any command of the plugin by name, with a
JSON object. The escape hatch for a command a newer plugin has that this module
does not yet.

### Feedbacks

- **Encoder: the broadcast is live** _(OBS only)_
- **Encoder: the link is degraded or offline** _(OBS only)_
- **Decoder: playing / held / buffering / loading**
- **Decoder: no source on this machine** — the fix is in the scene collection,
  not on the surface.
- **Decoder: the recording has ended**
- **Decoder: more than N seconds behind live**
- **Decoder: the link is degraded or offline**

A link reading is only shown once it is a real measurement; before anything has
been tried it is blank rather than "healthy".

### Variables

Encoder _(OBS only)_: `encoder_live`, `encoder_status`, `encoder_event_id`,
`encoder_event_name`, `encoder_room`, `encoder_confirmed`, `encoder_pending`,
`encoder_retries`, `encoder_bytes`, `encoder_upload_rate`, `encoder_link`,
`encoder_colo`, `encoder_version`.

Decoder: `decoder_state`, `decoder_have_source`, `decoder_playing`,
`decoder_held`, `decoder_buffering`, `decoder_loading`, `decoder_ended`,
`decoder_behind_live`, `decoder_playhead`, `decoder_live`,
`decoder_cached_segments`, `decoder_link`, `decoder_current_marker`,
`decoder_event_id`, `decoder_room`, `decoder_version`.

Against a campus player, a few of the decoder's are simply blank because the
appliance does not publish them: `decoder_current_marker` and `decoder_version`.
`decoder_have_source` always reads _yes_, since a player is always meant to be
playing something.

### Presets

Two banks — **Multisite: main site** (Go live, End, status) and
**Multisite: campus** (Play, Hold, Resume, Catch up, Return to the room, Jog
either way, status) — with the feedbacks already attached. Only the campus bank
is offered against a campus player.

Under each bank there is also a **Markers** group (main site) or a **Cues** group
(campus) with one button per cue, already named: _Sermon Start_, _Offering_, and
so on. Those are generated from the markers in play, so they change as the main
site's configuration and the room's markers do. The campus bank also carries a
**Drop a cue** group: one button whose name you set, to drop a cue from this
campus under the site name configured on that box.
