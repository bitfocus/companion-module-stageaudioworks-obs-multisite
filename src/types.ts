import type { JsonObject } from '@companion-module/base'

/**
 * What this connection is pointed at.
 *
 * The same controls over three wires. OBS runs the plugin, which answers
 * obs-websocket vendor requests. A campus player appliance has no OBS at all
 * and answers plain HTTP. An Outpost box (MultisiteOS) runs that same player,
 * or an encoder, behind its own page on port 80, which passes the operator's
 * controls through. Everything above the transport — the actions, the
 * feedbacks, the variables, the presets — is written once and works against
 * any of them.
 */
export type ConnectionType = 'obs' | 'appliance' | 'outpost'

/** Which of its two shapes an Outpost box is in; '' until it has said. */
export type BoxShape = 'decoder' | 'encoder' | ''

/**
 * The connection fields. The password is deliberately NOT here: it is a
 * secret-text field, so Companion stores it in its secrets store rather than in
 * the config that is reported to the web UI.
 */
export type ModuleConfig = {
	connection_type?: ConnectionType
	host: string
	/** 0 means "the default for this kind of connection" — see defaultPortFor(). */
	port: number
}

export type ModuleSecrets = {
	password?: string
}

/**
 * The encoder half's status document, as far as this module reads it. Every
 * field is optional: the plugin and this module version independently, and a
 * module that demanded a field the plugin does not send would break on the
 * first version skew.
 */
export interface EncoderStatus {
	role?: string
	version?: string
	locked?: boolean
	live?: boolean
	event_id?: string
	event_name?: string
	uptime_s?: number
	confirmed?: number
	pending?: number
	retries?: number
	bytes?: number
	last_error?: string
	link_health?: number
	link_known?: boolean
	colo?: string
	storage_host?: string
	upload_bytes_per_s?: number
	room_id?: string
	bucket?: string
	configured?: boolean
	marker_labels?: string[]

	// An Outpost encoder's own document (multisite-outpost's /api/status).
	// transport-outpost.ts fills the plugin's names above from it (live,
	// room_id, confirmed, pending, link_*), so the existing feedbacks and
	// variables read either; these are what only an Outpost says.
	/** idle | waiting | recording | stopping | checking */
	state?: string
	/** multisite | web */
	mode?: string
	message?: string
	source?: string
	encoder?: string
	out_fps?: number
	started_unix_ms?: number
	/** The state in a word for a button: Recording, Streaming, Waiting, … */
	status_text?: string
	upload?: {
		configured?: boolean
		room_id?: string
		pending?: number
		confirmed?: number
		retries?: number
		bytes?: number
		/** healthy | degraded | offline */
		link?: string
		error?: string
	}
	web?: {
		configured?: boolean
		address?: string
		/** stopped | connecting | sending | retrying */
		state?: string
		message?: string
		sent_s?: number
		speed?: number
		restarts?: number
		dropped_s?: number
	}
	audio?: {
		source?: string
		live?: boolean
		peak_dbfs?: number
		receiving?: boolean
		error?: string
		ptp?: { known?: boolean; locked?: boolean }
	}
}

export interface DecoderMarker {
	label: string
	id: string
	at_ms: number
	/** The site that set the cue ("Campus B"); absent or empty means the main site. */
	author?: string
}

/**
 * The decoder half's status document. Field names follow the campus player's
 * own page, which the plugin mirrors.
 */
export interface DecoderStatus {
	role?: string
	version?: string
	locked?: boolean
	source_locked?: boolean
	have_source?: boolean
	room_id?: string
	room_state?: number
	event_id?: string
	pinned_event_id?: string
	live_elsewhere?: boolean
	live_event_id?: string
	playing?: boolean
	paused?: boolean
	buffering?: boolean
	loading?: boolean
	ended?: boolean
	at_end?: boolean
	interrupted?: boolean
	playhead_ms?: number
	live_ms?: number
	earliest_ms?: number
	started_ms?: number
	end_ms?: number
	total_ms?: number
	seek_target_ms?: number
	behind_live_s?: number
	buffered_ahead_s?: number
	cached_segments?: number
	link_health?: number
	link_known?: boolean
	last_error?: string
	colo?: string
	storage_host?: string
	download_bytes_per_s?: number
	audio_channels?: number
	audio_track_label?: string
	current_marker?: string
	channel_labels?: string[]
	markers?: DecoderMarker[]
	configured?: boolean
	/** The player's own answer: a recording, not a live feed. Absent from the plugin. */
	plays_as_recording?: boolean
}

/** An Outpost box's CPU, memory and temperature (its page's /api/system). */
export interface BoxSystem {
	cpu?: number
	temp_c?: number | null
	throttle_c?: number | null
	throttling?: boolean
}

export interface EventEntry {
	event_id: string
	name: string
	started_ms: number
	duration_s: number
	state: number
}

export interface EventsResponse {
	loading?: boolean
	listed_once?: boolean
	error?: string
	events?: EventEntry[]
}

export function asJsonObject(value: unknown): JsonObject {
	return value !== null && typeof value === 'object' ? (value as JsonObject) : {}
}
