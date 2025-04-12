/*
	index.js
	--------

	Just re-exports the functions from the other files.
*/
import { 
	socketRef, socketShallowRef,
	socketRefReadOnly, socketShallowRefReadOnly,
	socketRefAsync, socketShallowRefAsync
 } from "./socketRefClient";

import { 
	bindRef, bindRefs
} from "./bindRefs";

export { 
	bindRef, bindRefs,
	socketRef, socketShallowRef,
	socketRefReadOnly, socketShallowRefReadOnly,
	socketRefAsync, socketShallowRefAsync
};
