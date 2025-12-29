import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

export default [
	{
		input: 'index.js',
		output: {
			file: 'cjs/index.cjs.js',
			format: 'cjs',
			exports: 'named'
		},
		external: ['vue'],
		plugins: [resolve(), commonjs()]
	},
	{
		input: 'socketRefServer.js',
		output: {
			file: 'cjs/socketRefServer.cjs.js',
			format: 'cjs',
			exports: 'named'
		},
		external: ['ws'],
		plugins: [resolve(), commonjs()]
	}
];
