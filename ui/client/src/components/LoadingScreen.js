import React from 'react';
import './LoadingScreen.css'; // Make sure to create a LoadingScreen.css file for styles

const LoadingScreen = () => (
    <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading game, please wait...</p>
    </div>
);

export default LoadingScreen;
