import { ref, shallowRef, watch, getCurrentScope, onScopeDispose, computed } from 'vue';

// --- Configuration ---
let GLOBAL_PORT = 3001;
let LOG_CONNECTION = false;

export function setGlobalSocketRefPort(port) { GLOBAL_PORT = port; }
export function enableConnectionLogs(enable = true) { LOG_CONNECTION = enable; }

// --- Connection Manager (Singleton) ---
const connections = new Map(); // "ws://ip:port" -> SharedSocket

/**
 * Gets or creates a shared socket connection for the given URL.
 */
function getSharedConnection(ip = 'localhost', port = null) {
    const targetPort = port || GLOBAL_PORT;
    const url = `ws://${ip}:${targetPort}`;

    if (!connections.has(url)) {
        connections.set(url, new SharedSocket(url));
    }
    return connections.get(url);
}

/**
 * Cleanup helper: Garbage Collection fallback
 */
const registry = new FinalizationRegistry(({ socket, key, callback }) => {
    // If the ref is GC'd and wasn't manually disposed, unsubscribe now.
    socket.unsubscribe(key, callback);
});

// --- Shared Socket Class ---
class SharedSocket {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.reconnectTimer = null;
        this.isReady = false;
        
        // Map<Key, Set<Callback>>
        // Callback signature: (value, timestamp) => void
        this.subscribers = new Map();
        
        // Queue for messages before connection is open
        this.msgQueue = [];
        
        // Initialize connection
        this.connect();
    }

    log(...args) {
        if (LOG_CONNECTION) console.log(`[SocketRef ${this.url}]`, ...args);
    }

    connect() {
        this.log('Connecting...');
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            this.log('Connected');
            this.isReady = true;
            this.flushQueue();
            // Resubscribe to all active keys (in case of reconnect)
            for (const key of this.subscribers.keys()) {
                this.sendInternal({ type: 'sub', key });
            }
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleMessage(msg);
            } catch (err) {
                console.warn('SocketRef: Failed to parse message', event.data);
            }
        };

        this.ws.onclose = () => {
            this.log('Disconnected');
            this.isReady = false;
            this.scheduleReconnect();
        };

        this.ws.onerror = (err) => {
            // Error usually triggers close, so we handle logic there
            this.log('Error', err);
            this.ws.close();
        };
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, 1000); // Simple 1s retry
    }

    handleMessage(msg) {
        // V2 Protocol: { type: 'set', key, value, timestamp }
        if (msg.type === 'set' && msg.key) {
            const subs = this.subscribers.get(msg.key);
            if (subs) {
                subs.forEach(cb => cb(msg.value, msg.timestamp));
            }
        }
    }

    sendInternal(payload) {
        if (this.isReady && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        } else {
            this.msgQueue.push(payload);
        }
    }

    flushQueue() {
        while (this.msgQueue.length > 0) {
            this.sendInternal(this.msgQueue.shift());
        }
    }

    // --- Public API ---

    subscribe(key, callback) {
        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, new Set());
            // Tell server we want this key
            this.sendInternal({ type: 'sub', key });
        }
        this.subscribers.get(key).add(callback);
    }

    unsubscribe(key, callback) {
        const subs = this.subscribers.get(key);
        if (subs) {
            subs.delete(callback);
            if (subs.size === 0) {
                this.subscribers.delete(key);
                // Tell server we are done with this key
                this.sendInternal({ type: 'unsub', key });
            }
        }
        
        // Optional: If no subscribers at all, close socket? 
        // For now, we keep it open for performance in case of frequent switching.
    }

    update(key, value, timestamp) {
        this.sendInternal({ type: 'set', key, value, timestamp });
    }
}

// --- Factory Logic ---

function createSocketRef(targetRef, keyOrObj, initialValue, isReadOnly) {
    const options = typeof keyOrObj === 'string' ? { key: keyOrObj } : keyOrObj;
    const { key, ip, port } = options;

    if (!key) throw new Error("SocketRef: 'key' is required.");

    // 1. Create the local state
    const state = targetRef(initialValue);
    
    // 2. Get the shared connection
    const socket = getSharedConnection(ip, port);

    // 3. Subscription Logic
    // We need to track our local timestamp to avoid "echo" loops via logic (redundancy for safety)
    let localTimestamp = 0;
    let isReceiving = false; // Flag to prevent watch loop

    const onRemoteUpdate = (val, ts) => {
        // Ignore old updates
        if (ts <= localTimestamp) return;

        // Apply update
        localTimestamp = ts;
        isReceiving = true;
        state.value = val; 
        // isReceiving reset is handled by the synchronous watch flush or immediately?
        // Vue watch triggers synchronously on mutation? 
        // We reset it immediately after assignment if sync, but just to be safe reset it after.
        // Actually, if we use { flush: 'sync' } on the watch, the watch runs NOW.
        // So we reset AFTER.
        isReceiving = false;
    };

    socket.subscribe(key, onRemoteUpdate);

    // 4. Cleanup Logic (Hybrid)
    const cleanup = () => socket.unsubscribe(key, onRemoteUpdate);

    // A. Vue Lifecycle Cleanup
    if (getCurrentScope()) {
        onScopeDispose(cleanup);
    }

    // B. GC Fallback Cleanup
    // We register the `state` ref. If it becomes unreachable, we cleanup.
    // Note: We pass { socket, key, callback } to the registry so it doesn't hold `state` strongly.
    registry.register(state, { socket, key, callback: onRemoteUpdate });

    // 5. Watcher Logic (Uplink)
    if (!isReadOnly) {
        watch(state, (newVal) => {
            if (isReceiving) return; // Suppression

            const now = Date.now();
            localTimestamp = now;
            socket.update(key, newVal, now);
        }, { flush: 'sync' }); // Sync flush ensures isReceiving is true when this runs
    }

    // 6. Return
    return isReadOnly ? computed(() => state.value) : state;
}

// --- Exports ---

export function socketRef(key, val) { return createSocketRef(ref, key, val, false); }
export function socketShallowRef(key, val) { return createSocketRef(shallowRef, key, val, false); }
export function socketRefReadOnly(key, val) { return createSocketRef(ref, key, val, true); }
export function socketShallowRefReadOnly(key, val) { return createSocketRef(shallowRef, key, val, true); }

// Async variants (wrappers that wait for connection? V2 makes this trickier with multiplexing)
// With multiplexing, the socket might already be open. 
// We can just return the ref immediately, it will populate when data arrives.
// If strictly needed, we can expose a promise.
export function socketRefAsync(key, val) {
    // V2: Just return the ref, it works "async" by nature (starts default, updates later).
    // The legacy async waited for "onopen".
    return Promise.resolve(socketRef(key, val));
}
export function socketShallowRefAsync(key, val) {
    return Promise.resolve(socketShallowRef(key, val));
}

// Bind Refs (Keep existing logic, it was fine, just utility)
export function bindRefs(refA, refB) {
    let updatingA = false;
    let updatingB = false;
    const stopA = watch(refA, (v) => { if (!updatingA) { updatingB = true; refB.value = v; updatingB = false; } });
    const stopB = watch(refB, (v) => { if (!updatingB) { updatingA = true; refA.value = v; updatingA = false; } });
    return () => { stopA(); stopB(); };
}
export function bindRef(ref) {
    return { to: (refB) => { ref.value = refB.value; return bindRefs(ref, refB); } };
}
