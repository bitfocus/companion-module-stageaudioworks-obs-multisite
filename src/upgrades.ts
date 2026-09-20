import type { CompanionStaticUpgradeScript } from '@companion-module/base'
import type { ModuleConfig } from './types.js'

/**
 * No upgrade scripts yet: this module has never changed the shape of its
 * configuration or its actions. Once one ships it is added here and can never
 * be removed — a script in this list is what stands between a rename and
 * somebody's existing buttons silently doing nothing.
 */
export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = []
