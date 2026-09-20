//
// state.ts — turning the plugin's numbers into words.
//
// The plugin reports state as integers, because that is what survives a wire
// and a version: `room_state` is a `RoomState`, `link_health` a `LinkHealth`.
// A button that lit up for "2" would be useless, so the mapping lives here.
//
// Deliberately pure: no socket, no Companion, nothing to mock. This is the part
// of the module that is worth testing, and it is tested (see tests/).
//

const ROOM_STATE = ['Unknown', 'Offline', 'Live', 'Ended', 'Interrupted'] as const
const LINK_HEALTH = ['Healthy', 'Degraded', 'Offline'] as const

/** `RoomState`: 0 Unknown, 1 Offline, 2 Live, 3 Ended, 4 Interrupted. */
export function roomStateText(value: number | undefined): string {
	return value !== undefined && value >= 0 && value < ROOM_STATE.length ? ROOM_STATE[value] : 'Unknown'
}

/** `EventState`, as the recordings list reports it. */
export function eventStateText(value: number | undefined): string {
	switch (value) {
		case 1:
			return 'Live'
		case 2:
			return 'Recording'
		case 3:
			return 'Interrupted'
		default:
			return 'Unknown'
	}
}

/** `LinkHealth`: 0 Healthy, 1 Degraded, 2 Offline. */
export function linkHealthText(value: number | undefined): string {
	return value !== undefined && value >= 0 && value < LINK_HEALTH.length ? LINK_HEALTH[value] : 'Healthy'
}

/** A count of seconds as a duration somebody can read: `1:23`, `1:02:03`. */
export function formatDuration(seconds: number | undefined): string {
	if (seconds === undefined || !Number.isFinite(seconds)) return ''
	const whole = Math.max(0, Math.round(seconds))
	const hours = Math.floor(whole / 3600)
	const minutes = Math.floor((whole % 3600) / 60)
	const secs = whole % 60
	const ss = String(secs).padStart(2, '0')
	if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`
	return `${minutes}:${ss}`
}

/** A wall-clock instant, from the plugin's epoch milliseconds, as `HH:MM:SS`. */
export function formatClockTime(epochMs: number | undefined): string {
	if (!epochMs || epochMs <= 0 || !Number.isFinite(epochMs)) return ''
	const d = new Date(epochMs)
	return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
}

/** A byte count, for the sending readout: `1.2 MB`. */
export function formatBytes(bytes: number | undefined): string {
	if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return ''
	const units = ['B', 'KB', 'MB', 'GB', 'TB']
	let value = bytes
	let unit = 0
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024
		unit++
	}
	const rounded = unit === 0 ? String(Math.round(value)) : value.toFixed(1)
	return `${rounded} ${units[unit]}`
}

/** A transfer rate, for the link readout: `3.4 MB/s`. */
export function formatRate(bytesPerSecond: number | undefined): string {
	const text = formatBytes(bytesPerSecond)
	return text === '' ? '' : `${text}/s`
}
