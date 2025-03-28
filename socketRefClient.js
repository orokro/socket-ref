/*
	socketRefClient.js
	------------------

	provides exports for:
	- socketRef
	- socketShallowRef

	Which are similar to ref and shallowRef, but are synced with a server via a WebSocket.
*/

// vue
import { ref, shallowRef, watch } from 'vue';

// FinalizationRegistry for cleanup when the ref is no longer used
const registry = new FinalizationRegistry(({ socketRefState }) => {
	if (socketRefState?.cleanup) socketRefState.cleanup();
});


/**
 * Get a vue ref that is synced with a server via a WebSocket
 * 
 * @param {String} keyOrObj - The key for the socketRef, or an object with options
 * @param {*} defaultValue - The default value for the socketRef
 * @returns {ref} - A ref that is synced with a server via a WebSocket
 */
export function socketRef(keyOrObj, defaultValue) {
	return createSocketRef(ref, keyOrObj, defaultValue);
}


/**
 * Get a vue shallowRef that is synced with a server via a WebSocket
 * 
 * @param {String} keyOrObj - The key for the socketRef, or an object with options
 * @param {*} defaultValue - The default value for the socketRef
 * @returns {shallowRef} - A shallowRef that is synced with a server via a WebSocket
 */
export function socketShallowRef(keyOrObj, defaultValue) {
	return createSocketRef(shallowRef, keyOrObj, defaultValue);
}


/**
 * Create a ref that is synced with a server via a WebSocket
 * 
 * @param {ref|shallowRef} refType - The type of ref to create, ref or shallowRef
 * @param {String|Object} keyOrObj - The key for the socketRef, or an object with options
 * @param {*} initialValue - The default value for the socketRef
 * @returns {ref|shallowRef} - A ref that is synced with a server via a WebSocket
 */
function createSocketRef(refType, keyOrObj, initialValue) {

	// if we got a string for our second param, wrap it into an options object
	const options = typeof keyOrObj === 'string' ? { key: keyOrObj } : keyOrObj;

	// get options or defaults
	const key = options.key;
	const ip = options.ip || 'localhost';
	const port = options.port || 3001;

	// create the ref that will be synced with the server
	const state = refType(initialValue);

	// create a weak ref to the state so we can clean up when it's no longer used
	const weakState = new WeakRef(state);

	// the rest of the websocket syncing logic will be handled in the SocketRefState class
	// we pass in weakState, because the only valid strong reference to the state is the ref itself
	// that this function returns. This way, we can clean up the state when the ref is no longer used.
	const socketRefState = new SocketRefState(weakState, key, initialValue, ip, port);

	// we're going to return state, which is a ref. This means outside code can change it's .value.
	// thus, we will watch the state ref before we return it, so we can call the socket code to update the server
	socketRefState.stopWatch = watch(state, (newVal) => {
		if (socketRefState.ready) {
			socketRefState.write(newVal);
		}
	});

	// register the state with the finalization registry, so we can clean up when the ref is no longer used
	registry.register(state, { socketRefState });

	// return the ref
	return state;
}


/**
 * Class to handle the WebSocket syncing for a socketRef
 */
class SocketRefState {

	/**
	 * Create a new SocketRefState
	 * 
	 * @param {WeakRef} weakState - WeakRef to the state ref
	 * @param {String} key - The key used for syncing with the server
	 * @param {*} defaultValue - The default value for the socketRef
	 * @param {String} ip - The IP address of the server
	 * @param {String|Number} port - The port of the server 
	 */
	constructor(weakState, key, defaultValue, ip, port) {

		// store the weakState, key, defaultValue, and timestamp
		this.weakState = weakState;
		this.key = key;
		this.defaultValue = defaultValue;

		// for writing, we'll need a timestamp
		this.timestamp = 0;

		// convert ip and port to a WebSocket URL
		this.url = `ws://${ip}:${port}`;

		// this will become a function that stops the watchers in the socketRef or socketShallowRef closure
		// this will be set after construction in said closure. See createSocketRef above.
		this.stopWatch = null;

		// create a flag for when the socket is ready
		this.ready = false;

		// connect to the server
		this.connect();
	}


	/**
	 * Connect to the server via WebSocket
	 */
	connect() {

		// create a new websocket with our url
		this.socket = new WebSocket(this.url);

		// when we connect send the init message w/ our key
		this.socket.onopen = () => {
			this.socket.send(JSON.stringify({
				type: 'init',
				key: this.key
			}));
		};

		// when this socket receives a message, parse it and update the state
		this.socket.onmessage = (event) => {

			// parse the message
			const msg = JSON.parse(event.data);

			// if the key doesn't match, ignore the message
			if (msg.key !== this.key)
				return;

			// get the vue ref state
			const state = this.weakState.deref();
			if (!state)
				return;

			// Handle init response, which includes the current value from the server
			if (msg.type === 'init') {
				this.timestamp = msg.timestamp || Date.now();
				state.value = msg.value;
				this.ready = true;
				return;
			}

			// Normal update
			if (msg.timestamp <= this.timestamp)
				return;

			// update the timestamp and the state value
			// because we are updating the vue state, it will be reactive for the user
			this.timestamp = msg.timestamp;
			state.value = msg.value;
		};

		// if the socket closes, try to reconnect
		this.socket.onclose = () => {
			this.ready = false;
			setTimeout(() => this.connect(), 1000);
		};

		// if there's an error, close the socket
		this.socket.onerror = () => {
			this.socket.close();
		};
	}
	

	/**
	 * Send value updates to the server
	 * 
	 * @param {*} newValue - The new value to write to the server
	 */
	write(newValue) {

		// get a new timestamp
		this.timestamp = Date.now();
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {

			// send the update message to the server
			this.socket.send(JSON.stringify({
				type: 'update',
				key: this.key,
				value: newValue,
				timestamp: this.timestamp
			}));
		}
	}


	/**
	 * Cleanup the socket and watchers
	 * 
	 * This should automatically be called when the state ref we created is garbage collected
	 */
	cleanup() {

		// stop the watcher
		if (this.stopWatch) {
			this.stopWatch();
			this.stopWatch = null;
		}

		// close the socket
		if (this.socket) {
			this.socket.close();
			this.socket = null;
		}
	}
	
}
