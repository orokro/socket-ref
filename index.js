/*
	index.js
	--------

	Just re-exports the functions from the other files.
*/
import { socketRef, socketShallowRef } from "./socketRefClient";
import { bindRefs } from "./bindRefs";
export { bindRefs, socketRef, socketShallowRef };
