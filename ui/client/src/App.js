import React, { useState, useEffect } from 'react';
import Map from './components/Map';
import './App.css';
import Web3 from 'web3';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSendTransaction, usePrepareSendTransaction, useWaitForTransaction } from 'wagmi'

function App() {

  const createEmptyMap = () => Array.from({ length: 10 }, () => Array(10).fill(0));

  const web3 = new Web3("https://testnet-rpc1.artela.network");
  const gasPrice = 7;
  const callcata_down = "0x70e87aaf0000000000000000000000000000000000000000000000000000000000000000";
  const callcata_left = "0x70e87aaf0000000000000000000000000000000000000000000000000000000000000001";
  const callcata_up = "0x70e87aaf0000000000000000000000000000000000000000000000000000000000000002";
  const callcata_right = "0x70e87aaf0000000000000000000000000000000000000000000000000000000000000003";
  const contractAddr = "0xda27f72137a12f2e747072e198e5530348bb1bfd"

  const [mapData, setMapData] = useState(createEmptyMap());
  const [isMoving, setIsMoving] = useState(false);
  const [score, setScore] = useState(0);
  const [players, setPlayers] = useState([]);
  const [playerSK, setPlayerSK] = useState("");

  const [gameWallet, setGameWallet] = useState("");
  const [hasGameWallet, setHasGameWallet] = useState(false);

  const { address, isConnected } = useAccount()

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
        const playerNumber = getPlayerNum(tile.player);
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
      return getPlayerNum(address);
    } catch (error) {
      console.error('Error getting player number:', error);
      return '-'; // 出错时返回空字符串
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
    return parseInt(address.slice(3, 5), 16)
  };

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
    // fetchAllScore();  // 首次加载时调用一次

    const fetchScore = async () => {
      if (!playerSK) {
        return '-'; // 如果没有私钥，返回空字符串
      }
      let player = web3.eth.accounts.privateKeyToAccount(playerSK);
      setScore(parseInt(await fetchScoreData(player.address)));
    };
    fetchScore();  // 首次加载时调用一次

    // 定时器逻辑
    const intervalId = setInterval(updateMap, 1000);
    // const intervalId2 = setInterval(fetchScore, 3000);  // 每 3 秒调用一次 fetchData
    // const intervalId3 = setInterval(fetchAllScore, 3000);  // 每 3 秒调用一次 fetchData

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

    checkGameAccount();

    // 清理函数
    return () => {
      clearInterval(intervalId);  // 清除定时器
      // clearInterval(intervalId2);  // 清除定时器
      // clearInterval(intervalId3);  // 清除定时器
      window.removeEventListener('keydown', handleKeyDown);  // 移除键盘事件监听
    };
  }, [isMoving, address, isConnected]); // 依赖项列表中包括 isMoving

  const { config, error } = usePrepareSendTransaction({
    to: gameWallet.trim(),
    value: 10000000000000000n,
    data: "0xCAFE240108"
  })
  const { data, isLoading, isSuccess, sendTransaction, sendTransactionAsync } = useSendTransaction(config);

  function stringToHex(str) {
    let hexStr = '';
    for (let i = 0; i < str.length; i++) {
      hexStr += str.charCodeAt(i).toString(16);
    }
    return "0x" + hexStr;
  }

  const checkGameAccount = async () => {

    let sKeyPrivKey = loadGameAccount(address);
    if (sKeyPrivKey === null) {
      setHasGameWallet(false);
      return;
    }

    let sKeyAccount = web3.eth.accounts.privateKeyToAccount(sKeyPrivKey);
    setGameWallet(sKeyAccount.address);
    console.log("session key: ", sKeyAccount.address);

    let gameAccountBalance = parseInt(await web3.eth.getBalance(sKeyAccount.address));

    console.log("balance:" + gameAccountBalance);
    if (gameAccountBalance < 10000000000000n) {
      setHasGameWallet(false);
      return;
    }

    setPlayerSK(sKeyPrivKey);
    setHasGameWallet(true);
  };

  const activeGameAccount = async () => {

    let sKeyPrivKey = loadGameAccount(address);
    if (sKeyPrivKey === null) {
      sKeyPrivKey = web3.eth.accounts.create(web3.utils.randomHex(32)).privateKey;
      saveGameAccount(address, sKeyPrivKey);
    }

    let sKeyAccount = web3.eth.accounts.privateKeyToAccount(sKeyPrivKey);
    setGameWallet(sKeyAccount.address);
    console.log("session key: ", sKeyAccount.address);

    let gameAccountBalance = parseInt(await web3.eth.getBalance(sKeyAccount.address));

    console.log("balance:" + gameAccountBalance);
    if (gameAccountBalance < 10000000000000n) {
      console.log("deposit...");

      await new Promise(resolve => setTimeout(resolve, 200));
      if (!sendTransactionAsync) {
        throw "tx init fail."
      }

      let txHash = "";
      try {
        let ret = await sendTransactionAsync();
        txHash = ret.hash;
        console.log('Transaction hash:', txHash);
      } catch (error) {
        return;
      }

      let txReceipt = false;
      let txReceiptStatus = false;
      while (!txReceipt) {
        await new Promise(resolve => setTimeout(resolve, 500));
        try {
          let receipt = await web3.eth.getTransactionReceipt(txHash);
          console.log("tx receipt:", receipt);
          if (receipt != null) {
            txReceipt = true;
            txReceiptStatus = receipt.status;
          }
        } catch (error) {
          console.log(error);
        }
      }

      if (!txReceiptStatus) {
        return;
      }
    }

    setPlayerSK(sKeyPrivKey);
    setHasGameWallet(true);
  };

  const saveGameAccount = (wallet, input) => {
    console.log("saveGameAccount: " + wallet);
    if (wallet == "" || wallet == null) {
      return;
    }

    localStorage.setItem('jit_gaming_account' + wallet, input);
  };

  const loadGameAccount = (wallet) => {
    console.log("loadGameAccount:", wallet, wallet == "");
    if (wallet == "") {
      return null;
    }
    const storedData = localStorage.getItem('jit_gaming_account' + wallet);
    return storedData;
  };

  return (
    <div className="App">
      <div className="content">
        <div className="map-container">
          <Map mapData={mapData} />
          <div className="control-panel">
            <button onClick={() => move('up')} disabled={isMoving}>{isMoving ? '⌛️' : 'W'}</button>
            <button onClick={() => move('left')} disabled={isMoving}>{isMoving ? '⌛️' : 'A'}</button>
            <button onClick={() => move('right')} disabled={isMoving}>{isMoving ? '⌛️' : 'D'}</button>
            <button onClick={() => move('down')} disabled={isMoving}>{isMoving ? '⌛️' : 'S'}</button>
          </div>
          <div className="wallet-panel">
            <div className="wallet-sub-panel">
              <ConnectButton />
            </div>
            <div className="wallet-sub-panel">
              <button className="rounded-button" onClick={() => activeGameAccount()} disabled={hasGameWallet}>{hasGameWallet ? 'Game account: active' : 'Press to init game account'}</button>
              <div className='line'>
                your player id: <span className="player-number-value">{getPlayerNumberFromAddress()}</span>
              </div>
              <div className='line'>
                history score: <span className="player-number-value">{score}</span>
              </div>
              {/* <div className='line'>
                account: <span className="player-number-value">{address}</span>
              </div> */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
