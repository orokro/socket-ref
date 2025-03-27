/*
	index.js
	--------

	Just re-exports the functions from the other files.
*/
import { socketRef, socketShallowRef } from "./socketRefClient";
import { bindRef, bindRefs } from "./bindRefs";
export { bindRef, bindRefs, socketRef, socketShallowRef };
