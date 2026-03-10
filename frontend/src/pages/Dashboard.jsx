import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Keyboard } from 'lucide-react';

const Dashboard = () => {
    const [roomId, setRoomId] = useState('');
    const [userName, setUserName] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleCreateRoom = () => {
        if (!userName.trim()) {
            setError("Please enter your name to continue");
            return;
        }
        setError('');
        // Generate a simple unique ID
        const newRoomId = Math.random().toString(36).substring(2, 10);
        navigate(`/room/${newRoomId}`, { state: { userName: userName.trim(), isCreator: true } });
    };

    const handleJoinRoom = (e) => {
        e.preventDefault();
        if (!userName.trim()) {
            setError("Please enter your name to continue");
            return;
        }
        setError('');
        if (roomId.trim()) {
            navigate(`/room/${roomId.trim()}`, { state: { userName: userName.trim(), isCreator: false } });
        }
    };

    return (
        <div className="dashboard-container">
            <div className="dashboard-card glass-panel">
                <div className="dashboard-header">
                    <h1>Fundify Meet</h1>
                    <p>Premium Video Calling</p>
                </div>

                <div className="dashboard-actions">
                    <div className="input-group" style={{ marginBottom: '12px' }}>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Your Display Name"
                            value={userName}
                            onChange={(e) => { setUserName(e.target.value); setError(''); }}
                            style={{ borderColor: error ? 'var(--danger-color)' : 'var(--border-color)' }}
                        />
                        {error && <span style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginTop: '4px' }}>{error}</span>}
                    </div>

                    <button className="btn btn-primary" onClick={handleCreateRoom}>
                        <Video size={20} />
                        New Meeting
                    </button>

                    <div className="divider">or</div>

                    <form onSubmit={handleJoinRoom} className="input-group">
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Enter meeting room ID"
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value)}
                        />
                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                            disabled={!roomId.trim()}
                        >
                            <Keyboard size={20} />
                            Join Meeting
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
