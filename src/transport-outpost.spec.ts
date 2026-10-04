//
// transport-outpost.spec.ts — an Outpost box, through its page.
//
// The route table is checked against the page's own list of what it leaves
// open without its admin PIN, so this module can never come to depend on a
// route that a box with a PIN refuses. The transport itself is run against a
// fake page on a real socket: the shape changing under it, a locked player's
// 409, and the box going away and coming back.
//
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import {
	normaliseOutpostEncoder,
	outpostOperations,
	outpostRequest,
	OutpostTransport,
	parseSchedule,
} from './transport-outpost.js'

// multisite-os appliance/ui/server.py: OPERATOR_PLAYER and OPERATOR_ENCODER,
// the POSTs the page takes without the PIN. Copied, not imported: the page is
// another repository, and a change there should be a deliberate edit here.
const OPERATOR_PLAYER = [
	'play',
	'hold',
	'continue',
	'stop',
	'toggle',
	'catch-up',
	'seek',
	'jog',
	'delay',
	'marker',
	'cue',
	'lock',
	'load',
	'follow-live',
	'events/refresh',
]
const OPERATOR_ENCODER = ['start', 'stop', 'check/start', 'check/stop']
// And OPERATOR_PATHS, whole paths: skipping the next scheduled service (0.2.69).
const OPERATOR_PATHS = ['/api/schedule/skip']

describe('outpostRequest', () => {
	it('sends the player’s routes through the page, under /api/player', () => {
		expect(outpostRequest('decoder/status')).toEqual({ method: 'GET', path: '/api/player/status', query: {} })
		expect(outpostRequest('decoder/hold')).toEqual({ method: 'POST', path: '/api/player/hold', query: {} })
		expect(outpostRequest('decoder/jog', { seconds: -10 })).toEqual({
			method: 'POST',
			path: '/api/player/jog',
			query: { seconds: '-10' },
		})
		expect(outpostRequest('decoder/load-event', { event_id: 'evt-7' })).toEqual({
			method: 'POST',
			path: '/api/player/load',
			query: { event: 'evt-7' },
		})
		expect(outpostRequest('decoder/lock', { on: 0 })).toEqual({
			method: 'POST',
			path: '/api/player/lock',
			query: { on: '0' },
		})
		expect(outpostRequest('decoder/toggle')).toEqual({ method: 'POST', path: '/api/player/toggle', query: {} })
	})

	it('sends the encoder’s under /api/encoder, by this module’s names', () => {
		expect(outpostRequest('encoder/status')).toEqual({ method: 'GET', path: '/api/encoder/status', query: {} })
		expect(outpostRequest('encoder/go-live')).toEqual({ method: 'POST', path: '/api/encoder/start', query: {} })
		expect(outpostRequest('encoder/end')).toEqual({ method: 'POST', path: '/api/encoder/stop', query: {} })
		expect(outpostRequest('encoder/check-start')).toEqual({
			method: 'POST',
			path: '/api/encoder/check/start',
			query: {},
		})
		expect(outpostRequest('encoder/check-stop')).toEqual({
			method: 'POST',
			path: '/api/encoder/check/stop',
			query: {},
		})
	})

	it('says plainly what an Outpost cannot do yet', () => {
		expect(outpostRequest('encoder/marker')).toEqual({
			refused: 'an Outpost encoder cannot drop a marker yet: the box has no route for it',
		})
		expect(outpostRequest('decoder/settings')).toEqual({
			refused: 'decoder/settings is not something an Outpost box can do',
		})
	})

	it('posts only to routes the page leaves open without its PIN', () => {
		for (const op of outpostOperations()) {
			const req = outpostRequest(op)
			if ('refused' in req || req.method !== 'POST') continue
			const player = req.path.match(/^\/api\/player\/(.+)$/)
			const encoder = req.path.match(/^\/api\/encoder\/(.+)$/)
			if (player) expect(OPERATOR_PLAYER, op).toContain(player[1])
			else if (encoder) expect(OPERATOR_ENCODER, op).toContain(encoder[1])
			else expect(OPERATOR_PATHS, op).toContain(req.path)
		}
	})

	it('skips the next service with a JSON body, as the page reads it', () => {
		expect(outpostRequest('schedule/skip', { skip: true })).toEqual({
			method: 'POST',
			path: '/api/schedule/skip',
			query: {},
			body: '{"skip":true}',
		})
		expect(outpostRequest('schedule/skip', { skip: false })).toMatchObject({ body: '{"skip":false}' })
	})

	it('reads only status, events, the box’s state, its readings and its schedule', () => {
		const gets = outpostOperations()
			.map((op) => outpostRequest(op))
			.filter((r) => !('refused' in r) && r.method === 'GET')
			.map((r) => ('path' in r ? r.path : ''))
			.sort()
		expect(gets).toEqual(
			[
				'/api/encoder/status',
				'/api/player/events',
				'/api/player/status',
				'/api/schedule',
				'/api/state',
				'/api/system',
			].sort(),
		)
	})
})

// multisite-os appliance/ui/schedule.py describe(), as /api/schedule's "summary".
const SUMMARY = {
	timezone: 'Europe/London',
	now: null,
	next: {
		key: 'local-0-1030 2026-10-11T10:30',
		name: 'Sunday Service',
		source: 'local',
		start: 'Sun 11 Oct 10:30',
		stop: '12:15',
		start_unix: 1_791_970_200,
		in: '6d 1h',
	},
	skipping: null,
	local_time: '09:12',
	local_date: 'Mon 05 Oct',
}

describe('parseSchedule', () => {
	it('takes the next service, the one running and the skip from the summary', () => {
		expect(parseSchedule({ summary: SUMMARY })).toEqual({
			next: { name: 'Sunday Service', start: 'Sun 11 Oct 10:30', start_unix: 1_791_970_200 },
			now: null,
			skipping: '',
		})
		const running = {
			...SUMMARY,
			now: {
				key: 'k',
				name: '',
				source: 'cloud',
				until: 'Sun 11 Oct 12:15',
				until_unix: 1_791_976_500,
				left: '1h 45m',
			},
			skipping: 'Evening, Sun 11 Oct 18:00',
		}
		expect(parseSchedule({ summary: running })).toMatchObject({
			now: { name: '', until: '12:15', until_unix: 1_791_976_500 },
			skipping: 'Evening, Sun 11 Oct 18:00',
		})
	})

	it('has nothing from a box without a schedule, or nothing scheduled', () => {
		expect(parseSchedule({ error: 'no such endpoint' })).toBeNull()
		expect(parseSchedule({ summary: { ...SUMMARY, next: null } })).toEqual({ next: null, now: null, skipping: '' })
	})
})

describe('normaliseOutpostEncoder', () => {
	it('reads a Multisite recording as the plugin’s live, room, counts and link', () => {
		const doc = normaliseOutpostEncoder({
			state: 'recording',
			mode: 'multisite',
			event_id: 'ev1',
			upload: { configured: true, room_id: 'main', confirmed: 12, pending: 1, link: 'degraded' },
		})
		expect(doc).toMatchObject({
			live: true,
			room_id: 'main',
			confirmed: 12,
			pending: 1,
			link_known: true,
			link_health: 1,
			status_text: 'Recording',
		})
	})

	it('takes the link from the web stream in web mode', () => {
		const at = (state: string) =>
			normaliseOutpostEncoder({ state: 'recording', mode: 'web', web: { state }, upload: { link: 'offline' } })
		expect(at('sending')).toMatchObject({ link_known: true, link_health: 0, status_text: 'Streaming' })
		expect(at('connecting')).toMatchObject({ link_health: 1, status_text: 'Connecting' })
		expect(at('retrying')).toMatchObject({ link_health: 2 })
	})

	it('has no link reading, and is not live, while idle or checking', () => {
		expect(normaliseOutpostEncoder({ state: 'idle', upload: { configured: true, link: 'healthy' } })).toMatchObject({
			live: false,
			link_known: false,
			status_text: 'Idle',
		})
		expect(normaliseOutpostEncoder({ state: 'checking' })).toMatchObject({
			live: false,
			status_text: 'Checking the input',
		})
	})
})

// ── Against a fake page ─────────────────────────────────────────────────────

interface FakeBox {
	shape: 'decoder' | 'encoder'
	locked: boolean
	seen: string[]
	/** undefined: a box from before the schedule (404). */
	skip?: string | null
	/** A box from before 0.2.69, which wants the PIN for a skip. */
	skipNeedsPin?: boolean
}

function page(box: FakeBox) {
	return (req: IncomingMessage, res: ServerResponse): void => {
		const url = req.url ?? ''
		box.seen.push(`${req.method} ${url}`)
		const send = (code: number, body: unknown) => {
			res.writeHead(code, { 'Content-Type': 'application/json' })
			res.end(JSON.stringify(body))
		}
		const path = url.split('?')[0]
		if (path === '/api/state') return send(200, { shape: box.shape, player_reachable: box.shape === 'decoder' })
		if (path === '/api/system')
			return send(200, { now: { cpu: 4, temp_c: 68, throttle_c: 75, throttling: false }, history: [] })
		if (path === '/api/player/status') return send(200, { playing: true, paused: false, locked: box.locked })
		if (path === '/api/player/hold') {
			if (box.locked) return send(409, { error: 'this box is locked', locked: true })
			return send(200, { playing: true, paused: true })
		}
		const schedule = () => ({ summary: { ...SUMMARY, skipping: box.skip ?? null } })
		if (path === '/api/schedule' && box.skip !== undefined) return send(200, schedule())
		if (path === '/api/schedule/skip' && box.skip !== undefined) {
			if (box.skipNeedsPin) return send(403, { error: 'setup is locked', pin_required: true })
			let body = ''
			req.on('data', (c) => (body += c))
			req.on('end', () => {
				box.skip = JSON.parse(body).skip ? 'Sunday Service, Sun 11 Oct 10:30' : null
				send(200, schedule())
			})
			return
		}
		if (path === '/api/encoder/start')
			return send(200, { state: 'recording', mode: 'multisite', upload: { configured: true, room_id: 'main' } })
		return send(404, { error: 'no such endpoint' })
	}
}

async function listen(server: Server, port = 0): Promise<number> {
	await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
	return (server.address() as AddressInfo).port
}

const until = async (check: () => boolean, ms = 2000): Promise<void> => {
	const end = Date.now() + ms
	while (!check()) {
		if (Date.now() > end) throw new Error('timed out')
		await new Promise((r) => setTimeout(r, 10))
	}
}

describe('OutpostTransport', () => {
	const servers: Server[] = []
	const transports: OutpostTransport[] = []
	afterEach(async () => {
		for (const t of transports.splice(0)) await t.disconnect()
		for (const s of servers.splice(0)) await new Promise((r) => s.close(r))
	})

	function start() {
		const log = { connected: 0, disconnected: [] as string[], shapes: 0, info: 0 }
		const t = new OutpostTransport(
			{
				onConnected: () => log.connected++,
				onDisconnected: (reason) => log.disconnected.push(reason),
				onStateEvent: () => {},
				onShapeChanged: () => log.shapes++,
				onBoxInfo: () => log.info++,
			},
			{ boxPollMs: 30 },
		)
		transports.push(t)
		return { t, log }
	}

	it('learns the box’s shape on connecting, and follows it when it changes', async () => {
		const box: FakeBox = { shape: 'decoder', locked: false, seen: [] }
		const server = createServer(page(box))
		servers.push(server)
		const port = await listen(server)
		const { t, log } = start()

		await t.connect('127.0.0.1', port)
		expect([t.isConnected, t.shape, t.hasDecoderHalf, t.hasEncoderHalf]).toEqual([true, 'decoder', true, false])
		expect(log.shapes).toBe(1)

		box.shape = 'encoder'
		await until(() => t.shape === 'encoder')
		expect([t.hasDecoderHalf, t.hasEncoderHalf, log.shapes]).toEqual([false, true, 2])
		await until(() => t.system !== null)
		expect(t.system).toEqual({ cpu: 4, temp_c: 68, throttle_c: 75, throttling: false })
	})

	it('reads an encoder’s schedule, and a skip shows at once', async () => {
		const box: FakeBox = { shape: 'encoder', locked: false, seen: [], skip: null }
		const server = createServer(page(box))
		servers.push(server)
		const { t, log } = start()
		await t.connect('127.0.0.1', await listen(server))
		await until(() => t.schedule !== null)
		expect(t.schedule?.next?.name).toBe('Sunday Service')

		const before = log.info
		const res = await t.call('schedule/skip', { skip: true })
		expect(res.error).toBeUndefined()
		expect(t.schedule?.skipping).toBe('Sunday Service, Sun 11 Oct 10:30')
		expect(log.info).toBeGreaterThan(before)
	})

	it('does not read a schedule a decoder does not have', async () => {
		const box: FakeBox = { shape: 'decoder', locked: false, seen: [], skip: null }
		const server = createServer(page(box))
		servers.push(server)
		const { t } = start()
		await t.connect('127.0.0.1', await listen(server))
		await until(() => t.system !== null)
		await new Promise((r) => setTimeout(r, 80))
		expect([t.schedule, box.seen.some((s) => s.includes('/api/schedule'))]).toEqual([null, false])
	})

	it('has no schedule from a box too old for one', async () => {
		const box: FakeBox = { shape: 'encoder', locked: false, seen: [] }
		const server = createServer(page(box))
		servers.push(server)
		const { t } = start()
		await t.connect('127.0.0.1', await listen(server))
		await until(() => box.seen.includes('GET /api/schedule'))
		expect(t.schedule).toBeNull()
	})

	it('says to update a box that wants its PIN for a skip', async () => {
		const box: FakeBox = { shape: 'encoder', locked: false, seen: [], skip: null, skipNeedsPin: true }
		const server = createServer(page(box))
		servers.push(server)
		const { t } = start()
		await t.connect('127.0.0.1', await listen(server))
		const res = await t.call('schedule/skip', { skip: true })
		expect(res.error).toMatch(/update the box/)
	})

	it('answers a locked player’s 409 in words', async () => {
		const box: FakeBox = { shape: 'decoder', locked: true, seen: [] }
		const server = createServer(page(box))
		servers.push(server)
		const { t } = start()
		await t.connect('127.0.0.1', await listen(server))

		const res = await t.call('decoder/hold')
		expect(res.error).toBe('the controls are locked on the box')
		expect(box.seen).toContain('POST /api/player/hold')
	})

	it('normalises what the encoder answers with', async () => {
		const box: FakeBox = { shape: 'encoder', locked: false, seen: [] }
		const server = createServer(page(box))
		servers.push(server)
		const { t } = start()
		await t.connect('127.0.0.1', await listen(server))

		const res = await t.call('encoder/go-live')
		expect(res).toMatchObject({ live: true, room_id: 'main', status_text: 'Recording' })
		expect(box.seen).toContain('POST /api/encoder/start')
	})

	it('refuses to call something that is not an Outpost box connected', async () => {
		const server = createServer((_req, res) => {
			res.writeHead(200, { 'Content-Type': 'application/json' })
			res.end('{"hello":"world"}')
		})
		servers.push(server)
		const { t } = start()
		await expect(t.connect('127.0.0.1', await listen(server))).rejects.toThrow(/not as an Outpost box/)
		expect(t.isConnected).toBe(false)
	})

	it('reports a box that goes away once, and connects again when it is back', async () => {
		const box: FakeBox = { shape: 'decoder', locked: false, seen: [] }
		let server = createServer(page(box))
		const port = await listen(server)
		const { t, log } = start()
		await t.connect('127.0.0.1', port)

		server.closeAllConnections()
		await new Promise((r) => server.close(r))
		const res = await t.call('decoder/status')
		expect(typeof res.error).toBe('string')
		await t.call('decoder/status')
		expect([t.isConnected, log.disconnected.length]).toEqual([false, 1])

		server = createServer(page(box))
		servers.push(server)
		await listen(server, port)
		await t.connect('127.0.0.1', port)
		expect([t.isConnected, log.connected]).toEqual([true, 2])
	})
})
