import { InstanceBase, InstanceStatus } from '@companion-module/base'
import type { CompanionVariableValues, JsonObject, SomeCompanionConfigField } from '@companion-module/base'

import { GetConfigFields } from './config.js'
import type {
	ConnectionType,
	DecoderStatus,
	EncoderStatus,
	EventsResponse,
	ModuleConfig,
	ModuleSecrets,
} from './types.js'
import { defaultPortFor } from './transport.js'
import type { Transport, TransportEvents } from './transport.js'
import { ObsTransport } from './transport-obs.js'
import { ApplianceTransport } from './transport-appliance.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdateVariables, UpdateVariableValues } from './variables.js'
import { UpdatePresets } from './presets.js'
import { UpgradeScripts } from './upgrades.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: ModuleSecrets
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	// Variables stay untyped: several are built from the document the far end
	// sends, which this module deliberately does not pin to a version.
	variables: CompanionVariableValues
}

export { UpgradeScripts }

/** How long to wait before asking again, at most, after a drop. */
const MAX_RECONNECT_MS = 30_000

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig
	secrets!: ModuleSecrets

	/** The last document each half reported. Empty until the first reply. */
	encoderStatus: EncoderStatus = {}
	decoderStatus: DecoderStatus = {}
	events: EventsResponse = {}

	/** Which halves this machine has. A campus player has no encoder at all. */
	hasEncoder = false
	hasDecoder = false

	private transport?: Transport
	private reconnectTimer?: NodeJS.Timeout
	private pollTimer?: NodeJS.Timeout
	private reconnectDelayMs = 1000
	private destroyed = false

	/**
	 * The lists the dropdowns are built from, as they were when the definitions
	 * were last registered. Companion takes a copy at registration, so a list
	 * that changes afterwards has to be re-registered to be seen.
	 */
	private lastActionChoices = ''
	private definitionTimer?: NodeJS.Timeout

	constructor(internal: unknown) {
		super(internal)
	}

	/** What this connection is pointed at. */
	get connectionType(): ConnectionType {
		return this.config?.connection_type === 'appliance' ? 'appliance' : 'obs'
	}

	/** True when this is OBS with the plugin — the only end with an encoder half. */
	get isObs(): boolean {
		return this.connectionType === 'obs'
	}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets

		this.syncTransport()
		this.refreshDefinitions()

		await this.reconnect()
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets
		// A different end is a different broadcast: forget everything the last
		// one said before pointing at the new one.
		this.encoderStatus = {}
		this.decoderStatus = {}
		this.events = {}
		this.hasEncoder = false
		this.hasDecoder = false

		this.syncTransport()
		this.refreshDefinitions()

		await this.reconnect()
	}

	async destroy(): Promise<void> {
		this.destroyed = true
		this.clearTimers()
		await this.transport?.disconnect()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariables(): void {
		UpdateVariables(this)
	}

	/**
	 * Republish the values only. Redefining the variables drops the values the
	 * host holds for them, so a status change must go through here and not
	 * through updateVariables().
	 */
	publishVariables(): void {
		UpdateVariableValues(this)
	}

	// ── The transport ───────────────────────────────────────────────────────

	private makeTransport(kind: ConnectionType): Transport {
		const events: TransportEvents = {
			onConnected: () => this.handleConnected(),
			onDisconnected: (reason) => this.handleDisconnected(reason),
			onStateEvent: (half, data) => this.handleStateEvent(half, data),
		}
		return kind === 'appliance' ? new ApplianceTransport(events) : new ObsTransport(events)
	}

	/**
	 * Put the right transport in place. Called on start and whenever the config
	 * changes, because changing what this connection points at means starting
	 * again rather than talking to the old end with the new rules.
	 */
	private syncTransport(): void {
		const kind = this.connectionType
		if (this.transport?.kind === kind) return

		const previous = this.transport
		void previous?.disconnect()
		this.transport = this.makeTransport(kind)
	}

	/**
	 * Re-register everything whose shape depends on the end. An appliance cannot
	 * publish an encoder, so offering "Go live" to one would be offering a
	 * button that can only fail.
	 */
	private refreshDefinitions(): void {
		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariables()
		// These definitions were just built from the current lists, so there is
		// nothing for the change check to notice.
		this.lastActionChoices = this.actionChoiceSignature()
	}

	/**
	 * The lists that populate dropdowns and generate per-marker buttons: the
	 * main site's configured markers, this room's own markers, and its
	 * recordings. One string, compared for equality, is enough to notice any of
	 * them changing.
	 */
	private actionChoiceSignature(): string {
		const labels = this.encoderStatus.marker_labels ?? []
		const markers = this.decoderStatus.markers ?? []
		const events = this.events.events ?? []
		return [
			labels.join('\u0001'),
			markers.map((marker) => `${marker.id}:${marker.label}`).join('\u0001'),
			events.map((event) => event.event_id).join('\u0001'),
		].join('\u0002')
	}

	/**
	 * Re-register the actions and the presets when those lists change —
	 * debounced, because a status arriving and the recordings list arriving are
	 * two changes a moment apart and one rebuild covers both.
	 *
	 * Deliberately NOT the variables: redefining those drops the values the host
	 * holds for them, and a marker appearing is no reason for every variable on
	 * every button to blank.
	 */
	private rebuildIfChoicesChanged(): void {
		const signature = this.actionChoiceSignature()
		if (signature === this.lastActionChoices) return
		this.lastActionChoices = signature

		if (this.definitionTimer) clearTimeout(this.definitionTimer)
		this.definitionTimer = setTimeout(() => {
			this.definitionTimer = undefined
			this.updateActions()
			this.updatePresets()
		}, 200)
	}

	// ── Connecting ──────────────────────────────────────────────────────────

	private async reconnect(): Promise<void> {
		this.clearTimers()
		if (!this.transport) this.syncTransport()

		if (!this.config?.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'No host set')
			return
		}

		const port = this.config.port > 0 ? this.config.port : defaultPortFor(this.connectionType)
		this.updateStatus(InstanceStatus.Connecting)
		try {
			await this.transport!.connect(this.config.host, port, this.secrets?.password ?? '')
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error)
			this.updateStatus(InstanceStatus.ConnectionFailure, reason)
			this.scheduleReconnect()
		}
	}

	private scheduleReconnect(): void {
		if (this.destroyed) return
		// One timer, always: a disconnect noticed while a reconnect was already
		// pending must not leave the first one to fire later as well.
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
		const delay = this.reconnectDelayMs
		this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_MS)
		this.reconnectTimer = setTimeout(() => void this.reconnect(), delay)
	}

	private handleConnected(): void {
		this.reconnectDelayMs = 1000
		this.updateStatus(InstanceStatus.Ok)
		this.log('info', this.isObs ? 'connected to OBS' : 'connected to the campus player')
		void this.refreshAll()
		// The recordings list is not in the status document, so it is asked for
		// once here — otherwise the "Load a recording" list stays empty until
		// somebody presses Refresh, which is exactly the sort of thing that
		// gets read as "the module is broken".
		void this.fetchEvents()
		this.pollTimer = setInterval(() => void this.refreshAll(), this.transport?.pollIntervalMs ?? 5000)
	}

	private handleDisconnected(reason: string): void {
		if (this.destroyed) return
		this.log('warn', `disconnected: ${reason}`)
		this.updateStatus(InstanceStatus.ConnectionFailure, reason)
		this.clearTimers()
		this.scheduleReconnect()
	}

	private handleStateEvent(half: 'encoder' | 'decoder', data: JsonObject): void {
		if (half === 'encoder') this.applyEncoderStatus(data)
		else this.applyDecoderStatus(data)
	}

	private clearTimers(): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = undefined
		}
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = undefined
		}
		if (this.definitionTimer) {
			clearTimeout(this.definitionTimer)
			this.definitionTimer = undefined
		}
	}

	// ── Reading and writing the state ────────────────────────────────────────

	/**
	 * Ask what the far end is doing. This is what fills the buttons in after
	 * connecting mid-event, when the next pushed change may be minutes away —
	 * and on an appliance, where nothing is ever pushed, it is the only way the
	 * state arrives at all. Each half is asked independently: one being absent
	 * is normal, not a fault.
	 */
	async refreshAll(): Promise<void> {
		if (!this.transport?.isConnected) return
		const jobs: Promise<void>[] = [this.refreshDecoder()]
		if (this.transport.hasEncoderHalf) jobs.push(this.refreshEncoder())
		await Promise.allSettled(jobs)
	}

	async refreshEncoder(): Promise<void> {
		try {
			const status = await this.transport!.call('encoder/status')
			if (typeof status.error === 'string') {
				this.hasEncoder = false
			} else {
				this.hasEncoder = true
				this.applyEncoderStatus(status)
			}
		} catch {
			// Not worth a log line every few seconds: either this end has no
			// encoder half, or the connection has just gone.
		}
	}

	async refreshDecoder(): Promise<void> {
		try {
			const status = await this.transport!.call('decoder/status')
			if (typeof status.error === 'string') {
				this.hasDecoder = false
			} else {
				this.hasDecoder = true
				this.applyDecoderStatus(status)
			}
		} catch {
			// As above.
		}
	}

	/** Take a status document as truth and repaint anything that depends on it. */
	applyEncoderStatus(status: JsonObject): void {
		this.encoderStatus = status
		this.publishVariables()
		// An appliance has no encoder feedbacks registered, and asking Companion
		// to check a definition that does not exist is a warning every second.
		if (this.isObs) this.checkFeedbacks('encoder_live', 'encoder_link_health')
		// The main site's marker labels arrive with this document, and the
		// "Drop a marker" list is built from them.
		this.rebuildIfChoicesChanged()
	}

	applyDecoderStatus(status: JsonObject): void {
		this.decoderStatus = status
		this.publishVariables()
		this.checkFeedbacks(
			'decoder_playing',
			'decoder_held',
			'decoder_buffering',
			'decoder_loading',
			'decoder_no_source',
			'decoder_ended',
			'decoder_behind_live',
			'decoder_link_health',
		)
		// Markers arrive with this document — a cue the main site has just
		// dropped is a new button to offer.
		this.rebuildIfChoicesChanged()
	}

	/** The recordings list, fetched on demand — for an action or a dropdown. */
	async fetchEvents(): Promise<EventsResponse> {
		try {
			const res = await this.transport!.call('decoder/events')
			this.events = res
			this.rebuildIfChoicesChanged()
		} catch {
			this.events = { error: 'could not read the recordings list' }
		}
		return this.events
	}

	/**
	 * Run a command and fold its reply into the state. Both ends answer a
	 * control with the new status document, so a button updates itself from the
	 * response rather than waiting for the next push or poll.
	 */
	async command(
		operation: string,
		params: JsonObject = {},
		half: 'encoder' | 'decoder' = 'decoder',
	): Promise<JsonObject> {
		if (!this.transport) return { error: 'not connected' }
		const res = await this.transport.call(operation, params)
		if (typeof res.error === 'string' && res.error !== '') {
			this.log('warn', `${operation} refused: ${res.error}`)
			return res
		}
		if (half === 'encoder') this.applyEncoderStatus(res)
		else this.applyDecoderStatus(res)
		return res
	}
}
