import { WebSocketServer } from 'ws';

export function socketRefServer(options = {}) {
    const port = options.port || 3001;
    let wss;

    if (options.server) {
        wss = new WebSocketServer({ server: options.server });
    } else {
        wss = new WebSocketServer({ port });
        console.log(`socketRefServer (V2) listening on ws://localhost:${port}`);
    }

    // State Storage
    const keyState = new Map(); // Key -> { value, timestamp }

    // Subscription Tracking
    const keySubscribers = new Map(); // Key -> Set<Socket>

    function subscribe(socket, key) {
        if (!keySubscribers.has(key)) keySubscribers.set(key, new Set());
        keySubscribers.get(key).add(socket);

        // Send current state if exists
        const current = keyState.get(key);
        if (current) {
            socket.send(JSON.stringify({
                type: 'set',
                key: key,
                value: current.value,
                timestamp: current.timestamp
            }));
        }
    }

    function unsubscribe(socket, key) {
        if (keySubscribers.has(key)) {
            const set = keySubscribers.get(key);
            set.delete(socket);
            if (set.size === 0) keySubscribers.delete(key);
        }
    }

    function handleSet(socket, key, value, timestamp) {
        const now = timestamp || Date.now();
        const current = keyState.get(key);

        // Conflict Resolution (LWW)
        if (!current || now > current.timestamp) {
            keyState.set(key, { value, timestamp: now });

            // Broadcast to subscribers
            if (keySubscribers.has(key)) {
                const msg = JSON.stringify({ type: 'set', key, value, timestamp: now });
                for (const sub of keySubscribers.get(key)) {
                    if (sub !== socket && sub.readyState === sub.OPEN) {
                        sub.send(msg);
                    }
                }
            }
        }
    }

    wss.on('connection', (socket) => {
        // Track what keys this socket is subscribed to for cleanup on close
        const socketSubs = new Set();

        socket.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                const { type, key, value, timestamp } = msg;

                if (!key) return;

                if (type === 'sub') {
                    socketSubs.add(key);
                    subscribe(socket, key);
                } else if (type === 'unsub') {
                    socketSubs.delete(key);
                    unsubscribe(socket, key);
                } else if (type === 'set') {
                    handleSet(socket, key, value, timestamp);
                }
            } catch (err) {
                console.warn('Invalid message', data);
            }
        });

        socket.on('close', () => {
            // Clean up subscriptions
            for (const key of socketSubs) {
                unsubscribe(socket, key);
            }
        });
    });

    return wss;
}
