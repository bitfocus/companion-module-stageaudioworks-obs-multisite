//
// transport-outpost.ts — an Outpost box (MultisiteOS), through its own page.
//
// An Outpost box is either a campus decoder, running the same player as the
// campus player appliance, or a main-site encoder. Which one is its "shape",
// and it can change. Its player and encoder bind their APIs to loopback; the
// only way in from the network is the box's page on port 80, which passes the
// operator's controls through, under /api/player/... and /api/encoder/....
//
// That page gates its setup behind an admin PIN, but it leaves every control a
// service needs open without one, and every read. So this module needs no
// password, and it must never call anything else: a setup route would answer
// 403 on a box with a PIN, which in a service is a button that does nothing.
// The route table below is only operator routes, and the spec pins it against
// the page's own list.
//
// Nothing is pushed. The current shape's status is polled once a second, as a
// campus player's is; the box's own state (its shape, its temperature) every
// five seconds, since a box that changes shape is a box someone is setting up,
// not one in a service.
//
import type { JsonObject } from '@companion-module/base'

import { asJsonObject, type BoxShape, type BoxSystem, type EncoderStatus } from './types.js'
import type { Transport, TransportEvents } from './transport.js'
import { ROUTES as PLAYER_ROUTES, type Route } from './transport-appliance.js'

/** The player's routes, as the box's page passes them through. */
const DECODER_ROUTES: Record<string, Route> = Object.fromEntries(
	Object.entries(PLAYER_ROUTES).map(([op, route]) => [
		op,
		{ ...route, path: route.path.replace(/^\/api\//, '/api/player/') },
	]),
)

/** The encoder's, under the names this module already uses for the plugin's. */
const ENCODER_ROUTES: Record<string, Route> = {
	'encoder/status': { method: 'GET', path: '/api/encoder/status' },
	'encoder/go-live': { method: 'POST', path: '/api/encoder/start' },
	'encoder/end': { method: 'POST', path: '/api/encoder/stop' },
	'encoder/check-start': { method: 'POST', path: '/api/encoder/check/start' },
	'encoder/check-stop': { method: 'POST', path: '/api/encoder/check/stop' },
}

/** The box's own, whichever shape it is. */
const BOX_ROUTES: Record<string, Route> = {
	'box/state': { method: 'GET', path: '/api/state' },
	'box/system': { method: 'GET', path: '/api/system' },
}

const ROUTES: Record<string, Route> = { ...DECODER_ROUTES, ...ENCODER_ROUTES, ...BOX_ROUTES }

/**
 * Commands this module has that an Outpost cannot do yet, and why, so the
 * button says so rather than failing without a word.
 */
const NOT_YET: Record<string, string> = {
	'encoder/marker': 'an Outpost encoder cannot drop a marker yet: the box has no route for it',
}

/** The commands an Outpost box can be given. Exposed so a test can pin the list. */
export function outpostOperations(): string[] {
	return Object.keys(ROUTES)
}

export interface OutpostRequest {
	method: 'GET' | 'POST'
	path: string
	query: Record<string, string>
}

/**
 * One of this module's command names as a request to the box's page, or a
 * reason it cannot be one. Pure, so the mapping is tested without a box.
 */
export function outpostRequest(operation: string, params: JsonObject = {}): OutpostRequest | { refused: string } {
	const route = ROUTES[operation]
	if (!route) return { refused: NOT_YET[operation] ?? `${operation} is not something an Outpost box can do` }
	const query: Record<string, string> = {}
	for (const [ours, theirs] of Object.entries(route.query ?? {})) {
		const value = params[ours]
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			query[theirs] = String(value)
		}
	}
	return { method: route.method, path: route.path, query }
}

const LINK_HEALTH: Record<string, number> = { healthy: 0, degraded: 1, offline: 2 }

/**
 * An Outpost encoder's status, with the plugin's field names filled in from
 * it, so the feedbacks and variables written for the plugin read either.
 *
 * - `live` while it is recording (Multisite mode) or streaming (web mode).
 * - The link, while it is going: the upload's in Multisite mode, and in web
 *   mode the stream's — sending is healthy, retrying is offline, and anything
 *   in between (connecting) is degraded.
 */
export function normaliseOutpostEncoder(raw: JsonObject): EncoderStatus & JsonObject {
	const doc = raw as EncoderStatus & JsonObject
	const upload = doc.upload ?? {}
	const web = doc.web ?? {}
	const state = doc.state ?? ''
	const going = state === 'recording' || state === 'waiting'
	const isWeb = doc.mode === 'web'

	let link_known = false
	let link_health: number | undefined
	if (going && isWeb) {
		link_known = true
		link_health = web.state === 'sending' ? 0 : web.state === 'retrying' ? 2 : 1
	} else if (going && upload.configured && upload.link !== undefined && upload.link in LINK_HEALTH) {
		link_known = true
		link_health = LINK_HEALTH[upload.link]
	}

	let status_text = 'Idle'
	if (state === 'recording') status_text = isWeb ? (web.state === 'sending' ? 'Streaming' : 'Connecting') : 'Recording'
	else if (state === 'waiting') status_text = 'Waiting for a picture'
	else if (state === 'stopping') status_text = 'Ending'
	else if (state === 'checking') status_text = 'Checking the input'

	return {
		...doc,
		live: state === 'recording',
		room_id: upload.room_id ?? '',
		confirmed: upload.confirmed ?? 0,
		pending: upload.pending ?? 0,
		retries: upload.retries ?? 0,
		bytes: upload.bytes ?? 0,
		last_error: upload.error ?? '',
		configured: upload.configured ?? false,
		link_known,
		...(link_health !== undefined ? { link_health } : {}),
		status_text,
	}
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text)
	} catch {
		return {}
	}
}

export interface OutpostOptions {
	/** How often to read the box's shape and temperature. Shorter in tests. */
	boxPollMs?: number
}

export class OutpostTransport implements Transport {
	readonly kind = 'outpost' as const
	readonly pollIntervalMs = 1000

	/** Which shape the box last said it was in. */
	shape: BoxShape = ''
	/** The box's CPU, memory and temperature, when its page has them. */
	system: BoxSystem | null = null

	private readonly events: TransportEvents
	private readonly boxPollMs: number
	private base = ''
	private up = false
	private boxTimer?: NodeJS.Timeout

	constructor(events: TransportEvents, options: OutpostOptions = {}) {
		this.events = events
		this.boxPollMs = options.boxPollMs ?? 5000
	}

	get isConnected(): boolean {
		return this.up
	}

	get hasEncoderHalf(): boolean {
		return this.shape === 'encoder'
	}

	/** Until the box has said, assume the shape most boxes are. */
	get hasDecoderHalf(): boolean {
		return this.shape !== 'encoder'
	}

	async connect(host: string, port: number): Promise<void> {
		this.stopBoxTimer()
		this.base = `http://${host}:${port}`
		this.up = false
		// The box's page answering is the connection: its media process may be
		// starting, or restarting after an update, and that is a state to show,
		// not a failure to connect.
		const state = await this.call('box/state')
		if (typeof state.error === 'string') throw new Error(state.error)
		if (typeof state.shape !== 'string') throw new Error('that answered, but not as an Outpost box does')
		this.up = true
		this.takeBoxState(state)
		void this.readSystem()
		this.boxTimer = setInterval(() => void this.readBox(), this.boxPollMs)
		this.events.onConnected()
	}

	async disconnect(): Promise<void> {
		this.stopBoxTimer()
		this.up = false
	}

	private stopBoxTimer(): void {
		if (this.boxTimer) {
			clearInterval(this.boxTimer)
			this.boxTimer = undefined
		}
	}

	private takeBoxState(state: JsonObject): void {
		const shape: BoxShape = state.shape === 'encoder' ? 'encoder' : 'decoder'
		if (shape !== this.shape) {
			this.shape = shape
			this.events.onShapeChanged?.()
		}
	}

	private async readSystem(): Promise<void> {
		const sys = await this.call('box/system')
		// A box from before its page had readings answers 404: no temperature.
		const now = asJsonObject(sys.now)
		const next: BoxSystem | null =
			typeof sys.error === 'string' || typeof now.cpu !== 'number'
				? null
				: {
						cpu: now.cpu,
						temp_c: typeof now.temp_c === 'number' ? now.temp_c : null,
						throttle_c: typeof now.throttle_c === 'number' ? now.throttle_c : null,
						throttling: now.throttling === true,
					}
		if (JSON.stringify(next) !== JSON.stringify(this.system)) {
			this.system = next
			this.events.onBoxInfo?.()
		}
	}

	private async readBox(): Promise<void> {
		if (!this.up) return
		const state = await this.call('box/state')
		if (typeof state.error === 'string' || typeof state.shape !== 'string') return
		this.takeBoxState(state)
		await this.readSystem()
	}

	async call(operation: string, params: JsonObject = {}): Promise<JsonObject> {
		const request = outpostRequest(operation, params)
		if ('refused' in request) return { error: request.refused }

		const query = new URLSearchParams(request.query).toString()
		const url = this.base + request.path + (query ? `?${query}` : '')

		try {
			const res = await fetch(url, { method: request.method, signal: AbortSignal.timeout(5000) })
			let body = asJsonObject(safeJson(await res.text()))
			if (res.status === 409 && body.locked === true) {
				return { ...body, error: 'the controls are locked on the box' }
			}
			if (res.status === 403 && body.pin_required === true) {
				// Only a setup route is gated, and this module calls none: seeing
				// this means the box's page has changed what it leaves open.
				return { ...body, error: 'the box refused it as setup, which needs its admin PIN' }
			}
			if (!res.ok) {
				return { ...body, error: typeof body.error === 'string' ? body.error : `the box answered ${res.status}` }
			}
			if (operation.startsWith('encoder/')) body = normaliseOutpostEncoder(body)
			return body
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error)
			if (this.up) {
				this.up = false
				this.stopBoxTimer()
				this.events.onDisconnected(reason)
			}
			return { error: reason }
		}
	}
}
