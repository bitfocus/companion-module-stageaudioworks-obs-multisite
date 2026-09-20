//
// state.spec.ts — the mapping from the plugin's numbers to words.
//
// This is the part of the module that is worth testing without a socket: the
// enums are a wire contract, and a change to them that this file does not know
// about is exactly the kind of quiet breakage a test is for.
//
import { describe, expect, it } from 'vitest'

import {
	eventStateText,
	formatBytes,
	formatClockTime,
	formatDuration,
	formatRate,
	linkHealthText,
	roomStateText,
} from './state.js'

describe('roomStateText', () => {
	it('names every RoomState', () => {
		expect(roomStateText(0)).toBe('Unknown')
		expect(roomStateText(1)).toBe('Offline')
		expect(roomStateText(2)).toBe('Live')
		expect(roomStateText(3)).toBe('Ended')
		expect(roomStateText(4)).toBe('Interrupted')
	})

	it('falls back to Unknown for a value it has never seen', () => {
		expect(roomStateText(undefined)).toBe('Unknown')
		expect(roomStateText(99)).toBe('Unknown')
		expect(roomStateText(-1)).toBe('Unknown')
	})
})

describe('eventStateText', () => {
	it('names every EventState', () => {
		expect(eventStateText(1)).toBe('Live')
		expect(eventStateText(2)).toBe('Recording')
		expect(eventStateText(3)).toBe('Interrupted')
		expect(eventStateText(0)).toBe('Unknown')
		expect(eventStateText(undefined)).toBe('Unknown')
	})
})

describe('linkHealthText', () => {
	it('names every LinkHealth', () => {
		expect(linkHealthText(0)).toBe('Healthy')
		expect(linkHealthText(1)).toBe('Degraded')
		expect(linkHealthText(2)).toBe('Offline')
	})
})

describe('formatDuration', () => {
	it('reads as minutes and seconds, then hours', () => {
		expect(formatDuration(0)).toBe('0:00')
		expect(formatDuration(83)).toBe('1:23')
		expect(formatDuration(3723)).toBe('1:02:03')
	})

	it('is blank rather than nonsense when there is no figure', () => {
		expect(formatDuration(undefined)).toBe('')
		expect(formatDuration(Number.NaN)).toBe('')
	})

	it('never shows a negative duration', () => {
		expect(formatDuration(-5)).toBe('0:00')
	})
})

describe('formatClockTime', () => {
	it('renders a time of day', () => {
		expect(formatClockTime(Date.UTC(2026, 0, 1, 12, 34, 56))).toMatch(/^\d\d:\d\d:\d\d$/)
	})

	it('is blank for an unset playhead', () => {
		expect(formatClockTime(0)).toBe('')
		expect(formatClockTime(undefined)).toBe('')
	})
})

describe('formatBytes', () => {
	it('scales to the unit that fits', () => {
		expect(formatBytes(0)).toBe('0 B')
		expect(formatBytes(512)).toBe('512 B')
		expect(formatBytes(1024)).toBe('1.0 KB')
		expect(formatBytes(1536)).toBe('1.5 KB')
		expect(formatBytes(1048576)).toBe('1.0 MB')
	})

	it('is blank rather than "0 B" when nothing has been measured', () => {
		expect(formatBytes(undefined)).toBe('')
	})
})

describe('formatRate', () => {
	it('appends per second', () => {
		expect(formatRate(1024)).toBe('1.0 KB/s')
	})

	it('is blank rather than "0 B/s" when there is no sample', () => {
		expect(formatRate(undefined)).toBe('')
	})
})
