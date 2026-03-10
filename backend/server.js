const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const signalingHandler = require('./socket/signaling');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Setup signaling socket handler
signalingHandler(io);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
