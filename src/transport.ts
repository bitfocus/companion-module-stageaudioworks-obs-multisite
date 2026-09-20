//
// transport.ts — the wire, and the only place that knows which wire it is.
//
// This module can talk to two things, and they speak different protocols for
// the same controls. OBS runs the obs-multisite plugin and answers
// obs-websocket vendor requests; a campus player appliance has no OBS at all
// and answers plain HTTP JSON. Neither end knows about the other, and nothing
// above this file should have to.
//
// So a transport is: how to open and close the connection, how often it has to
// be asked rather than told, and how to run one named command.
//
import type { JsonObject } from '@companion-module/base'

import type { ConnectionType } from './types.js'

/** Somewhere for a transport to report what the wire is doing. */
export interface TransportEvents {
	onConnected: () => void
	onDisconnected: (reason: string) => void
	/** A pushed state change. Only obs-websocket pushes; an appliance is polled. */
	onStateEvent: (half: 'encoder' | 'decoder', data: JsonObject) => void
}

export interface Transport {
	readonly kind: ConnectionType

	/**
	 * How often to ask when the far end cannot tell us. An obs-websocket
	 * connection is told about changes and only polls as a safety net; an
	 * appliance has to be asked, so it is asked often enough to feel immediate.
	 */
	readonly pollIntervalMs: number

	/** Whether this end has an encoder half at all. A campus player never does. */
	readonly hasEncoderHalf: boolean

	readonly isConnected: boolean

	connect(host: string, port: number, password: string): Promise<void>
	disconnect(): Promise<void>

	/**
	 * Run one command and return its reply: for the plugin, the vendor
	 * request's `responseData`; for an appliance, the status document its route
	 * answers with. A refusal comes back as an `error` field rather than as a
	 * thrown exception, because both ends already report refusals that way and
	 * a button should say why rather than fail silently.
	 */
	call(operation: string, params?: JsonObject): Promise<JsonObject>
}

/** The port to use when the config leaves it at 0. */
export function defaultPortFor(kind: ConnectionType): number {
	return kind === 'appliance' ? 8080 : 4455
}
