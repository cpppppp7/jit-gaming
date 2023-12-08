import React from 'react';
import './Map.css'; // 导入样式

function Map({ mapData }) {
  return (
    <div className="map">
      {mapData.map((row, rowIndex) => (
        row.map((cell, colIndex) => (
          <div className={`cell ${cell !== 0 ? `player${cell}` : ''}`} key={`${rowIndex}-${colIndex}`}>
            {cell !== 0 && <div className="player"> <div className="player-number">{cell}</div></div>}
          </div>
        ))
      ))}
    </div>
  );
}

export default Map;