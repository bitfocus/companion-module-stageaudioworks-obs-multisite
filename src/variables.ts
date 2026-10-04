//
// variables.ts — what the far end is doing, as text a button can show.
//
// The names here are part of the public surface as much as the actions are:
// somebody will put `$(obs-multisite:decoder_behind_live)` on a button and
// expect it to keep meaning what it means. They are declared rather than
// generated, so a typo in a preset is caught rather than silently empty.
//
// The encoder's variables are declared only where there is an encoder: OBS, or
// an Outpost box in its encoder shape. A campus player never sends an encoder
// document, and a variable that can never hold anything is worse than one that
// does not exist: on the variables list it reads as broken. The same goes for
// the decoder's on an Outpost encoder, and for the Outpost's own on anything
// else.
//
import type { CompanionVariableValues } from '@companion-module/base'

import type ModuleInstance from './main.js'
import {
	formatBytes,
	formatClockTime,
	formatCountdown,
	formatDuration,
	formatRate,
	linkHealthText,
	roomStateText,
} from './state.js'

function yesNo(value: boolean | undefined): string {
	return value ? 'yes' : 'no'
}

/** Only an Outpost encoder says these. */
const OUTPOST_ENCODER = [
	'encoder_mode',
	'encoder_web_address',
	'encoder_web_speed',
	'encoder_web_sent',
	'encoder_source',
	'encoder_fps',
]
/** And only an Outpost box these, in either shape. */
const OUTPOST_BOX = ['shape', 'temperature']

/** Drop what this end cannot have. */
function dropAbsent(self: ModuleInstance, values: Record<string, unknown>): void {
	for (const key of Object.keys(values)) {
		if (key.startsWith('encoder_') && !self.offersEncoder) delete values[key]
		else if (key.startsWith('decoder_') && !self.offersDecoder) delete values[key]
		else if (OUTPOST_ENCODER.includes(key) && !self.isOutpost) delete values[key]
		else if (OUTPOST_BOX.includes(key) && !self.isOutpost) delete values[key]
		else if (key.startsWith('schedule_') && !self.offersSchedule) delete values[key]
	}
}

export function UpdateVariables(self: ModuleInstance): void {
	const definitions: Record<string, { name: string }> = {
		// Encoder — the main site.
		encoder_live: { name: 'Encoder — on air (yes/no)' },
		encoder_status: { name: 'Encoder — reading (Live / Idle)' },
		encoder_event_id: { name: 'Encoder — event id' },
		encoder_event_name: { name: 'Encoder — event name' },
		encoder_room: { name: 'Encoder — room' },
		encoder_confirmed: { name: 'Encoder — pieces confirmed in storage' },
		encoder_pending: { name: 'Encoder — pieces waiting to send' },
		encoder_retries: { name: 'Encoder — retries' },
		encoder_bytes: { name: 'Encoder — bytes sent' },
		encoder_upload_rate: { name: 'Encoder — upload rate' },
		encoder_link: { name: 'Encoder — link (Healthy / Degraded / Offline)' },
		encoder_colo: { name: 'Encoder — Cloudflare edge serving the bucket' },
		encoder_version: { name: 'Encoder — plugin version' },
		encoder_mode: { name: 'Encoder — mode (multisite / web)' },
		encoder_web_address: { name: 'Encoder — where the web stream goes' },
		encoder_web_speed: { name: 'Encoder — web stream speed (1.00× keeps up)' },
		encoder_web_sent: { name: 'Encoder — web stream sent so far' },
		encoder_source: { name: 'Encoder — the picture it takes in' },
		encoder_fps: { name: 'Encoder — frames a second it sends' },

		// An Outpost box's own.
		shape: { name: 'Outpost — shape (decoder / encoder)' },
		temperature: { name: 'Outpost — temperature (°C)' },
		schedule_next: { name: 'Schedule — the next service (name, day and time)' },
		schedule_next_in: { name: 'Schedule — time until the next service (12:04, 1:02:15, 2d 3h)' },
		schedule_now: { name: 'Schedule — the service running now, and when it ends' },
		schedule_skipping: { name: 'Schedule — the service being skipped' },

		// Decoder — the campus, either from the plugin or from a player.
		decoder_state: { name: 'Decoder — room state (Unknown/Offline/Live/Ended/Interrupted)' },
		decoder_have_source: { name: 'Decoder — a source exists here (yes/no)' },
		decoder_playing: { name: 'Decoder — playing (yes/no)' },
		decoder_held: { name: 'Decoder — held (yes/no)' },
		decoder_buffering: { name: 'Decoder — buffering (yes/no)' },
		decoder_loading: { name: 'Decoder — loading an event (yes/no)' },
		decoder_ended: { name: 'Decoder — the recording has ended (yes/no)' },
		decoder_behind_live: { name: 'Decoder — how far behind live' },
		decoder_playhead: { name: 'Decoder — playhead (time of day)' },
		decoder_live: { name: 'Decoder — live edge (time of day)' },
		decoder_cached_segments: { name: 'Decoder — pieces downloaded' },
		decoder_link: { name: 'Decoder — link (Healthy / Degraded / Offline)' },
		decoder_current_marker: { name: 'Decoder — marker being played' },
		decoder_event_id: { name: 'Decoder — event id' },
		decoder_room: { name: 'Decoder — room' },
		decoder_version: { name: 'Decoder — plugin version' },
	}

	dropAbsent(self, definitions)

	self.setVariableDefinitions(definitions)
	UpdateVariableValues(self)
}
export function UpdateVariableValues(self: ModuleInstance): void {
	const enc = self.encoderStatus
	const dec = self.decoderStatus
	const sched = self.isConnected ? self.schedule : null

	const values: CompanionVariableValues = {
		encoder_live: yesNo(enc.live),
		encoder_status: enc.status_text ?? (enc.live ? 'Live' : 'Idle'),
		encoder_event_id: enc.event_id ?? '',
		encoder_event_name: enc.event_name ?? '',
		encoder_room: enc.room_id ?? '',
		encoder_confirmed: enc.confirmed ?? 0,
		encoder_pending: enc.pending ?? 0,
		encoder_retries: enc.retries ?? 0,
		encoder_bytes: formatBytes(enc.bytes),
		encoder_upload_rate: formatRate(enc.upload_bytes_per_s),
		encoder_link: enc.link_known ? linkHealthText(enc.link_health) : '',
		encoder_colo: enc.colo ?? '',
		encoder_version: enc.version ?? '',
		encoder_mode: enc.mode ?? '',
		encoder_web_address: enc.web?.address ?? '',
		encoder_web_speed:
			typeof enc.web?.speed === 'number' && enc.web.state === 'sending' ? `${enc.web.speed.toFixed(2)}×` : '',
		encoder_web_sent: enc.web?.state === 'sending' ? formatDuration(enc.web.sent_s) : '',
		encoder_source: enc.source ?? '',
		encoder_fps: typeof enc.out_fps === 'number' && enc.out_fps > 0 ? enc.out_fps.toFixed(2) : '',

		shape: self.shape,
		temperature: self.isConnected && typeof self.boxSystem?.temp_c === 'number' ? self.boxSystem.temp_c.toFixed(0) : '',
		schedule_next: sched?.next ? [sched.next.name, sched.next.start].filter(Boolean).join(', ') : '',
		schedule_next_in: sched?.next ? formatCountdown(sched.next.start_unix - Date.now() / 1000) : '',
		schedule_now: sched?.now ? `${sched.now.name || 'Service'} until ${sched.now.until}` : '',
		schedule_skipping: sched?.skipping ?? '',

		// A campus player does not publish `have_source` — it is always meant to
		// be playing — so an absent one reads as "yes" rather than as a fault.
		// `current_marker` and `version` are the plugin's fields; on a player
		// they are simply blank rather than wrong.
		decoder_state: dec.have_source === false ? 'No source' : roomStateText(dec.room_state),
		decoder_have_source: dec.have_source === undefined ? 'yes' : yesNo(dec.have_source),
		decoder_playing: yesNo(dec.playing),
		decoder_held: yesNo(dec.paused),
		decoder_buffering: yesNo(dec.buffering),
		decoder_loading: yesNo(dec.loading),
		decoder_ended: yesNo(dec.ended || dec.at_end),
		decoder_behind_live: dec.ended || dec.at_end ? '' : formatDuration(dec.behind_live_s),
		decoder_playhead: formatClockTime(dec.playhead_ms),
		decoder_live: formatClockTime(dec.live_ms),
		decoder_cached_segments: dec.cached_segments ?? 0,
		decoder_link: dec.link_known ? linkHealthText(dec.link_health) : '',
		decoder_current_marker: dec.current_marker ?? '',
		decoder_event_id: dec.event_id ?? '',
		decoder_room: dec.room_id ?? '',
		decoder_version: dec.version ?? '',
	}

	dropAbsent(self, values)

	self.setVariableValues(values)
}
