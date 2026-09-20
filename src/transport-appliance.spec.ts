//
// transport-appliance.spec.ts — the mapping from our command names to a
// campus player's routes.
//
// This is where the two ends genuinely differ, so it is where a mistake is
// quiet: a wrong path is a button that does nothing, and a wrong parameter name
// is a jog that goes nowhere. The mapping is pure, so it is checked here with
// no player, no socket and no network.
//
import { describe, expect, it } from 'vitest'

import { applianceOperations, applianceRequest } from './transport-appliance.js'

describe('applianceRequest', () => {
	it('reads status with a GET and no arguments', () => {
		expect(applianceRequest('decoder/status')).toEqual({ method: 'GET', path: '/api/status', query: {} })
	})

	it('sends a transport control with no arguments', () => {
		expect(applianceRequest('decoder/hold')).toEqual({ method: 'POST', path: '/api/hold', query: {} })
		expect(applianceRequest('decoder/continue')).toEqual({ method: 'POST', path: '/api/continue', query: {} })
		expect(applianceRequest('decoder/catch-up')).toEqual({ method: 'POST', path: '/api/catch-up', query: {} })
	})

	it('keeps a negative jog negative', () => {
		// The sign is the whole point of a jog, and a query string is exactly
		// where a minus sign gets lost.
		expect(applianceRequest('decoder/jog', { seconds: -10 })).toEqual({
			method: 'POST',
			path: '/api/jog',
			query: { seconds: '-10' },
		})
	})

	it('passes seek, delay and marker through under the player’s own names', () => {
		expect(applianceRequest('decoder/seek', { ms: 1234 })?.query).toEqual({ ms: '1234' })
		expect(applianceRequest('decoder/delay', { seconds: 30 })?.query).toEqual({ seconds: '30' })
		expect(applianceRequest('decoder/marker', { id: 'sermon' })?.query).toEqual({ id: 'sermon' })
	})

	it('sends a cue the campus authors, under the player’s own label name', () => {
		expect(applianceRequest('decoder/cue', { label: 'Our notice' })).toEqual({
			method: 'POST',
			path: '/api/cue',
			query: { label: 'Our notice' },
		})
	})

	it('renames the two commands that differ', () => {
		// The plugin calls these return-to-live and load-event; a player calls
		// them follow-live and load, and load takes `event`, not `event_id`.
		expect(applianceRequest('decoder/return-to-live')).toEqual({
			method: 'POST',
			path: '/api/follow-live',
			query: {},
		})
		expect(applianceRequest('decoder/load-event', { event_id: 'evt-7' })).toEqual({
			method: 'POST',
			path: '/api/load',
			query: { event: 'evt-7' },
		})
	})

	it('leaves an argument out rather than sending an empty one', () => {
		expect(applianceRequest('decoder/jog')?.query).toEqual({})
		// These routes take scalars. Anything else is dropped rather than sent
		// as "[object Object]" for the player to ignore.
		expect(applianceRequest('decoder/jog', { seconds: { nope: true } })?.query).toEqual({})
	})

	it('refuses what a player has no route for', () => {
		// A player only ever receives, and the encoder commands belong to a
		// main site.
		expect(applianceRequest('encoder/go-live')).toBeNull()
		expect(applianceRequest('encoder/end')).toBeNull()
		expect(applianceRequest('decoder/settings')).toBeNull()
		expect(applianceRequest('something/invented')).toBeNull()
	})
})

describe('applianceOperations', () => {
	it('is exactly what a player can be asked to do', () => {
		// A snapshot, so removing or renaming a route is a deliberate edit here
		// rather than a button that quietly stops working.
		expect(applianceOperations().sort()).toEqual(
			[
				'decoder/status',
				'decoder/play',
				'decoder/stop',
				'decoder/hold',
				'decoder/continue',
				'decoder/catch-up',
				'decoder/jog',
				'decoder/seek',
				'decoder/delay',
				'decoder/marker',
				'decoder/cue',
				'decoder/load-event',
				'decoder/return-to-live',
				'decoder/events',
				'decoder/events/refresh',
			].sort(),
		)
	})

	it('gives every operation a real path', () => {
		for (const operation of applianceOperations()) {
			const request = applianceRequest(operation)
			expect(request, operation).not.toBeNull()
			expect(request?.path.startsWith('/api/'), operation).toBe(true)
		}
	})
})
