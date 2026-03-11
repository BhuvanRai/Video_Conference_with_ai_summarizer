import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { Mic, MicOff, Video as VideoIcon, VideoOff, AlertTriangle } from 'lucide-react';

// Sub-component to render the video element correctly from a MediaStream setup
const Video = ({ stream, isLocal, isVideoMuted, isAudioMuted, name, isHost }) => {
    const ref = useRef();
    const [audioLevels, setAudioLevels] = useState([15, 15, 15]);

    useEffect(() => {
        let audioContext;
        let analyser;
        let source;
        let animationFrameId;

        if (ref.current && stream) {
            ref.current.srcObject = stream;
            // Hack to ensure audio plays perfectly in some browsers without user interaction
            if (!isLocal) ref.current.play().catch(e => console.error("Video play failed", e));

            // Set up AudioContext for visualizer if there's an audio track
            if (stream.getAudioTracks().length > 0) {
                try {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    analyser = audioContext.createAnalyser();
                    analyser.fftSize = 64; // Small FFT for simple amplitude visualization
                    source = audioContext.createMediaStreamSource(stream);
                    source.connect(analyser);

                    const dataArray = new Uint8Array(analyser.frequencyBinCount); // 32 bins

                    const updateLevels = () => {
                        analyser.getByteFrequencyData(dataArray);

                        let b1 = 0, b2 = 0, b3 = 0;
                        // Grab peak frequencies instead of averages
                        // Focusing entirely on the lower/mid voice bands (0-16 bins out of 32)
                        // This ensures all 3 bars get strong voice activity
                        for (let i = 0; i < 4; i++) if (dataArray[i] > b1) b1 = dataArray[i];
                        for (let i = 4; i < 9; i++) if (dataArray[i] > b2) b2 = dataArray[i];
                        for (let i = 9; i < 16; i++) if (dataArray[i] > b3) b3 = dataArray[i];

                        const normalize = (val) => Math.min(100, Math.max(15, (val / 255) * 200));

                        setAudioLevels([
                            normalize(b1),
                            normalize(b2),
                            normalize(b3)
                        ]);

                        animationFrameId = requestAnimationFrame(updateLevels);
                    };

                    if (audioContext.state === 'suspended') {
                        audioContext.resume();
                    }

                    updateLevels();
                } catch (err) {
                    console.error("Audio visualizer error:", err);
                }
            }
        }

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (source) source.disconnect();
            if (analyser) analyser.disconnect();
            if (audioContext && audioContext.state !== 'closed') {
                audioContext.close().catch(e => console.error(e));
            }
        };
    }, [stream, isLocal]);

    return (
        <div className="video-container" style={{ background: isVideoMuted ? '#1a1a1a' : '#000' }}>
            <video
                playsInline
                autoPlay
                muted={isLocal || isAudioMuted}
                ref={ref}
                style={{ opacity: isVideoMuted ? 0 : 1 }}
                className={`video-element ${isLocal ? 'local-video' : ''}`}
            />
            {isVideoMuted && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#555' }}>
                    <VideoOff size={48} />
                </div>
            )}
            {(!isLocal && (isVideoMuted || isAudioMuted)) && (
                <div style={{
                    position: 'absolute', top: 16, right: 16,
                    display: 'flex', gap: '8px',
                    background: 'rgba(0,0,0,0.6)', padding: '6px 10px',
                    borderRadius: '20px', color: '#ff4b4b', zIndex: 5
                }}>
                    {isAudioMuted && <MicOff size={16} />}
                    {isVideoMuted && <VideoOff size={16} />}
                </div>
            )}
            <div className="video-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: 'fit-content', gap: '12px' }}>
                <div>
                    {name || (isLocal ? 'You' : 'Participant')}
                    {isHost && <span style={{ marginLeft: '6px', background: 'var(--primary-color)', padding: '2px 6px', borderRadius: '10px', fontSize: '0.7em', fontWeight: 'bold' }}>HOST</span>}
                </div>
                {!isAudioMuted && (
                    <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '16px' }} title="Voice Activity">
                        <div style={{ width: '4px', height: `${audioLevels[0]}%`, background: '#ffffff', borderRadius: '2px', transition: 'height 0.1s ease' }} />
                        <div style={{ width: '4px', height: `${audioLevels[1]}%`, background: '#ffffff', borderRadius: '2px', transition: 'height 0.1s ease' }} />
                        <div style={{ width: '4px', height: `${audioLevels[2]}%`, background: '#ffffff', borderRadius: '2px', transition: 'height 0.1s ease' }} />
                    </div>
                )}
            </div>
        </div>
    );
};

const VideoCall = ({ roomID, userName, isCreator }) => {
    const [peers, setPeers] = useState([]);
    const [isHost, setIsHost] = useState(false);
    const socketRef = useRef();
    const userStream = useRef();
    const peersRef = useRef([]);

    const [isAudioMuted, setIsAudioMuted] = useState(false);
    const [isVideoMuted, setIsVideoMuted] = useState(false);
    const [localStreamObj, setLocalStreamObj] = useState(null);
    const [mediaError, setMediaError] = useState(null);
    const [meetingEnded, setMeetingEnded] = useState(false);

    useEffect(() => {
        socketRef.current = io('http://localhost:5000');

        // Get Local Media Stream with optimized constraints for multi-user mesh
        const mediaConstraints = {
            audio: true,
            video: {
                width: { ideal: 640, max: 1280 }, // Limit to 720p max, request 480p ideal
                height: { ideal: 480, max: 720 },
                frameRate: { ideal: 24, max: 30 } // 24fps is plenty for video calls, saves major bandwidth
            }
        };

        navigator.mediaDevices.getUserMedia(mediaConstraints).then(stream => {
            userStream.current = stream;
            setLocalStreamObj(stream);

            socketRef.current.emit('join room', { roomID, userName, isCreator });

            socketRef.current.on('host status', status => {
                setIsHost(status);
            });

            socketRef.current.on('new host', newHostId => {
                setPeers(prev => prev.map(p => {
                    if (p.peerID === newHostId) return { ...p, isHost: true };
                    return { ...p, isHost: false };
                }));
            });

            const getOrCreatePeer = (peerID, isInitiator, peerName = '', peerIsHost = false) => {
                let peerObj = peersRef.current.find(p => p.peerID === peerID);
                if (!peerObj) {
                    // Optimized ICE configuration
                    const pc = new RTCPeerConnection({
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' }
                        ],
                        // Bundle policy helps combine media tracks over a single transport to save overhead
                        bundlePolicy: 'max-bundle'
                    });

                    stream.getTracks().forEach(track => {
                        // Advanced: If browser supports it, heavily compress outgoing video bitrates for mesh
                        const sender = pc.addTrack(track, stream);
                        if (track.kind === 'video' && sender.getParameters) {
                            const parameters = sender.getParameters();
                            if (!parameters.encodings) parameters.encodings = [{}];
                            // Soft limit to roughly 500kbps per video stream outgoing
                            parameters.encodings[0].maxBitrate = 500000;
                            sender.setParameters(parameters).catch(e => console.warn("Bitrate setting unsupported", e));
                        }
                    });

                    pc.onicecandidate = event => {
                        if (event.candidate) {
                            const signalEvent = isInitiator ? 'sending signal' : 'returning signal';
                            const target = isInitiator
                                ? { userToSignal: peerID, callerID: socketRef.current.id, signal: event.candidate, userName, isHost }
                                : { signal: event.candidate, callerID: peerID, userName, isHost };
                            socketRef.current.emit(signalEvent, target);
                        }
                    };

                    pc.ontrack = event => {
                        setPeers(prev => {
                            const exists = prev.find(p => p.peerID === peerID);
                            if (exists) {
                                return prev.map(p => p.peerID === peerID ? { ...p, stream: event.streams[0] } : p);
                            } else {
                                return [...prev, { peerID, stream: event.streams[0], userName: peerName, isHost: peerIsHost }];
                            }
                        });
                    };

                    peerObj = { peerID, pc, userName: peerName, isHost: peerIsHost };
                    peersRef.current.push(peerObj);

                    // Add skeleton peer to state if they don't have track yet
                    setPeers(prev => {
                        const existing = prev.find(p => p.peerID === peerID);
                        if (!existing) {
                            return [...prev, { peerID, stream: null, userName: peerName, isHost: peerIsHost }];
                        }
                        // If they already exist, just update their user info
                        return prev.map(p => p.peerID === peerID ? { ...p, userName: peerName || p.userName, isHost: peerIsHost ?? p.isHost } : p);
                    });
                }
                return peerObj.pc;
            };

            socketRef.current.on('all users', users => {
                users.forEach(user => {
                    const pc = getOrCreatePeer(user.id, true, user.userName, user.isHost);
                    pc.createOffer()
                        .then(offer => pc.setLocalDescription(offer))
                        .then(() => {
                            socketRef.current.emit('sending signal', {
                                userToSignal: user.id,
                                callerID: socketRef.current.id,
                                userName: userName,
                                isHost: isHost, // The local user's host status
                                signal: pc.localDescription
                            });
                        });
                });
            });

            socketRef.current.on('user joined', payload => {
                const pc = getOrCreatePeer(payload.callerID, false, payload.userName, payload.isHost);

                // Explicitly update peers state with the right info 
                setPeers(prev => prev.map(p => {
                    if (p.peerID === payload.callerID) {
                        return { ...p, userName: payload.userName, isHost: payload.isHost };
                    }
                    return p;
                }));

                if (payload.signal.type === 'offer') {
                    pc.setRemoteDescription(new RTCSessionDescription(payload.signal))
                        .then(() => pc.createAnswer())
                        .then(answer => pc.setLocalDescription(answer))
                        .then(() => {
                            socketRef.current.emit('returning signal', {
                                signal: pc.localDescription,
                                callerID: payload.callerID,
                                userName: userName,
                                isHost: isHost // the local user answering
                            });
                        }).catch(e => console.error("Error handling offer", e));
                } else if (payload.signal.candidate) {
                    pc.addIceCandidate(new RTCIceCandidate(payload.signal)).catch(e => console.error("Error adding candidate", e));
                }
            });

            socketRef.current.on('receiving returned signal', payload => {
                // When receiving an answer, the remote peer should also pass back their name and host status
                let peerName = payload.userName || '';
                let peerIsHost = payload.isHost || false;

                setPeers(prev => prev.map(p => {
                    if (p.peerID === payload.id && (peerName || peerIsHost !== undefined)) {
                        return { ...p, userName: peerName, isHost: peerIsHost };
                    }
                    return p;
                }));

                const pc = getOrCreatePeer(payload.id, true, peerName, peerIsHost);
                if (payload.signal.type === 'answer') {
                    pc.setRemoteDescription(new RTCSessionDescription(payload.signal)).catch(e => console.error(e));
                } else if (payload.signal.candidate) {
                    pc.addIceCandidate(new RTCIceCandidate(payload.signal)).catch(e => console.error(e));
                }
            });

            socketRef.current.on('user left', id => {
                const peerObj = peersRef.current.find(p => p.peerID === id);
                if (peerObj) peerObj.pc.close();
                peersRef.current = peersRef.current.filter(p => p.peerID !== id);
                setPeers(users => users.filter(user => user.peerID !== id));
            });

            // Handle meeting termination if host leaves
            socketRef.current.on('meeting ended', () => {
                setMeetingEnded(true);
                // We'll disconnect their local tracks and peers.
                peersRef.current.forEach(peer => peer.pc.close());
                if (userStream.current) {
                    userStream.current.getTracks().forEach(track => track.stop());
                }
                socketRef.current.disconnect();
            });

            // Handle remote track toggling
            socketRef.current.on('toggle media', payload => {
                setPeers(prev => prev.map(p => {
                    if (p.peerID === payload.id) {
                        return {
                            ...p,
                            mutedAudio: payload.type === 'audio' ? !payload.enabled : p.mutedAudio,
                            mutedVideo: payload.type === 'video' ? !payload.enabled : p.mutedVideo
                        };
                    }
                    return p;
                }));
            });

        }).catch(err => {
            console.error("Failed to get local stream", err);
            if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                setMediaError("Your camera or microphone is already in use by another application. Please close it and refresh.");
            } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setMediaError("Camera/Microphone access denied. Please grant permissions and refresh.");
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                setMediaError("No camera or microphone found on this device.");
            } else {
                setMediaError(`Could not access media devices: ${err.message}`);
            }
        });

        return () => {
            socketRef.current.disconnect();
            peersRef.current.forEach(peer => peer.pc.close());
            if (userStream.current) {
                userStream.current.getTracks().forEach(track => track.stop());
            }
        };
    }, [roomID]);

    const toggleAudio = () => {
        if (userStream.current) {
            const audioTracks = userStream.current.getAudioTracks();
            if (audioTracks.length > 0) {
                const newState = !audioTracks[0].enabled;
                audioTracks.forEach(track => track.enabled = newState);
                setIsAudioMuted(!newState);

                socketRef.current.emit('toggle media', {
                    roomID,
                    type: 'audio',
                    enabled: newState
                });
            }
        }
    };

    const toggleVideo = () => {
        if (userStream.current) {
            const videoTracks = userStream.current.getVideoTracks();
            if (videoTracks.length > 0) {
                const newState = !videoTracks[0].enabled;
                videoTracks.forEach(track => track.enabled = newState);
                setIsVideoMuted(!newState);

                socketRef.current.emit('toggle media', {
                    roomID,
                    type: 'video',
                    enabled: newState
                });
            }
        }
    };

    // Calculate the number of active video streams (local + remote)
    const activePeersCount = peers.filter(p => p.stream).length;
    const totalVideos = localStreamObj ? activePeersCount + 1 : activePeersCount;

    // Explicit width logic based on participant count
    let widthPercent = 100;
    if (totalVideos === 2) widthPercent = 50;
    else if (totalVideos >= 3) widthPercent = 33.33;

    if (meetingEnded) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', padding: '20px' }}>
                <div className="glass-panel" style={{ padding: '40px', maxWidth: '440px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ background: 'rgba(255, 75, 75, 0.15)', padding: '24px', borderRadius: '50%', marginBottom: '24px' }}>
                        <AlertTriangle size={56} style={{ color: 'var(--danger-color)' }} />
                    </div>
                    <h2 style={{ marginBottom: '16px', fontSize: '1.75rem', fontWeight: 600 }}>Meeting Ended</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', lineHeight: '1.6', fontSize: '1.1rem' }}>The host has left and concluded this meeting for all participants.</p>
                    <button onClick={() => window.location.href = '/'} className="btn btn-primary" style={{ width: '100%', padding: '14px' }}>
                        Return to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            <div
                className={`video-grid video-grid-${totalVideos}`}
                style={{
                    '--total-videos': totalVideos,
                    '--video-width': widthPercent,
                }}
            >
                {mediaError ? (
                    <div className="video-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ff4b4b', padding: '20px', textAlign: 'center', background: 'rgba(255, 75, 75, 0.1)' }}>
                        <AlertTriangle size={48} style={{ marginBottom: '16px' }} />
                        <h3>Media Access Error</h3>
                        <p style={{ marginTop: '8px', color: '#fff' }}>{mediaError}</p>
                    </div>
                ) : localStreamObj && (
                    <Video stream={localStreamObj} isLocal={true} isVideoMuted={isVideoMuted} name={`${userName} (You)`} isHost={isHost} />
                )}

                {peers.map((peer, index) => {
                    if (!peer.stream) return null; // Avoid rendering empty video elements
                    return (
                        <Video
                            key={peer.peerID}
                            stream={peer.stream}
                            isLocal={false}
                            isVideoMuted={peer.mutedVideo}
                            isAudioMuted={peer.mutedAudio}
                            name={peer.userName}
                            isHost={peer.isHost}
                        />
                    );
                })}
            </div>

            <div className="controls-bar glass-panel">
                <button
                    className={`btn btn-icon btn-control ${isAudioMuted ? 'inactive' : 'active'}`}
                    onClick={toggleAudio}
                    title={isAudioMuted ? "Unmute Mic" : "Mute Mic"}
                >
                    {isAudioMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button
                    className={`btn btn-icon btn-control ${isVideoMuted ? 'inactive' : 'active'}`}
                    onClick={toggleVideo}
                    title={isVideoMuted ? "Turn on Camera" : "Turn off Camera"}
                >
                    {isVideoMuted ? <VideoOff size={20} /> : <VideoIcon size={20} />}
                </button>
            </div>
        </>
    );
};

export default VideoCall;
