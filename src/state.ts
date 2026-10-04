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

/**
 * Time left until something starts: `12:04`, `1:02:15`, and from a day out
 * `1d 2h`, because nobody reads a hundred-hour clock.
 */
export function formatCountdown(seconds: number | undefined): string {
	if (seconds === undefined || !Number.isFinite(seconds)) return ''
	if (seconds < 86_400) return formatDuration(Math.max(0, seconds))
	return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3600)}h`
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

/** Where a clock time lands in a programme, as media time. */
export interface SeekPlan {
	/** Milliseconds from the programme's start: what a player's seek takes. */
	ms: number
	/** Set when the time was outside the programme and was moved to its edge. */
	clamped: '' | 'before' | 'after'
}

/**
 * A clock time on the Companion host — seconds from its local midnight — as a
 * position in the programme a campus player is playing. The plugin's seek takes
 * a time of day; a player's takes media time, milliseconds from the start of
 * the programme, so this is the step between them.
 *
 * The programme may cross midnight, so the time is tried on the day before,
 * the day of and the days after its start, and the latest one inside the
 * programme wins (a programme longer than a day has a clock time twice; the
 * later is the one nearer live). A time inside none is moved to whichever edge
 * is nearer, and says so. `null` when the player has not said when its
 * programme started, which is the one thing this cannot do without.
 *
 * Local dates are built with the Date constructor, not by adding 86 400 000,
 * so a day with a daylight-saving change is still a day.
 */
export function timeOfDayToMedia(
	secondsFromMidnight: number,
	status: { started_ms?: number; earliest_ms?: number; live_ms?: number; end_ms?: number; total_ms?: number },
): SeekPlan | null {
	const started = status.started_ms
	if (!started || started <= 0 || !Number.isFinite(started)) return null
	const first = Math.max(0, status.earliest_ms ?? 0)
	const last = Math.max(first, status.live_ms ?? 0, status.end_ms ?? 0, status.total_ms ?? 0)
	const day = new Date(started)
	const secs = Math.max(0, Math.min(86399, Math.round(secondsFromMidnight)))

	const candidates: number[] = []
	for (let d = -1; d <= 2; d++) {
		const at = new Date(day.getFullYear(), day.getMonth(), day.getDate() + d, 0, 0, secs).getTime()
		candidates.push(at - started)
	}
	const inside = candidates.filter((ms) => ms >= first && ms <= last)
	if (inside.length > 0) return { ms: Math.max(...inside), clamped: '' }

	// Outside the programme: to the nearer edge.
	let best = { ms: first, clamped: 'before' as 'before' | 'after', distance: Infinity }
	for (const ms of candidates) {
		const distance = ms < first ? first - ms : ms - last
		if (distance < best.distance)
			best = { ms: ms < first ? first : last, clamped: ms < first ? 'before' : 'after', distance }
	}
	return { ms: best.ms, clamped: best.clamped }
}
