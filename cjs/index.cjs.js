/*
	index.cjs.js
	------------

	CommonJS re-exports of the frontend-safe utilities.
*/
const { socketRef, socketShallowRef, socketRefAsync, socketShallowRefAsync } = require('./socketRefClient');
const { bindRefs } = require('./bindRefs');

module.exports = {
	bindRefs,
	bindRef,
	socketRef,
	socketShallowRef,
	socketRefAsync,
	socketShallowRefAsync
};
