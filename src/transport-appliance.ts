//
// transport-appliance.ts — a campus player, over its own HTTP interface.
//
// The appliance is the box under a satellite's television. It has no OBS, no
// obs-websocket and no vendor API: it serves a small JSON API on its own port
// (8080 by default), and its own web page drives exactly the controls this
// module does. So the appliance and the plugin are one set of commands on two
// wires, which is what lets every action, feedback and variable here be written
// once.
//
// Two things are genuinely different, and both are in this file's route table:
// the *names* differ in two places — the plugin's `return-to-live` and
// `load-event` against the player's `follow-live` and `load` — and the player
// takes its arguments as query parameters rather than as a JSON document.
//
// There is no push here either: no events, nothing to subscribe to. So the
// player is polled. Its own web page polls twice a second; once a second is
// enough for a button to feel immediate without being rude to a Pi.
//
import type { JsonObject } from '@companion-module/base'

import { asJsonObject } from './types.js'
import type { Transport, TransportEvents } from './transport.js'

interface Route {
	method: 'GET' | 'POST'
	path: string
	/** This module's parameter name → the name the player's route expects. */
	query?: Record<string, string>
}

/**
 * The appliance's routes, keyed by the command names the plugin uses. Encoder
 * commands are absent on purpose: a player only ever receives.
 */
const ROUTES: Record<string, Route> = {
	'decoder/status': { method: 'GET', path: '/api/status' },
	'decoder/play': { method: 'POST', path: '/api/play' },
	'decoder/stop': { method: 'POST', path: '/api/stop' },
	'decoder/hold': { method: 'POST', path: '/api/hold' },
	'decoder/continue': { method: 'POST', path: '/api/continue' },
	'decoder/catch-up': { method: 'POST', path: '/api/catch-up' },
	'decoder/jog': { method: 'POST', path: '/api/jog', query: { seconds: 'seconds' } },
	'decoder/seek': { method: 'POST', path: '/api/seek', query: { ms: 'ms' } },
	'decoder/delay': { method: 'POST', path: '/api/delay', query: { seconds: 'seconds' } },
	'decoder/marker': { method: 'POST', path: '/api/marker', query: { id: 'id' } },
	'decoder/cue': { method: 'POST', path: '/api/cue', query: { label: 'label' } },
	'decoder/load-event': { method: 'POST', path: '/api/load', query: { event_id: 'event' } },
	'decoder/return-to-live': { method: 'POST', path: '/api/follow-live' },
	'decoder/events': { method: 'GET', path: '/api/events' },
	'decoder/events/refresh': { method: 'POST', path: '/api/events/refresh' },
}

/** The commands an appliance can be given. Exposed so a test can pin the list. */
export function applianceOperations(): string[] {
	return Object.keys(ROUTES)
}

export interface ApplianceRequest {
	method: 'GET' | 'POST'
	path: string
	query: Record<string, string>
}

/**
 * Turn one of this module's command names into a request the player will
 * understand. `null` means the player cannot do it — an encoder command, or a
 * name from a newer plugin — and the caller turns that into a refusal the
 * operator can read rather than a call to nowhere.
 *
 * Pure, so the mapping is tested without a player, a socket or a network.
 */
export function applianceRequest(operation: string, params: JsonObject = {}): ApplianceRequest | null {
	const route = ROUTES[operation]
	if (!route) return null

	const query: Record<string, string> = {}
	for (const [ours, theirs] of Object.entries(route.query ?? {})) {
		const value = params[ours]
		// These routes take scalars. Anything else is a caller mistake, and
		// stringifying an object would send "[object Object]" to a player that
		// would quietly ignore it.
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			query[theirs] = String(value)
		}
	}
	return { method: route.method, path: route.path, query }
}
function safeJson(text: string): unknown {
	try {
		return JSON.parse(text)
	} catch {
		return {}
	}
}

export class ApplianceTransport implements Transport {
	readonly kind = 'appliance' as const
	/** Asked, not told: this is the only way the state ever arrives. */
	readonly pollIntervalMs = 1000
	readonly hasEncoderHalf = false

	private readonly events: TransportEvents
	private base = ''
	private up = false

	constructor(events: TransportEvents) {
		this.events = events
	}

	get isConnected(): boolean {
		return this.up
	}

	async connect(host: string, port: number): Promise<void> {
		this.base = `http://${host}:${port}`
		this.up = false
		// Prove it answers before claiming a connection. A box that is switched
		// off, or something that is not a player at all, must not read as
		// "connected" — that is how an operator ends up pressing buttons at a
		// device that was never there.
		const probe = await this.call('decoder/status')
		if (typeof probe.error === 'string') throw new Error(probe.error)
		this.up = true
		this.events.onConnected()
	}

	async disconnect(): Promise<void> {
		this.up = false
	}

	async call(operation: string, params: JsonObject = {}): Promise<JsonObject> {
		const request = applianceRequest(operation, params)
		if (!request) {
			return { error: `${operation} is not something a campus player can do` }
		}

		const query = new URLSearchParams(request.query).toString()
		const url = this.base + request.path + (query ? `?${query}` : '')

		try {
			const res = await fetch(url, { method: request.method, signal: AbortSignal.timeout(5000) })
			const body = asJsonObject(safeJson(await res.text()))
			// The player refuses a locked control with its own message and 409.
			// Any other non-2xx still has to reach the operator as words.
			if (!res.ok && typeof body.error !== 'string') {
				return { ...body, error: `the campus player answered ${res.status}` }
			}
			return body
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error)
			// A player that has gone away is a disconnection, not a failed
			// command: report it once and let the module reconnect. Only when we
			// had believed we were connected — a probe during connect() is
			// already reported by the throw that ends it.
			if (this.up) {
				this.up = false
				this.events.onDisconnected(reason)
			}
			return { error: reason }
		}
	}
}
