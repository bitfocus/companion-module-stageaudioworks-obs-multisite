//
// actions.ts — the buttons, as vendor requests.
//
// Every action here is a thin wrapper over the plugin's vendor API (§8.3 of the
// project scope): the same command the plugin's own pages and hotkeys run. The
// module adds no behaviour of its own, which is the point — a button and a
// keypress cannot disagree about what "hold" means.
//
// The marker and recording dropdowns are built from the latest status, and
// main.ts re-registers these definitions when those lists change — so the
// choices are this room's actual markers and this room's actual recordings,
// rather than a list somebody typed twice or a snapshot frozen at start-up.
//
import type { CompanionActionDefinitions, JsonObject } from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { DecoderMarker, EventEntry } from './types.js'

type NoOptions = Record<string, never>

export type ActionsSchema = {
	encoder_go_live: { options: { event_name: string } }
	encoder_end: { options: NoOptions }
	encoder_marker: { options: { label: string } }
	decoder_play: { options: NoOptions }
	decoder_stop: { options: NoOptions }
	decoder_hold: { options: NoOptions }
	decoder_continue: { options: NoOptions }
	decoder_catch_up: { options: NoOptions }
	decoder_return_to_live: { options: NoOptions }
	decoder_jog: { options: { seconds: number } }
	decoder_seek: { options: { seconds: number } }
	decoder_delay: { options: { seconds: number } }
	decoder_marker: { options: { id: string } }
	decoder_cue: { options: { label: string } }
	decoder_load_event: { options: { event_id: string } }
	decoder_refresh_recordings: { options: NoOptions }
	vendor_request: { options: { request: string; data: string } }
}

/** The marker buttons the main site published, as dropdown choices. */
function markerChoices(self: ModuleInstance): { id: string; label: string }[] {
	const labels = self.encoderStatus.marker_labels ?? []
	if (labels.length === 0) return [{ id: '', label: '(no markers published yet)' }]
	return labels.map((label) => ({ id: label, label }))
}

/**
 * The cues this room has actually reached, as dropdown choices. Built from the
 * decoder's own marker list — which both the plugin and the appliance publish —
 * so it is this room's markers rather than the labels the main site configured.
 *
 * The value is the marker's id, which is timestamp-derived and not something to
 * put in front of a volunteer; the label is what they see. Two markers can share
 * a label (the same cue pressed twice), so labels are de-duplicated and the
 * newest wins — which is what a person means by "go to Offering".
 */
/**
 * This room's markers, one entry per label, newest first — the same cue dropped
 * twice is one cue to a volunteer. Exported because the presets turn each one
 * into a button of its own, and both need the same de-duplication.
 */
export function decoderMarkers(markers: DecoderMarker[]): { id: string; label: string; author?: string }[] {
	const newest = new Map<string, DecoderMarker>()
	for (const marker of markers) {
		newest.set(marker.label || marker.id, marker) // later entries overwrite
	}
	return [...newest].map(([label, marker]) => ({ id: marker.id, label, author: marker.author }))
}

/**
 * A marker id from whatever a button is holding: an id, or a label. Presets show
 * labels, because an id is a timestamp and reads as nothing, so a label has to
 * be turned back into the marker it names — newest first, for the same reason as
 * above. Anything matching neither is passed through, and the plugin or the
 * player refuses it in words rather than the button doing nothing.
 */
export function resolveMarkerId(markers: DecoderMarker[], wanted: string): string {
	if (wanted === '') return ''
	if (markers.some((marker) => marker.id === wanted)) return wanted
	for (let i = markers.length - 1; i >= 0; i--) {
		if (markers[i].label === wanted) return markers[i].id
	}
	return wanted
}

/** The cues this room has reached, as dropdown choices, with a placeholder for none. */
function decoderMarkerChoices(self: ModuleInstance): { id: string; label: string }[] {
	const markers = decoderMarkers(self.decoderStatus.markers ?? [])
	if (markers.length === 0) return [{ id: '', label: '(no markers yet — the main site has not dropped one)' }]
	// The value stays the id (the label alone is not unique); the author is
	// shown so a cue set at another campus is never mistaken for the main
	// site's.
	return markers.map((marker) => ({
		id: marker.id,
		label: marker.author ? `${marker.label} — ${marker.author}` : marker.label,
	}))
}

/** The recordings the room has, as dropdown choices. */
function eventChoices(self: ModuleInstance): { id: string; label: string }[] {
	const events: EventEntry[] = self.events.events ?? []
	if (events.length === 0) return [{ id: '', label: '(no recordings listed — use Refresh recordings)' }]
	return events.map((e) => ({ id: e.event_id, label: e.name ? `${e.name}` : e.event_id }))
}

export function UpdateActions(self: ModuleInstance): void {
	const actions: CompanionActionDefinitions<ActionsSchema> = {
		// ── The main site ────────────────────────────────────────────────────
		encoder_go_live: {
			name: 'Encoder: Go live',
			description: 'Start sending. Leave the name blank to name it with the current time, as the dock does.',
			options: [
				{
					id: 'event_name',
					type: 'textinput',
					label: 'Event name (optional)',
					default: '',
					useVariables: true,
				},
			],
			callback: async (event) => {
				await self.command('encoder/go-live', { event_name: event.options.event_name ?? '' }, 'encoder')
			},
		},

		encoder_end: {
			name: 'Encoder: End the broadcast',
			options: [],
			callback: async () => {
				await self.command('encoder/end', {}, 'encoder')
			},
		},

		encoder_marker: {
			name: 'Encoder: Drop a marker',
			options: [
				{
					id: 'label',
					type: 'dropdown',
					label: 'Marker',
					default: markerChoices(self)[0].id,
					choices: markerChoices(self),
					allowCustom: true,
				},
			],
			callback: async (event) => {
				await self.command('encoder/marker', { label: String(event.options.label ?? '') }, 'encoder')
			},
		},

		// ── The campus ───────────────────────────────────────────────────────
		decoder_play: {
			name: 'Decoder: Play',
			options: [],
			callback: async () => {
				await self.command('decoder/play')
			},
		},

		decoder_stop: {
			name: 'Decoder: Stop',
			options: [],
			callback: async () => {
				await self.command('decoder/stop')
			},
		},

		decoder_hold: {
			name: 'Decoder: Hold (pause)',
			options: [],
			callback: async () => {
				await self.command('decoder/hold')
			},
		},

		decoder_continue: {
			name: 'Decoder: Resume (continue)',
			options: [],
			callback: async () => {
				await self.command('decoder/continue')
			},
		},

		decoder_catch_up: {
			name: 'Decoder: Catch up to live',
			options: [],
			callback: async () => {
				await self.command('decoder/catch-up')
			},
		},

		decoder_return_to_live: {
			name: 'Decoder: Return to the room (follow live)',
			description: 'Stop playing a past recording and follow whatever the room is live with.',
			options: [],
			callback: async () => {
				await self.command('decoder/return-to-live')
			},
		},

		decoder_jog: {
			name: 'Decoder: Jog',
			description: 'Step forward or back by a number of seconds. Negative goes back.',
			options: [
				{
					id: 'seconds',
					type: 'number',
					label: 'Seconds',
					default: 10,
					min: -86400,
					max: 86400,
					step: 1,
				},
			],
			callback: async (event) => {
				await self.command('decoder/jog', { seconds: Number(event.options.seconds ?? 0) })
			},
		},

		decoder_seek: {
			name: 'Decoder: Seek to a time of day',
			description: 'Go to a clock time within the recording, counted from midnight (seconds).',
			options: [
				{
					id: 'seconds',
					type: 'number',
					label: 'Seconds from midnight',
					default: 3600,
					min: 0,
					max: 86399,
					step: 1,
				},
			],
			callback: async (event) => {
				await self.command('decoder/seek', { ms: Math.round(Number(event.options.seconds ?? 0) * 1000) })
			},
		},

		decoder_delay: {
			name: 'Decoder: Sit behind live',
			description: 'Hold a constant delay behind live, in seconds. Zero returns to the live edge.',
			options: [
				{
					id: 'seconds',
					type: 'number',
					label: 'Seconds behind live',
					default: 30,
					min: 0,
					max: 14400,
					step: 1,
				},
			],
			callback: async (event) => {
				await self.command('decoder/delay', { seconds: Number(event.options.seconds ?? 0) })
			},
		},

		decoder_marker: {
			name: 'Decoder: Jump to a marker',
			description: 'Go to a cue the main site has dropped. The list is this room’s own markers.',
			options: [
				{
					id: 'id',
					type: 'dropdown',
					label: 'Marker',
					default: decoderMarkerChoices(self)[0].id,
					choices: decoderMarkerChoices(self),
					allowCustom: true,
				},
			],
			callback: async (event) => {
				const wanted = String(event.options.id ?? '')
				if (wanted === '') return
				// A button may hold an id, from this dropdown, or a label, from a
				// preset — a label is the only thing readable on a button.
				await self.command('decoder/marker', { id: resolveMarkerId(self.decoderStatus.markers ?? [], wanted) })
			},
		},

		decoder_cue: {
			name: 'Campus: Drop a cue',
			description:
				'Drop a cue with a name of your own from this campus. Every site sees it, carrying this box’s site name.',
			options: [
				{
					id: 'label',
					type: 'textinput',
					label: 'Cue name',
					default: '',
					useVariables: true,
				},
			],
			callback: async (event) => {
				const label = String(event.options.label ?? '').trim()
				if (label === '') return
				await self.command('decoder/cue', { label })
			},
		},

		decoder_load_event: {
			name: 'Decoder: Load a recording',
			description: 'Play a past event from this room. Pinning does not follow the room afterwards.',
			options: [
				{
					id: 'event_id',
					type: 'dropdown',
					label: 'Recording',
					default: eventChoices(self)[0].id,
					choices: eventChoices(self),
					allowCustom: true,
				},
			],
			callback: async (event) => {
				const id = String(event.options.event_id ?? '')
				if (id !== '') await self.command('decoder/load-event', { event_id: id })
			},
		},

		decoder_refresh_recordings: {
			name: 'Decoder: Refresh the recordings list',
			description: 'Ask the room what it has recorded. Fills in the Load a recording list.',
			options: [],
			callback: async () => {
				await self.command('decoder/events/refresh')
				await self.fetchEvents()
			},
		},

		// ── The escape hatch ─────────────────────────────────────────────────
		vendor_request: {
			name: 'Any obs-multisite request',
			description:
				'Call any command of the plugin, by name, with a JSON object. ' +
				'The escape hatch for a command a newer plugin has and this module does not yet.',
			options: [
				{
					id: 'request',
					type: 'textinput',
					label: 'Request (e.g. decoder/status)',
					default: 'decoder/status',
					useVariables: true,
				},
				{
					id: 'data',
					type: 'textinput',
					label: 'JSON data',
					default: '{}',
					useVariables: true,
				},
			],
			callback: async (event) => {
				const request = String(event.options.request ?? '').trim()
				if (request === '') return
				let data: JsonObject = {}
				const raw = String(event.options.data ?? '').trim()
				if (raw !== '') {
					try {
						data = JSON.parse(raw) as JsonObject
					} catch {
						self.log('warn', `"Any obs-multisite request": the data is not valid JSON: ${raw}`)
						return
					}
				}
				// Encoder commands answer with the encoder document; everything
				// else with the decoder's. Getting this wrong only mislabels the
				// reply, so it is a best guess by namespace rather than a table.
				const half = request.startsWith('encoder/') ? 'encoder' : 'decoder'
				await self.command(request, data, half)
			},
		},
	}

	// An appliance is a receiver. Offering it "Go live", "End" or a marker
	// button would be offering buttons whose only possible outcome is a
	// refusal, which is worse than not offering them.
	if (!self.isObs) {
		actions.encoder_go_live = undefined
		actions.encoder_end = undefined
		actions.encoder_marker = undefined
	}

	self.setActionDefinitions(actions)
}
