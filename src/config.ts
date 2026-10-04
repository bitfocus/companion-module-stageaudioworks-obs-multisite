import { Regex } from '@companion-module/base'
import type { SomeCompanionConfigField } from '@companion-module/base'

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'What this connects to',
			width: 12,
			value:
				'The same controls live in several places, so this module can drive any of them: the main site, ' +
				'where OBS runs the obs-multisite plugin; a satellite, where the campus player appliance runs on ' +
				'its own; or an Outpost box (MultisiteOS), as a campus decoder or a main-site encoder. Pick one ' +
				'below. Against OBS the plugin needs the WebSocket Server turned on (Tools → WebSocket Server ' +
				'Settings). A campus player and an Outpost box need nothing switched on. An Outpost box needs no ' +
				'PIN either: its page leaves every control a service needs open, and this module uses no other. ' +
				'It follows the box if it changes shape.',
		},
		{
			type: 'dropdown',
			id: 'connection_type',
			label: 'Connect to',
			width: 12,
			default: 'obs',
			choices: [
				{ id: 'obs', label: 'OBS running the obs-multisite plugin — main site controls and a campus feed' },
				{ id: 'appliance', label: 'A campus player appliance — its own controls over HTTP' },
				{ id: 'outpost', label: 'An Outpost box (MultisiteOS) — a campus decoder or a main-site encoder' },
			],
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Host',
			width: 8,
			default: '127.0.0.1',
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port (0 = default: 4455 for OBS, 8080 for a campus player, 80 for an Outpost box)',
			width: 4,
			default: 0,
			min: 0,
			max: 65535,
		},
		{
			type: 'secret-text',
			id: 'password',
			label: 'OBS WebSocket password (OBS only)',
			width: 12,
			default: '',
		},
	]
}
