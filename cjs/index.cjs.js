/*
	index.cjs.js
	------------

	CommonJS re-exports of the frontend-safe utilities.
*/
const { 
	socketRef, socketShallowRef,
	socketRefReadOnly, socketShallowRefReadOnly,
	socketRefAsync, socketShallowRefAsync
} = require('./socketRefClient');

const { 
	indRef, bindRefs
} = require('./bindRefs');

module.exports = {
	bindRefs, bindRef,
	socketRef, socketShallowRef,
	socketRefReadOnly, socketShallowRefReadOnly,
	socketRefAsync, socketShallowRefAsync
};
