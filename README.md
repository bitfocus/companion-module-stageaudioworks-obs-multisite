# companion-module-stageaudioworks-obs-multisite

A [Bitfocus Companion](https://companion.free) module for
[obs-multisite](https://github.com/stageaudioworks/obs-multisite) — the
store-and-forward video system for sending one live event from a main campus to
satellite campuses over ordinary venue internet.

It puts the event on a Stream Deck: **Go live** and **End** at the main site,
and **Play / Hold / Resume / Catch up / Jog** at a campus, with the buttons
lighting up to show what is actually happening — on air, held, buffering, how
far behind live, or that the link has gone wobbly.

**It drives either end of the system**, and which one is decided when the
connection is added:

- **A main site**, where OBS runs the obs-multisite plugin. This also gets you
  the encoder's side of a feed being received there.
- **A satellite**, where the campus player appliance runs on its own box. It has
  no OBS at all, so the module talks to it over its own HTTP interface instead.

Everything else — the buttons, the lights, the variables, the presets — is the
same either way, because both ends offer the same controls.

## Status

**Alpha, and not yet in the Companion store.** It has to be installed as a
developer module for now (see below). It has been driven against a real OBS —
the connection, the commands and the feedbacks — but it has not yet run a full
event end to end.

## Getting started

Then, in Companion, add a connection, choose **Connect to**, and fill in the
host.

**Pointing at OBS.** That machine needs the **obs-multisite plugin** loaded
(Tools → Multisite, or a Multisite source in the scene collection) and the
**WebSocket Server** turned on — Tools → WebSocket Server Settings, which ships
with OBS 28 and later. Enter the WebSocket port (4455 by default) and the
password.

> This module opens its own obs-websocket connection, so the host, port and
> password are the same ones you may already have given Companion's OBS Studio
> module. Companion modules each own their connection; there is no way around
> entering them twice.

**Pointing at a campus player.** Nothing to switch on: the appliance already
serves its controls on its own port (8080 by default), so enter its address and
leave the port at 0. There is no password — the appliance's interface is guarded
by the network it is on, and by its own **Lock**.

See [companion/HELP.md](./companion/HELP.md) for what each action, feedback and
variable does.

## Installing it before it is in the store

Companion loads unreleased modules from a **developer modules path**. That path
is a _directory to search_, not the module itself: each folder inside it that has
a `companion/manifest.json` is treated as a module.

```sh
git clone https://github.com/bitfocus/companion-module-stageaudioworks-obs-multisite
cd companion-module-stageaudioworks-obs-multisite
yarn install && yarn build        # the manifest points at dist/, so this matters

mkdir -p ~/companion-dev-modules
ln -s "$PWD" ~/companion-dev-modules/obs-multisite
```

Then, in the **Companion launcher** (not the web UI): **Developer** → tick
**Enable Developer Modules**, set **Developer Modules Path** to
`~/companion-dev-modules`, and restart Companion. The module appears in the
Connections list marked _Dev_.

`yarn build` again after a code change and Companion reloads it — the launcher
watches that directory.

## How it works

Everything here is an adapter, and there are **two adapters, one for each wire**.

Against **OBS**, the obs-multisite plugin exposes its commands as
**obs-websocket vendor requests** under the vendor name `obs-multisite`, and
pushes **vendor events** when the state changes. The module calls those requests
and listens for those events.

Against a **campus player**, the appliance serves the same controls on its own
HTTP API — `GET /api/status`, `POST /api/hold`, `POST /api/follow-live` and the
rest — and pushes nothing, so the module polls it about once a second.

Either way it adds no control logic of its own, so a button here and a keypress
on the desk cannot disagree about what "hold" means. The command names are the
ones the plugin's own pages use, and the two places the appliance names things
differently (`follow-live` for `return-to-live`, `load` for `load-event`) are a
table in one file rather than a difference the rest of the module can see.

If a newer plugin adds a command this module does not know yet, the **Any
obs-multisite request** action reaches it without waiting for a module release.
There is nothing equivalent on an appliance, whose set of routes is fixed.

**Cues** are not a text field you have to get right. The main site's configured
cues fill the _Drop a marker_ list; the cues _this room has actually reached_
fill _Jump to a marker_ — on either end, and each shows the site that set it.
Each one is also generated as its own preset button, and a cue dropped at any
site while you are watching appears within about a second. A campus can drop a
cue of its own, with any name, using **Campus: Drop a cue** — it reaches every
other site carrying that box's site name.

## Requirements

- **Companion 4.0 or later** — this uses module API `@companion-module/base` 2.x,
  and Companion installs modules on demand from 4.0. (It also loads as a developer
  module from the 3.x launcher, but the store path is 4.0 and up.)
- obs-multisite **v0.1.10-alpha or later**, if you are pointing at **OBS** — the
  release that carries the obs-websocket **vendor API**. Against an older plugin
  the connection succeeds but no commands appear; the module logs that it found
  nothing to talk to.
- A **campus player** appliance, if you are pointing at one of those instead.
  Any release that serves its HTTP API will do — that is all of them.

## License

The module source is **MIT** — a requirement of the Companion module store,
which keeps modules portable. The module is distributed under
**GPL-3.0-only**, declared in `companion/manifest.json`, matching the licence of
[obs-multisite](https://github.com/stageaudioworks/obs-multisite) itself.

See [LICENSE](./LICENSE).
