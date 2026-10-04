//
// feedbacks.ts — the lights on the buttons.
//
// This is the whole reason the module exists rather than using Companion's OBS
// module "Custom Vendor Request": an action can press a button, but it cannot
// tell the operator at a glance whether the event is on air, whether the link
// has gone wobbly, or how far behind live the campus is.
//
// Every feedback is boolean: it lights the button, or it does not. The plugin
// pushes a state event when any of these change, and the module also asks on a
// slow timer, so a missed event self-corrects.
//
import type { CompanionFeedbackDefinitions } from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { BoxSchedule } from './types.js'

type NoOptions = Record<string, never>

export type FeedbacksSchema = {
	encoder_live: { type: 'boolean'; options: NoOptions }
	encoder_link_health: { type: 'boolean'; options: { state: string } }
	decoder_playing: { type: 'boolean'; options: NoOptions }
	decoder_held: { type: 'boolean'; options: NoOptions }
	decoder_buffering: { type: 'boolean'; options: NoOptions }
	decoder_loading: { type: 'boolean'; options: NoOptions }
	decoder_no_source: { type: 'boolean'; options: NoOptions }
	decoder_ended: { type: 'boolean'; options: NoOptions }
	decoder_behind_live: { type: 'boolean'; options: { seconds: number } }
	decoder_link_health: { type: 'boolean'; options: { state: string } }
	decoder_locked: { type: 'boolean'; options: NoOptions }
	web_landing: { type: 'boolean'; options: NoOptions }
	checking_input: { type: 'boolean'; options: NoOptions }
	sound_present: { type: 'boolean'; options: NoOptions }
	box_offline: { type: 'boolean'; options: NoOptions }
	running_hot: { type: 'boolean'; options: { margin: number } }
	schedule_running: { type: 'boolean'; options: NoOptions }
	schedule_soon: { type: 'boolean'; options: { minutes: number } }
	schedule_skipped: { type: 'boolean'; options: NoOptions }
}

/**
 * Sound is arriving at an Outpost encoder: its AES67 receiver says so, or its
 * programme peaks are above silence. Exported for the spec.
 */
export function soundPresent(audio: { receiving?: boolean; live?: boolean; peak_dbfs?: number } | undefined): boolean {
	if (!audio) return false
	if (audio.receiving === true) return true
	return audio.live === true && typeof audio.peak_dbfs === 'number' && audio.peak_dbfs > -60
}

/**
 * The next scheduled service starts within this many minutes. Exported for
 * the spec, with the time passed in.
 */
export function startsWithin(schedule: BoxSchedule | null, minutes: number, nowMs = Date.now()): boolean {
	if (!schedule?.next) return false
	const left = schedule.next.start_unix - nowMs / 1000
	return left > 0 && left <= minutes * 60
}

/**
 * The box is at or near the temperature where its kernel slows it down, or is
 * already slowing it down. Exported for the spec.
 */
export function runningHot(
	system: { temp_c?: number | null; throttle_c?: number | null; throttling?: boolean } | null,
	margin: number,
): boolean {
	if (!system) return false
	if (system.throttling === true) return true
	if (typeof system.temp_c !== 'number' || typeof system.throttle_c !== 'number') return false
	return system.temp_c >= system.throttle_c - margin
}

const LINK_CHOICES = [
	{ id: 'degraded', label: 'Degraded (something failed, not yet settled)' },
	{ id: 'offline', label: 'Offline (two failures in a row)' },
]

/** True when the link reading is a real measurement and matches `state`. */
function linkMatches(health: number | undefined, known: boolean | undefined, state: string): boolean {
	if (!known || health === undefined) return false
	if (state === 'degraded') return health === 1
	if (state === 'offline') return health === 2
	return false
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const feedbacks: CompanionFeedbackDefinitions<FeedbacksSchema> = {
		encoder_live: {
			name: 'Encoder: the broadcast is live',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
			options: [],
			callback: () => self.encoderStatus.live === true,
		},

		encoder_link_health: {
			name: 'Encoder: the link is degraded or offline',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xff9900, color: 0x000000 },
			options: [
				{
					id: 'state',
					type: 'dropdown',
					label: 'Which reading',
					default: 'offline',
					choices: LINK_CHOICES,
				},
			],
			callback: (feedback) =>
				linkMatches(
					self.encoderStatus.link_health,
					self.encoderStatus.link_known,
					String(feedback.options.state ?? ''),
				),
		},

		decoder_playing: {
			name: 'Decoder: playing',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x00aa00, color: 0xffffff },
			options: [],
			callback: () => self.decoderStatus.playing === true,
		},

		decoder_held: {
			name: 'Decoder: held (paused)',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xffcc00, color: 0x000000 },
			options: [],
			callback: () => self.decoderStatus.paused === true,
		},

		decoder_buffering: {
			name: 'Decoder: buffering (playing, but nothing decoded yet)',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x0066cc, color: 0xffffff },
			options: [],
			callback: () => self.decoderStatus.buffering === true,
		},

		decoder_loading: {
			name: 'Decoder: loading an event',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x0066cc, color: 0xffffff },
			options: [],
			callback: () => self.decoderStatus.loading === true,
		},

		decoder_no_source: {
			name: 'Decoder: no source on this machine',
			description: 'The fix is in the scene collection, not on this surface — nothing here can make a source exist.',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x880000, color: 0xffffff },
			options: [],
			callback: () => self.decoderStatus.have_source === false,
		},

		decoder_ended: {
			name: 'Decoder: the recording has ended',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x444444, color: 0xffffff },
			options: [],
			callback: () => self.decoderStatus.ended === true || self.decoderStatus.at_end === true,
		},

		decoder_behind_live: {
			name: 'Decoder: more than N seconds behind live',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xff9900, color: 0x000000 },
			options: [
				{
					id: 'seconds',
					type: 'number',
					label: 'Seconds',
					default: 30,
					min: 0,
					max: 14400,
					step: 1,
				},
			],
			callback: (feedback) => {
				// A finished recording is not "behind live"; it is over.
				if (self.decoderStatus.ended === true || self.decoderStatus.at_end === true) return false
				const behind = self.decoderStatus.behind_live_s
				if (typeof behind !== 'number') return false
				return behind > Number(feedback.options.seconds ?? 0)
			},
		},

		decoder_link_health: {
			name: 'Decoder: the link is degraded or offline',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xff9900, color: 0x000000 },
			options: [
				{
					id: 'state',
					type: 'dropdown',
					label: 'Which reading',
					default: 'offline',
					choices: LINK_CHOICES,
				},
			],
			callback: (feedback) =>
				linkMatches(
					self.decoderStatus.link_health,
					self.decoderStatus.link_known,
					String(feedback.options.state ?? ''),
				),
		},

		decoder_locked: {
			name: 'Decoder: the controls are locked',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x663399, color: 0xffffff },
			options: [],
			callback: () => self.decoderStatus.locked === true,
		},

		web_landing: {
			name: 'Outpost encoder: the web stream is landing',
			description: 'Web mode: the stream is being sent and the far end is taking it.',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x00aa00, color: 0xffffff },
			options: [],
			callback: () => self.encoderStatus.web?.state === 'sending',
		},

		checking_input: {
			name: 'Outpost encoder: checking the input',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x0066cc, color: 0xffffff },
			options: [],
			callback: () => self.encoderStatus.state === 'checking',
		},

		sound_present: {
			name: 'Outpost encoder: sound is arriving',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x00aa00, color: 0xffffff },
			options: [],
			callback: () => soundPresent(self.encoderStatus.audio),
		},

		box_offline: {
			name: 'Outpost: the box is not answering',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x880000, color: 0xffffff },
			options: [],
			callback: () => !self.isConnected,
		},

		running_hot: {
			name: 'Outpost: the box is running hot',
			description:
				'Within a margin of the temperature where the box slows itself down, or already slowing down. ' +
				'The throttle point is the box’s own (75 °C on a ROCK 5B).',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xff9900, color: 0x000000 },
			options: [{ id: 'margin', type: 'number', label: 'Within (°C)', default: 10, min: 0, max: 50, step: 1 }],
			callback: (feedback) => runningHot(self.boxSystem, Number(feedback.options.margin ?? 10)),
		},

		schedule_running: {
			name: 'Schedule: a scheduled service is running',
			description: 'Inside a service’s window on the box’s schedule, its preroll included.',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x00aa00, color: 0xffffff },
			options: [],
			callback: () => self.isConnected && self.schedule?.now != null,
		},

		schedule_soon: {
			name: 'Schedule: the next service starts soon',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xff9900, color: 0x000000 },
			options: [{ id: 'minutes', type: 'number', label: 'Within (minutes)', default: 10, min: 1, max: 240, step: 1 }],
			callback: (feedback) => self.isConnected && startsWithin(self.schedule, Number(feedback.options.minutes ?? 10)),
		},

		schedule_skipped: {
			name: 'Schedule: the next service is skipped',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x663399, color: 0xffffff },
			options: [],
			callback: () => self.isConnected && (self.schedule?.skipping ?? '') !== '',
		},
	}

	// As with the actions: what the end cannot have, it is not offered.
	if (!self.offersEncoder) {
		feedbacks.encoder_live = undefined
		feedbacks.encoder_link_health = undefined
	}
	if (!(self.isOutpost && self.offersEncoder)) {
		feedbacks.web_landing = undefined
		feedbacks.checking_input = undefined
		feedbacks.sound_present = undefined
	}
	if (!self.offersSchedule) {
		feedbacks.schedule_running = undefined
		feedbacks.schedule_soon = undefined
		feedbacks.schedule_skipped = undefined
	}
	if (!self.offersDecoder) {
		const all = feedbacks as Record<string, unknown>
		for (const id of Object.keys(all)) if (id.startsWith('decoder_')) all[id] = undefined
	}
	if (!self.isOutpost) {
		feedbacks.box_offline = undefined
		feedbacks.running_hot = undefined
	}

	self.setFeedbackDefinitions(feedbacks)
}
