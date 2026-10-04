//
// seek.spec.ts — a clock time as a position in a player's programme
// (companion-module#1), and the two Outpost feedbacks that are rules rather
// than a field read straight off the status.
//
// Every start time is built with the local Date constructor, as the
// conversion builds its candidates, so the spec holds in any time zone.
//
import { describe, expect, it } from 'vitest'

import { timeOfDayToMedia } from './state.js'
import { runningHot, soundPresent } from './feedbacks.js'

const H = 3600_000
const at = (h: number, m = 0) => h * 3600 + m * 60

describe('timeOfDayToMedia', () => {
	const tenAm = new Date(2026, 8, 27, 10, 0, 0).getTime()

	it('finds a clock time inside a programme as media time from its start', () => {
		const status = { started_ms: tenAm, earliest_ms: 0, live_ms: 2 * H }
		expect(timeOfDayToMedia(at(10, 30), status)).toEqual({ ms: 0.5 * H, clamped: '' })
		expect(timeOfDayToMedia(at(10, 0), status)).toEqual({ ms: 0, clamped: '' })
		expect(timeOfDayToMedia(at(12, 0), status)).toEqual({ ms: 2 * H, clamped: '' })
	})

	it('is not the seconds from midnight a plugin takes', () => {
		// The bug: 10:30 sent as-is is 10.5 hours into the programme.
		const plan = timeOfDayToMedia(at(10, 30), { started_ms: tenAm, live_ms: 2 * H })
		expect(plan?.ms).not.toBe(at(10, 30) * 1000)
	})

	it('follows a programme across midnight', () => {
		const elevenPm = new Date(2026, 8, 27, 23, 0, 0).getTime()
		const status = { started_ms: elevenPm, earliest_ms: 0, live_ms: 2 * H }
		expect(timeOfDayToMedia(at(23, 30), status)).toEqual({ ms: 0.5 * H, clamped: '' })
		expect(timeOfDayToMedia(at(0, 30), status)).toEqual({ ms: 1.5 * H, clamped: '' })
	})

	it('moves a time outside the programme to the nearer edge, and says which', () => {
		const status = { started_ms: tenAm, earliest_ms: 5 * 60_000, live_ms: 2 * H }
		expect(timeOfDayToMedia(at(9, 0), status)).toEqual({ ms: 5 * 60_000, clamped: 'before' })
		expect(timeOfDayToMedia(at(10, 1), status)).toEqual({ ms: 5 * 60_000, clamped: 'before' })
		expect(timeOfDayToMedia(at(13, 0), status)).toEqual({ ms: 2 * H, clamped: 'after' })
	})

	it('covers a finished recording to its end', () => {
		const status = { started_ms: tenAm, earliest_ms: 0, live_ms: 0, total_ms: 1.5 * H }
		expect(timeOfDayToMedia(at(11, 15), status)).toEqual({ ms: 1.25 * H, clamped: '' })
	})

	it('takes the later of two where a programme runs past a day', () => {
		const status = { started_ms: tenAm, earliest_ms: 0, live_ms: 26 * H }
		expect(timeOfDayToMedia(at(11, 0), status)).toEqual({ ms: 25 * H, clamped: '' })
	})

	it('cannot place a time without the programme’s start', () => {
		expect(timeOfDayToMedia(at(10, 30), { live_ms: 2 * H })).toBeNull()
		expect(timeOfDayToMedia(at(10, 30), { started_ms: 0, live_ms: 2 * H })).toBeNull()
	})
})

describe('soundPresent', () => {
	it('is the AES67 receiver’s word, or programme peaks above silence', () => {
		expect(soundPresent({ receiving: true })).toBe(true)
		expect(soundPresent({ receiving: false, live: true, peak_dbfs: -20 })).toBe(true)
		expect(soundPresent({ receiving: false, live: true, peak_dbfs: -90 })).toBe(false)
		expect(soundPresent({ live: false, peak_dbfs: -20 })).toBe(false)
		expect(soundPresent(undefined)).toBe(false)
	})
})

describe('runningHot', () => {
	it('lights within the margin of the box’s own throttle point, or while it throttles', () => {
		expect(runningHot({ temp_c: 64, throttle_c: 75 }, 10)).toBe(false)
		expect(runningHot({ temp_c: 65, throttle_c: 75 }, 10)).toBe(true)
		expect(runningHot({ temp_c: 50, throttle_c: 75, throttling: true }, 10)).toBe(true)
		expect(runningHot({ temp_c: 70, throttle_c: null }, 10)).toBe(false)
		expect(runningHot(null, 10)).toBe(false)
	})
})
