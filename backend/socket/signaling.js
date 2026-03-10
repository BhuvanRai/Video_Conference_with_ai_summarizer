const signalingHandler = (io) => {
    const roomToUsers = {};
    const socketToRoom = {};

    io.on('connection', socket => {
        console.log(`User connected: ${socket.id}`);

        socket.on('join room', payload => {
            const { roomID, userName, isCreator } = payload;
            console.log(`[${roomID}] User ${userName} (${socket.id}) joining. isCreator: ${isCreator}`);

            if (roomToUsers[roomID]) {
                // If there is no host in the room right now, you can claim it if you're the creator
                const hasHost = roomToUsers[roomID].some(u => u.isHost === true);
                roomToUsers[roomID].push({ id: socket.id, userName, isHost: isCreator && !hasHost });
            } else {
                // First person to join the room is the host if they created it OR basically by default
                roomToUsers[roomID] = [{ id: socket.id, userName, isHost: isCreator || true }];
            }

            socketToRoom[socket.id] = roomID;

            // Get all other users in this room (to send to the new user)
            const usersInThisRoom = roomToUsers[roomID].filter(user => user.id !== socket.id);

            // Let the newly joined user know about the other users in the room
            socket.emit('all users', usersInThisRoom);

            // Tell the newly joined user if they are the host or not
            const thisUser = roomToUsers[roomID].find(user => user.id === socket.id);
            if (thisUser) {
                socket.emit('host status', thisUser.isHost);
            }
        });

        socket.on('sending signal', payload => {
            // The joining user sends an offer to an existing user
            // We need to pass along if this joining user is a host
            const room = socketToRoom[socket.id];
            const thisUserInDb = room ? roomToUsers[room].find(u => u.id === socket.id) : null;

            io.to(payload.userToSignal).emit('user joined', {
                signal: payload.signal,
                callerID: payload.callerID,
                userName: payload.userName,
                isHost: thisUserInDb ? thisUserInDb.isHost : false
            });
        });

        socket.on('returning signal', payload => {
            // The existing user replies with an answer
            const room = socketToRoom[socket.id];
            const thisUserInDb = room ? roomToUsers[room].find(u => u.id === socket.id) : null;

            io.to(payload.callerID).emit('receiving returned signal', {
                signal: payload.signal,
                id: socket.id,
                userName: payload.userName,
                isHost: thisUserInDb ? thisUserInDb.isHost : false
            });
        });

        socket.on('toggle media', payload => {
            // Forward the mute/unmute toggle to everyone else in the room
            const room = roomToUsers[payload.roomID];
            if (room) {
                room.forEach(user => {
                    if (user.id !== socket.id) {
                        io.to(user.id).emit('toggle media', {
                            id: socket.id,
                            type: payload.type,
                            enabled: payload.enabled
                        });
                    }
                });
            }
        });

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.id}`);
            const roomID = socketToRoom[socket.id];
            let room = roomToUsers[roomID];
            if (room) {
                const disconnectedUser = room.find(user => user.id === socket.id);
                room = room.filter(user => user.id !== socket.id);

                // If the host left, end the meeting for everyone
                if (disconnectedUser && disconnectedUser.isHost) {
                    console.log(`Host ${disconnectedUser.userName} left room ${roomID}. Ending meeting.`);

                    // Notify everyone else that the meeting is completely over
                    room.forEach(user => {
                        io.to(user.id).emit('meeting ended');
                        // Also force them to disconnect their sockets from this room
                        const userSocket = io.sockets.sockets.get(user.id);
                        if (userSocket) {
                            userSocket.disconnect(true);
                        }
                    });

                    // Delete the room entirely
                    delete roomToUsers[roomID];
                } else {
                    // It was just a normal participant who left
                    roomToUsers[roomID] = room;

                    // Notify others that this user left
                    room.forEach(user => {
                        io.to(user.id).emit('user left', socket.id);
                    });

                    if (room.length === 0) {
                        delete roomToUsers[roomID];
                    }
                }
            }
            delete socketToRoom[socket.id];
        });
    });
};

module.exports = signalingHandler;
