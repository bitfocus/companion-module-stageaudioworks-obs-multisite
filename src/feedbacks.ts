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
	}

	// As with the actions: an appliance has no encoder, so there is no reading
	// for a button to light up about.
	if (!self.isObs) {
		feedbacks.encoder_live = undefined
		feedbacks.encoder_link_health = undefined
	}

	self.setFeedbackDefinitions(feedbacks)
}
