import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import "./App.css";

// Initialize socket connection
const socket = io("https://video-server-vobd.onrender.com"); // Replace with your server address

function App() {
  const [roomID, setRoomID] = useState(""); 
  const [inCall, setInCall] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [username, setUsername] = useState("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);

  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "turn:your-turn-server-url", 
        username: "user", 
        credential: "password",
      },
    ],
  };

  // Effect hook to handle signaling messages from server
  useEffect(() => {
    // Listen for incoming offer from remote peer
    socket.on("offer", async (offer) => {
      if (!peerConnectionRef.current) createPeerConnection();
      await peerConnectionRef.current.setRemoteDescription(offer);
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socket.emit("answer", answer, roomID);
    });

    // Listen for answer from remote peer
    socket.on("answer", async (answer) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(answer);
      }
    });

    // Listen for ICE candidates
    socket.on("ice-candidate", async (candidate) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(candidate);
      }
    });

    // Listen for incoming chat messages
    socket.on("chat-message", (message) => {
      setMessages((prevMessages) => [...prevMessages, message]);
    });

    return () => {
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("chat-message");
    };
  }, [roomID]);

  // Function to create a new peer connection
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(iceServers);

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setRemoteStream(event.streams[0]);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", event.candidate, roomID);
      }
    };

    return pc;
  };

  // Function to start the user's local media stream (audio and video)
  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      // Add local media tracks to peer connection
      stream.getTracks().forEach((track) => {
        if (peerConnectionRef.current) peerConnectionRef.current.addTrack(track, stream);
      });
    } catch (error) {
      console.error("Error accessing media devices:", error);
    }
  };

  // Join the room with the specified room ID and username
  const joinRoom = async () => {
    if (roomID && username) {
      setInCall(true);
      peerConnectionRef.current = createPeerConnection();
      await startStream();
      socket.emit("join-room", roomID, username); // Send username to the server
    } else {
      alert("Please enter a Room ID and Username.");
    }
  };

  // Create a new room and automatically join it
  const createRoom = () => {
    const newRoomID = "room-" + Math.floor(Math.random() * 10000);
    setRoomID(newRoomID);
    setInCall(true);
    peerConnectionRef.current = createPeerConnection();
    startStream();
    socket.emit("create-room", newRoomID, username); // Send username to the server
  };

  // Toggle audio on/off
  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks()[0].enabled = !isAudioEnabled;
      setIsAudioEnabled(!isAudioEnabled);
    }
  };

  // Toggle video on/off
  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks()[0].enabled = !isVideoEnabled;
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  // Function to send chat messages
  const sendMessage = () => {
    if (newMessage.trim()) {
      const message = { username, text: newMessage };
      socket.emit("chat-message", message, roomID); // Emit message to server
      setMessages((prevMessages) => [...prevMessages, message]);
      setNewMessage(""); // Clear input after sending
    }
  };

  // Function to leave the call and clean up
  const leaveCall = () => {
    setInCall(false);
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    socket.emit("leave-room", roomID); // Emit room leave event to server
    setRoomID("");
    setLocalStream(null);
    setRemoteStream(null);
  };

  return (
    <div className="app">
      <div className="header">
        <h1>QuickTalk</h1>
      </div>

      {!inCall && (
        <div className="home">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your Username"
          />
          <input
            type="text"
            value={roomID}
            onChange={(e) => setRoomID(e.target.value)}
            placeholder="Enter Room ID"
          />
          <button onClick={joinRoom}>Join Call</button>
          <button onClick={createRoom}>Create Room</button>
        </div>
      )}

      {inCall && (
        <div className="call-interface">
          <div className="video-section">
            <video ref={localVideoRef} autoPlay muted playsInline></video>
            <video ref={remoteVideoRef} autoPlay playsInline></video>
          </div>
          <div className="chat-section">
            <div className="chat-messages">
              {messages.map((message, index) => (
                <div key={index} className="chat-message">
                  <strong>{message.username}:</strong> {message.text}
                </div>
              ))}
            </div>
            <div className="chat-input">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
              />
              <button onClick={sendMessage}>Send</button>
            </div>
          </div>
          <div className="controls">
            <p>{username}</p>
            <button onClick={toggleAudio}>{isAudioEnabled ? "Mute" : "Unmute"}</button>
            <button onClick={toggleVideo}>{isVideoEnabled ? "Stop Video" : "Start Video"}</button>
            <button onClick={leaveCall}>Leave Call</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
