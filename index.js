/*
	index.js
	--------

	Just re-exports the functions from the other files.
*/
import { 
	setGlobalSocketRefPort, enableConnectionLogs,
	socketRef, socketShallowRef,
	socketRefReadOnly, socketShallowRefReadOnly,
	socketRefAsync, socketShallowRefAsync
 } from "./socketRefClient";

import { 
	bindRef, bindRefs
} from "./bindRefs";

export { 
	bindRef, bindRefs,
	setGlobalSocketRefPort, enableConnectionLogs,
	socketRef, socketShallowRef,
	socketRefReadOnly, socketShallowRefReadOnly,
	socketRefAsync, socketShallowRefAsync
};
