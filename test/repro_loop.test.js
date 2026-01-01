import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { socketRefServer } from '../socketRefServer.js';
import { socketRef, setGlobalSocketRefPort, enableConnectionLogs } from '../index.js';
import { WebSocket } from 'ws';

// Polyfill WebSocket for Node environment
global.WebSocket = WebSocket;

describe('Infinite Loop Reproduction', () => {
	let wss;
	let clientA; // The "manual" client
	let mockTime = 1000;
	const PORT = 3002;

	beforeEach(async () => {
		// Monkey patch Date.now to strictly increment
		// This simulates the condition where every operation takes "some time"
		// and thus every new timestamp is > the previous one.
		vi.spyOn(Date, 'now').mockImplementation(() => {
			return mockTime++;
		});

		enableConnectionLogs(true);

		// Setup Server
		wss = socketRefServer({ port: PORT });
		setGlobalSocketRefPort(PORT);

		// Wait for server to be listening (roughly)
		await new Promise(r => setTimeout(r, 100));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (clientA) clientA.close();
		if (wss) wss.close();
		// Give sockets time to close
		return new Promise(r => setTimeout(r, 100));
	});

	it('should NOT produce an infinite loop of updates when Date.now() always increments', async () => {
		const key = 'test-loop';
		const state = { count: 0 };
		const receivedMessages = [];

		// 1. Connect Client A (Manual WebSocket)
		clientA = new WebSocket(`ws://localhost:${PORT}`);
		
		await new Promise(resolve => {
			clientA.onopen = resolve;
		});

		// Subscribe manually (V2 Protocol)
		clientA.send(JSON.stringify({ type: 'sub', key }));

		// Listen to messages on Client A
		clientA.onmessage = (event) => {
			const msg = JSON.parse(event.data);
			// V2 Protocol uses 'set'
			if (msg.key === key && msg.type === 'set') {
				state.count++;
				receivedMessages.push(msg);
			}
		};

		// 2. Initialize the key on the server via Client A
		clientA.send(JSON.stringify({
			type: 'set',
			key: key,
			value: 'initial',
			timestamp: Date.now()
		}));

		// Allow server to process
		await new Promise(r => setTimeout(r, 50));

		// 3. Connect Client B (The first socketRef)
		const refB = socketRef(key, 'default');

		// 4. Connect Client C (The second socketRef - needed for ping-pong)
		const refC = socketRef(key, 'default');

		// Wait for Clients to connect and sync
		await new Promise(r => setTimeout(r, 200));

		// Reset count - we only care about the loop triggered by the next update
		console.log('Resetting count...');
		state.count = 0;

		// 5. Trigger the loop: Client A sends a new update.
		console.log('Triggering update from Client A...');
		clientA.send(JSON.stringify({
			type: 'set',
			key: key,
			value: { text: 'trigger' },
			timestamp: Date.now()
		}));

		// Wait a short duration (e.g. 500ms) to let the loop run
		await new Promise(r => setTimeout(r, 500));

		console.log(`Received ${state.count} messages in 500ms`);

		// Assert that the loop is prevented
		expect(state.count).toBeLessThan(5); 
	});
});
