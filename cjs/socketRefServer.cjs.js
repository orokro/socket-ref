/*
	socketRefServer.js
	------------------

	provides a WebSocket server that can be used with socketRefClient.js

	This will allow you to sync refs between clients and a server.
*/

// our server
const { WebSocketServer } = require('ws');

/**
 * Creates a WebSocket server that can be used with socketRefClient.js
 * 
 * @param {Object} options - OPTIONAL; settings for the server
 * @returns {WebSocketServer} - The WebSocketServer instance
 */
function socketRefServer(options = {}) {

	// handle options or defaults
	const port = options.port || 3001;
	let server = options.server || null;
	let wss;

	// create the server (or attach to an existing one)
	if (server) {
		wss = new WebSocketServer({ server });
	} else {
		wss = new WebSocketServer({ port });
		console.log(`socketRefServer listening on ws://localhost:${port}`);
	}

	// keep track of the state of each socketRef key we've seen
	const keyStateMap = new Map(); // key => { value, timestamp }


	/**
	 * Broadcast a message to all clients
	 * 
	 * @param {String} key - The socketRef state key to broadcast
	 * @param {String} value - The value of the socketRef state
	 * @param {number} timestamp - The timestamp of the socketRef state	
	 */
	function broadcast(key, value, timestamp) {

		const message = JSON.stringify({ key, value, timestamp });
		for (const client of wss.clients) {
			if (client.readyState === client.OPEN) {
				client.send(message);
			}
		}// next client
	}
	
	
	// handle incoming connections
	wss.on('connection', (socket) => {

		// handle incoming messages
		socket.on('message', (data) => {

			// parse the message
			let msg;
			try {
				msg = JSON.parse(data);
			} catch (err) {
				console.warn('Invalid message received:', data);
				return;
			}

			// break out the message, default type is update
			const { type = 'update', key, value, timestamp } = msg;

			// if we don't have a key, ignore the message
			if (!key) return;

			// handle init messages, when a client connects
			if (type === 'init') {

				// send it's existing value if it has one, otherwise null
				const existing = keyStateMap.get(key);
				socket.send(JSON.stringify({
					type: 'init',
					key,
					value: existing ? existing.value : null,
					timestamp: existing ? existing.timestamp : Date.now()
				}));
				return;
			}

			// handle update messages
			if (type === 'update' && value !== undefined) {
				const now = timestamp || Date.now();
				const existing = keyStateMap.get(key);

				// if we haven't seen this key before, or this update is newer, update the state
				if (!existing || now > existing.timestamp) {

					// save the new state and broadcast it to all clients
					keyStateMap.set(key, { value, timestamp: now });
					broadcast(key, value, now);
				}
			}
		});
	});

	return wss;
	
}

module.exports = { socketRefServer };
