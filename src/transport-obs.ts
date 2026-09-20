//
// transport-obs.ts — obs-websocket, and the one place the plugin's vendor API
// is spoken to.
//
// This module does NOT share a connection with Companion's OBS Studio module:
// Companion modules each own their connection, so this one takes the same host,
// port and password and opens its own. Worth saying plainly, because it means
// the operator types those three things twice.
//
import OBSWebSocket from 'obs-websocket-js'
import type { JsonObject } from '@companion-module/base'

import { asJsonObject } from './types.js'
import type { Transport, TransportEvents } from './transport.js'

/** The vendor name the obs-multisite plugin registers with rather than one the client chooses. */
export const VENDOR_NAME = 'obs-multisite'

/** The event types the plugin emits; anything else under this vendor is ignored. */
export const EVENT_ENCODER_STATE = 'encoder/state'
export const EVENT_DECODER_STATE = 'decoder/state'

export class ObsTransport implements Transport {
	readonly kind = 'obs' as const
	/** Events carry the news here, so this is only the safety net. */
	readonly pollIntervalMs = 5000
	readonly hasEncoderHalf = true

	private readonly ws = new OBSWebSocket()
	private readonly events: TransportEvents
	private connected = false

	constructor(events: TransportEvents) {
		this.events = events

		this.ws.on('ConnectionOpened', () => {
			this.connected = true
		})
		this.ws.on('ConnectionClosed', (error) => {
			this.connected = false
			this.events.onDisconnected(error?.message ?? 'the connection closed')
		})
		this.ws.on('ConnectionError', (error) => {
			this.connected = false
			this.events.onDisconnected(error?.message ?? 'the connection failed')
		})
		this.ws.on('VendorEvent', ({ vendorName, eventType, eventData }) => {
			if (vendorName !== VENDOR_NAME) return
			if (eventType === EVENT_ENCODER_STATE) this.events.onStateEvent('encoder', asJsonObject(eventData))
			else if (eventType === EVENT_DECODER_STATE) this.events.onStateEvent('decoder', asJsonObject(eventData))
		})
	}

	get isConnected(): boolean {
		return this.connected
	}

	async connect(host: string, port: number, password: string): Promise<void> {
		await this.ws.connect(`ws://${host}:${port}`, password || undefined)
		this.connected = true
		this.events.onConnected()
	}

	async disconnect(): Promise<void> {
		this.connected = false
		try {
			await this.ws.disconnect()
		} catch {
			// Already gone. Disconnecting a socket that is not there is not a fault.
		}
	}

	async call(operation: string, params: JsonObject = {}): Promise<JsonObject> {
		const res = await this.ws.call('CallVendorRequest', {
			vendorName: VENDOR_NAME,
			requestType: operation,
			requestData: params,
		})
		return asJsonObject(res.responseData)
	}
}
