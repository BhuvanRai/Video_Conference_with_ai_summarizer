import React, { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import VideoCall from './VideoCall';
import { LogOut, Copy, User } from 'lucide-react';

const MeetingRoom = () => {
    const { roomID } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [userName, setUserName] = useState(location.state?.userName || '');
    const isCreator = location.state?.isCreator || false;
    const [tempName, setTempName] = useState('');
    const [error, setError] = useState('');

    const handleJoinWithLink = (e) => {
        e.preventDefault();
        if (!tempName.trim()) {
            setError("A display name is required to join.");
            return;
        }
        setUserName(tempName.trim());
    };

    // If joining directly via URL without going through Dashboard
    if (!userName) {
        return (
            <div className="dashboard-container">
                <div className="dashboard-card glass-panel" style={{ textAlign: 'center' }}>
                    <div className="dashboard-header">
                        <h2>Join Meeting Room</h2>
                        <p style={{ marginTop: '8px' }}>Room ID: <strong style={{ fontFamily: 'monospace' }}>{roomID}</strong></p>
                    </div>
                    <form onSubmit={handleJoinWithLink} className="input-group" style={{ marginTop: '24px' }}>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Enter your display name"
                            value={tempName}
                            onChange={(e) => { setTempName(e.target.value); setError(''); }}
                            style={{ borderColor: error ? 'var(--danger-color)' : 'var(--border-color)', marginBottom: '8px' }}
                        />
                        {error && <span style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginBottom: '8px', textAlign: 'left' }}>{error}</span>}
                        <button type="submit" className="btn btn-primary">
                            <User size={20} />
                            Join Room
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    const handleLeave = () => {
        navigate('/');
    };

    const copyRoomId = () => {
        navigator.clipboard.writeText(roomID);
        alert('Room ID copied to clipboard!');
    };

    return (
        <div className="room-container">
            <div className="room-header">
                <div className="room-title">
                    <h2>Meeting Room</h2>
                    <div className="room-id-badge" onClick={copyRoomId} title="Copy Room ID">
                        {roomID} <Copy size={12} style={{ marginLeft: '4px', display: 'inline-block', verticalAlign: 'middle' }} />
                    </div>
                </div>
                <button className="btn btn-danger" onClick={handleLeave} style={{ padding: '8px 16px', fontSize: '14px' }}>
                    <LogOut size={16} />
                    Leave
                </button>
            </div>
            <div className="room-content">
                <VideoCall roomID={roomID} userName={userName} isCreator={isCreator} />
            </div>
        </div>
    );
};

export default MeetingRoom;
