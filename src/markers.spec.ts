//
// markers.spec.ts — resolving a marker from what a button holds.
//
// A marker's id is a timestamp, so nothing readable can carry it on a button.
// Presets therefore carry the *label* and turn it back into a marker at press
// time, which is the only piece of real logic in the marker support: get it
// wrong and the button either does nothing or jumps to the wrong cue.
//
import { describe, expect, it } from 'vitest'

import { decoderMarkers, resolveMarkerId } from './actions.js'
import type { DecoderMarker } from './types.js'

function marker(label: string, id: string, at_ms = 0): DecoderMarker {
	return { label, id, at_ms }
}

describe('decoderMarkers', () => {
	it('lists one entry per cue, not per time it was pressed', () => {
		// The same cue dropped three times is one cue to a volunteer.
		const room = [marker('Sermon Start', 'id-1'), marker('Offering', 'id-2'), marker('Sermon Start', 'id-3')]
		expect(decoderMarkers(room)).toEqual([
			{ label: 'Sermon Start', id: 'id-3' }, // newest wins
			{ label: 'Offering', id: 'id-2' },
		])
	})

	it('is empty for a room with no markers', () => {
		expect(decoderMarkers([])).toEqual([])
	})

	it('falls back to the id when a marker was dropped with no label', () => {
		expect(decoderMarkers([marker('', 'id-9')])).toEqual([{ label: 'id-9', id: 'id-9' }])
	})

	it('carries the site that set the cue', () => {
		// A cue dropped at a campus is never mistaken for the main site's.
		const room: DecoderMarker[] = [
			{ label: 'Notice', id: 'id-4', at_ms: 0, author: 'Campus B' },
			{ label: 'Sermon Start', id: 'id-5', at_ms: 0 },
		]
		expect(decoderMarkers(room)).toEqual([
			{ label: 'Notice', id: 'id-4', author: 'Campus B' },
			{ label: 'Sermon Start', id: 'id-5' },
		])
	})
})

describe('resolveMarkerId', () => {
	const room = [marker('Sermon Start', 'id-1'), marker('Offering', 'id-2'), marker('Sermon Start', 'id-3')]

	it('turns a label into the newest marker of that name', () => {
		expect(resolveMarkerId(room, 'Sermon Start')).toBe('id-3')
		expect(resolveMarkerId(room, 'Offering')).toBe('id-2')
	})

	it('passes an id straight through, for a button configured from the dropdown', () => {
		expect(resolveMarkerId(room, 'id-2')).toBe('id-2')
	})

	it('is empty for nothing, so the caller can skip the request', () => {
		expect(resolveMarkerId(room, '')).toBe('')
	})

	it('passes an unknown name through rather than inventing one', () => {
		// The far end refuses it in words; the button must not quietly send a
		// different cue than the one it names.
		expect(resolveMarkerId(room, 'Sermon End')).toBe('Sermon End')
	})

	it('passes a label through when there are no markers at all', () => {
		expect(resolveMarkerId([], 'Sermon Start')).toBe('Sermon Start')
	})
})
