import React, { useState, useEffect } from 'react';
import Map from './components/Map';
import './App.css';
import Web3 from 'web3';

function App() {

  const createEmptyMap = () => Array.from({ length: 10 }, () => Array(10).fill(0));

  const web3 = new Web3("https://testnet-rpc1.artela.network");
  const gasPrice = 7;
  const callcata_down = "0x70e87aaf0000000000000000000000000000000000000000000000000000000000000000";
  const callcata_left = "0x70e87aaf0000000000000000000000000000000000000000000000000000000000000001";
  const callcata_up = "0x70e87aaf0000000000000000000000000000000000000000000000000000000000000002";
  const callcata_right = "0x70e87aaf0000000000000000000000000000000000000000000000000000000000000003";
  const contractAddr = "0xda27f72137a12f2e747072e198e5530348bb1bfd"

  // 假设这是异步获取到的编码数据
  const fetchEncodedBoardData = async () => {
    const response = await fetch('https://testnet-rpc1.artela.network', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [
          {
            to: contractAddr,
            data: '0x3264a34b'
          },
          'latest'
        ],
        id: 1,
      }),
    });
    const data = await response.json();
    return data.result;  // 假设结果在 `result` 字段中
  }

  const fetchScoreData = async (address) => {

    const response = await fetch('https://testnet-rpc1.artela.network', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [
          {
            to: contractAddr,
            data: "0xd47875d0000000000000000000000000" + address.slice(2)
          },
          'latest'
        ],
        id: 1,
      }),
    });
    const data = await response.json();
    return web3.eth.abi.decodeParameter("uint256", data.result);
  }

  // 解析板块数据
  const parseBoardData = (boardData) => {
    // 解析逻辑，根据你的智能合约输出格式进行调整
    return boardData.map(tile => {
      if (tile.occupantId === '0') {
        return 0;
      } else {
        // 提取第四个字符并转换为整数
        const playerNumber = parseInt(tile.player[3], 10);
        return isNaN(playerNumber) ? 9 : playerNumber; // 如果转换失败则返回 0
      }
    });
  };

  // Tile结构体的ABI定义
  const tileABI = [
    { type: 'uint8', name: 'occupantId' },
    { type: 'bool', name: 'isWall' },
    { type: 'address', name: 'player' },
  ];

  // 解码棋盘数据
  const decodeBoardData = (encodedData) => {
    // 假设你的board有100个Tile，根据你的实际数量调整
    const tileCount = 100;
    let boardData = [];
    encodedData = encodedData.slice(2);

    for (let i = 0; i < tileCount; i++) {
      const tileEncodedLength = 192; // 根据实际编码调整
      const tileData = encodedData.slice(i * tileEncodedLength, (i + 1) * tileEncodedLength);
      const decodedTile = web3.eth.abi.decodeParameters(tileABI, "0x" + tileData);
      boardData.push({
        occupantId: decodedTile.occupantId,
        isWall: decodedTile.isWall,
        player: decodedTile.player
      });
    }

    return boardData;
  };

  function convertTo2DArray(boardData, rowSize) {
    const board2D = [];
    for (let i = 0; i < boardData.length; i += rowSize) {
      board2D.push(boardData.slice(i, i + rowSize));
    }
    return board2D;
  }

  const move = async (direction) => {
    if (!playerSK) {
      return; // 如果没有私钥，返回空字符串
    }

    setIsMoving(true); // 开始移动，设置标志为 true

    const player = web3.eth.accounts.privateKeyToAccount(playerSK);

    let callData;
    switch (direction) {
      case 'up':
        callData = callcata_up;
        break;
      case 'down':
        callData = callcata_down;
        break;
      case 'left':
        callData = callcata_left;
        break;
      case 'right':
        callData = callcata_right;
        break;
      default:
        return;
    }

    let tx = {
      from: player.address,
      to: contractAddr,
      data: callData,
      gasPrice,
      gas: 20000000
    }

    // 签名并发送交易
    try {
      let signedTx = await web3.eth.accounts.signTransaction(tx, player.privateKey);
      await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
        .on('receipt', receipt => {
          console.log("receipt :", receipt);
        });
    } catch (error) {
      console.error('Error sending transaction:', error);
    }

    setIsMoving(false); // 移动结束，设置标志为 false

  };

  const getPlayerNumberFromAddress = () => {
    if (!playerSK) {
      return '-'; // 如果没有私钥，返回空字符串
    }

    try {
      const address = web3.eth.accounts.privateKeyToAccount(playerSK).address;
      return parseInt(address[3], 16); // 将地址的第4个字符（index 3）从十六进制转换为整数
    } catch (error) {
      console.error('Error getting player number:', error);
      return ''; // 出错时返回空字符串
    }
  };

  const updatePlayersList = (boardData) => {
    const newPlayers = boardData.map(tile => {
      if (tile.occupantId != '0') {
        // 假设 tile 结构包含玩家信息
        return {
          occupantId: tile.occupantId,
          player: tile.player
        };
      }
      return null;
    }).filter(player => player !== null);

    // 检查是否需要更新 players 状态
    if (newPlayers.length !== players.length ||
      !newPlayers.every((player, i) => player.occupantId === players[i]?.occupantId && player.player === players[i]?.player)) {
      setPlayers(newPlayers);
    }
  };

  const getPlayerNum = (address) => {
    return parseInt(address[3])
  };


  const [mapData, setMapData] = useState(createEmptyMap());
  const [playerSK, setPlayerSK] = useState('');
  const [isMoving, setIsMoving] = useState(false);
  const [score, setScore] = useState(0);
  const [players, setPlayers] = useState([]);


  useEffect(() => {

    const updateMap = async () => {
      const encodedData = await fetchEncodedBoardData();
      const boardData = decodeBoardData(encodedData);
      const boardDataFinal = parseBoardData(boardData);
      const boardDataFinal2D = convertTo2DArray(boardDataFinal, 10);
      setMapData(boardDataFinal2D);
      updatePlayersList(boardData);  // 更新玩家列表
    }
    updateMap();  // 首次加载时调用一次

    const fetchAllScore = async () => {
      // 获取并更新玩家分数
      const updatedPlayers = await Promise.all(players.map(async player => {
        let lastScore = await fetchScoreData(player.player); // 假设 player.player 是地址
        return {
          occupantId: player.occupantId,
          player: player.player,
          score: parseInt(lastScore)
        }
      }));
      setPlayers(updatedPlayers);
    };
    fetchAllScore();  // 首次加载时调用一次

    const fetchScore = async () => {
      if (!playerSK) {
        return '-'; // 如果没有私钥，返回空字符串
      }
      let player = web3.eth.accounts.privateKeyToAccount(playerSK);
      setScore(parseInt(await fetchScoreData(player.address)));
    };
    fetchScore();  // 首次加载时调用一次

    // 定时器逻辑
    const intervalId = setInterval(updateMap, 200);
    const intervalId2 = setInterval(fetchScore, 3000);  // 每 3 秒调用一次 fetchData
    const intervalId3 = setInterval(fetchAllScore, 3000);  // 每 3 秒调用一次 fetchData

    // 键盘事件监听逻辑
    const handleKeyDown = (event) => {
      if (isMoving) return;  // 如果正在移动，则忽略按键

      switch (event.key) {
        case 'w':
        case 'W':
        case 'ArrowUp':
          move('up');
          break;
        case 's':
        case 'S':
        case 'ArrowDown':
          move('down');
          break;
        case 'a':
        case 'A':
        case 'ArrowLeft':
          move('left');
          break;
        case 'd':
        case 'D':
        case 'ArrowRight':
          move('right');
          break;
        default:
          break;
      }
    };

    // 添加键盘事件监听
    window.addEventListener('keydown', handleKeyDown);

    // 清理函数
    return () => {
      clearInterval(intervalId);  // 清除定时器
      clearInterval(intervalId2);  // 清除定时器
      clearInterval(intervalId3);  // 清除定时器
      window.removeEventListener('keydown', handleKeyDown);  // 移除键盘事件监听
    };
  }, [isMoving]); // 依赖项列表中包括 isMoving

  return (
    <div className="App">

      <div className="content">
        <div className="map-container">
          <Map mapData={mapData} />
          <div className="control-panel">
            <button onClick={() => move('up')} disabled={isMoving}>{isMoving ? '⌛️' : 'W'}</button>
            <button onClick={() => move('left')} disabled={isMoving}>{isMoving ? '⌛️' : 'A'}</button>
            <button onClick={() => move('right')} disabled={isMoving}>{isMoving ? '⌛️' : 'S'}</button>
            <button onClick={() => move('down')} disabled={isMoving}>{isMoving ? '⌛️' : 'D'}</button>
          </div>
        </div>
        <div className="players-panel">
          <h3>玩家列表</h3>
          <ul>
            {players.map((player, index) => (
              <li key={index}>
                编号：{getPlayerNum(player.player)}, 分数：{player.score}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="player-sk-input">
        <label htmlFor="player-sk">请输入你的私钥:</label>
        <input
          type="text"
          value={playerSK}
          onChange={e => setPlayerSK(e.target.value)}
          placeholder="enter your private key"
        />
      </div>
      <div>
        你的玩家编号：<span className="player-number-value">{getPlayerNumberFromAddress()}</span>
      </div>
      <div>
        你的分数：<span className="player-number-value">{score}</span>
      </div>
    </div>
  );
}

export default App;
