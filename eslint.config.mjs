import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

export default generateEslintConfig({
	enableTypescript: true,
	// The module's own tests import `vitest`, which is a devDependency and so
	// "unpublished" as far as eslint-plugin-n is concerned. A test importing its
	// test runner is not the problem that rule exists for.
	commonRules: {
		'n/no-unpublished-import': 'off',
	},
})
