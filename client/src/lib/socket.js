import { io } from 'socket.io-client';

const socket = io('/', {
    autoConnect: false,
    transports: ['websocket', 'polling'],
});

export function connectSocket() {
    if (!socket.connected) {
        socket.connect();
    }
    return socket;
}

export function disconnectSocket() {
    if (socket.connected) {
        socket.disconnect();
    }
}

export default socket;
