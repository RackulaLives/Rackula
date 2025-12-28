/** @type {import('prettier').Config} */
export default {
	plugins: ['prettier-plugin-svelte'],
	singleQuote: true,
	trailingComma: 'none',
	useTabs: true,
	printWidth: 100,
	overrides: [
		{
			files: '*.svelte',
			options: {
				parser: 'svelte'
			}
		}
	]
};
