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
				'The same controls live in two places, so this module can drive either: the main site, where ' +
				'OBS runs the obs-multisite plugin, and a satellite, where the campus player appliance runs ' +
				'on its own. Pick one below. Against OBS the plugin needs the WebSocket Server turned on ' +
				'(Tools → WebSocket Server Settings); against a campus player there is nothing to switch on — ' +
				'it already serves this on its own port.',
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
			label: 'Port (0 = default: 4455 for OBS, 8080 for a campus player)',
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
