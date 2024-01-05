import React, {useCallback, useEffect, useState} from 'react';
import Map from './components/Map';
import './App.css';
import {ConnectButton} from '@rainbow-me/rainbowkit';
import royaleAbi from './royale-abi.json';
import Web3 from 'web3';
import {useAccount, usePrepareSendTransaction, useSendTransaction} from 'wagmi'

// Environment variables for RPC URL and Contract Address
const rpcUrl = 'http://127.0.0.1:8545'
const contractAddr = '0x9620F15e6B6468f05095cAC9474c35E2764532e1';

function App() {
  // Create an empty map for initial state
  const createEmptyMap = () => Array.from({ length: 10 }, () => Array(10).fill(0));
  const createEmptyArray = () => Array.from({ length: 100 }, () => 0);

  // States for the app
  const [mapData, setMapData] = useState(() => createEmptyMap());
  const [isMoving, setIsMoving] = useState(false);
  const [score, setScore] = useState(0);
  const [playerSK, setPlayerSK] = useState("");
  const [playerRoomId, setPlayerRoomId] = useState(0);
  const [roomId, setRoomId] = useState(0);
  const [gameWallet, setGameWallet] = useState("");
  const [web3, setWeb3] = useState(null);
  const [contract, setContract] = useState(null);
  const [hasGameWallet, setHasGameWallet] = useState(false);
  const [refreshIntervalId, setRefreshIntervalId] = useState(0);

  const { config } = usePrepareSendTransaction({
    to: gameWallet.trim(),
    value: 100000000000000n,
  });

  const {
    sendTransactionAsync
  } = useSendTransaction(config);

  useEffect(() => {
    const w3 = new Web3(rpcUrl);
    setWeb3(w3);
    setContract(new w3.eth.Contract(royaleAbi, contractAddr));
  }, []);

  // Account information from wagmi
  const { address } = useAccount();

  const getPlayerNumberFromAddress = useCallback(async () => {
    if (!contract || !gameWallet) {
      console.log('Not initialized');
      return;
    }

    const playerRoomId = await contract.methods.getPlayerNumberInRoom(gameWallet).call();
    const playerRoomIdNumber = parseInt(playerRoomId, 10);
    if (playerRoomIdNumber) {
      setPlayerRoomId(playerRoomIdNumber);
    }
  }, [contract, gameWallet]);

  // Fetch board data from the blockchain
  const fetchBoardData = useCallback(async () => {
    if (!contract || !gameWallet) {
      console.log('Not initialized');
      return createEmptyArray();
    }

    try {
      const boardData = await contract.methods.getBoard().call({from: gameWallet});
      return boardData.map((value) => parseInt(value, 10));
    } catch (error) {
      console.error('Error fetching board data:', error);
      return createEmptyArray();
    }
  }, [contract, gameWallet]);

  const loadUserScore = useCallback(async () => {
    if (!contract || !gameWallet) {
      console.log('Not initialized');
      return 0;
    }
    try {
      const score = await contract.methods.getScore(gameWallet).call();
      setScore(parseInt(score, 10));
    } catch (error) {
      console.error('Error fetching user score:', error);
    }
  }, [contract, gameWallet]);

  // Convert linear array to 2D array for the board
  const convertTo2DArray = useCallback((boardData, rowSize) => {
    const board2D = [];
    for (let i = 0; i < boardData.length; i += rowSize) {
      board2D.push(boardData.slice(i, i + rowSize));
    }
    return board2D;
  }, []);

  // Move the player on the board
  const move = useCallback(async (direction) => {
    if (!roomId || roomId < 0) {
      console.error('Error: not joined any room');
      return;
    }

    if (!contract || !web3 || !playerSK) {
      console.log('Not initialized');
      return;
    }

    setIsMoving(true);
    try {
      const player = web3.eth.accounts.privateKeyToAccount(playerSK);
      const directionCode = getDirectionCode(direction);
      const callData = contract.methods.move(roomId, directionCode).encodeABI();
      const gasPrice = await web3.eth.getGasPrice();
      const tx = {
        from: player.address,
        to: contractAddr,
        data: callData,
        gasPrice,
        gas: 20000000
      };

      let signedTx = await web3.eth.accounts.signTransaction(tx, player.privateKey);
      await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
          .on('receipt', receipt => {
            console.log("Transaction receipt :", receipt);
          });
    } catch (error) {
      console.error('Error sending transaction:', error);
    } finally {
      setIsMoving(false);
    }
  }, [web3, contract, playerSK, roomId]);

  // Get player's room ID
  const loadJoinedRoom = useCallback(async () => {
    if (!contract || !web3 || !gameWallet) {
      console.log('Not initialized');
      return;
    }

    try {
      const joinedRoom = await contract.methods.getJoinedRoom().call({
        from: gameWallet
      });
      const roomId = parseInt(joinedRoom, 10);
      if (roomId) {
        setRoomId(roomId);
      }
    } catch (error) {
      console.error('Error getting joined room:', error);
    }
  }, [web3, contract, gameWallet]);

  // Update map and load joined room periodically
  useEffect(() => {
    if (refreshIntervalId && !hasGameWallet) {
      // clear the timer if we don't have game wallet
      clearInterval(refreshIntervalId);
      setRefreshIntervalId(0);
    }

    return () => {
      // release the timer
      if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
      }
    }
  }, [refreshIntervalId, hasGameWallet]);

  // Handle keydown events for player movement
  useEffect(() => {
    const handleKeyDown = async (event) => {
      if (isMoving) return;

      switch (event.key) {
        case 'w':
        case 'W':
        case 'ArrowUp':
          await move('up');
          break;
        case 's':
        case 'S':
        case 'ArrowDown':
          await move('down');
          break;
        case 'a':
        case 'A':
        case 'ArrowLeft':
          await move('left');
          break;
        case 'd':
        case 'D':
        case 'ArrowRight':
          await move('right');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move, isMoving]);

  // Get direction code based on the input
  const getDirectionCode = (direction) => {
    const directionMap = {
      'down': 0,
      'left': 1,
      'up': 2,
      'right': 3
    };
    return directionMap[direction];
  };

  const prepare = useCallback(async () => {
    const updateMap = async () => {
      const boardData = await fetchBoardData();
      const isEmptyBoard = boardData.every((value) => value === 0);
      const boardDataFinal2D = convertTo2DArray(boardData, 10);
      setMapData(boardDataFinal2D);
      await loadUserScore();
      if (isEmptyBoard) {
        setHasGameWallet(false);
        setGameWallet('');
      }
    };
    updateMap().then(() => {
      setRefreshIntervalId(setInterval(updateMap, 1000));
      setHasGameWallet(true);
    });
  }, [convertTo2DArray, fetchBoardData, loadUserScore]);


  const deposit = useCallback(async () => {
    if (!sendTransactionAsync) {
        console.log('Not initialized');
        return;
    }
    let txHash = "";
    let ret = await sendTransactionAsync();
    txHash = ret.hash;
    console.log('Deposit Transaction hash:', txHash);
    let txReceipt = false;
    let txReceiptStatus = false;
    // we wait maximum 1 min, if tx still not confirmed, we will throw an error
    const timeoutId = setTimeout(() => {
      throw new Error('Deposit transaction timeout');
    }, 10 * 60 * 1000);
    while (!txReceipt) {
      await new Promise(resolve => setTimeout(resolve, 500));
      try {
        let receipt = await web3.eth.getTransactionReceipt(txHash);
        console.log("tx receipt:", receipt);
        if (receipt) {
          txReceipt = true;
          txReceiptStatus = receipt.status;
        }
      } catch (error) {
        console.log(error);
      }
    }

    // clear the timeout
    clearTimeout(timeoutId);

    if (!txReceiptStatus) {
      throw new Error('Deposit failed: ' + txReceiptStatus);
    }
  }, [web3, sendTransactionAsync]);

  // Clear all states
  const clearStates = useCallback(() => {
    setMapData(createEmptyMap());
    setPlayerRoomId(0);
    setRoomId(0);
    setHasGameWallet(false);
    setGameWallet("");
    setPlayerSK("");
    setRefreshIntervalId(0);
  }, []);

  useEffect(() => {
    if (!gameWallet) {
      return;
    }

    const load = async () => {
      let gameAccountBalance = parseInt(await web3.eth.getBalance(gameWallet), 10);
      if (gameAccountBalance < 10000000000000n) {
        console.log("Insufficient balance, initializing transaction...");
        // Transaction logic to deposit funds into game account
        await deposit();
      }

      if (roomId) {
        await getPlayerNumberFromAddress();
        await prepare();
        return;
      }
      // Join a room logic
      const joinRoomData = contract.methods.join().encodeABI();
      const gasPrice = await web3.eth.getGasPrice();

      const tx = {
        from: gameWallet,
        to: contractAddr,
        data: joinRoomData,
        gasPrice,
        gas: 20000000
      };

      let signedTx = await web3.eth.accounts.signTransaction(tx, playerSK);
      await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
        .on('receipt', receipt => {
          console.log("Joined room. Transaction receipt:", receipt);
        });
      await getPlayerNumberFromAddress();
      await loadJoinedRoom();
      await prepare();
    }
    loadJoinedRoom().then(() => load().catch(() => {
      setHasGameWallet(false);
      setGameWallet('');
    }));
  }, [web3, contract, gameWallet, hasGameWallet, playerSK, deposit, address, prepare, loadJoinedRoom, roomId, getPlayerNumberFromAddress]);

  // Check and handle game account logic
  const handleGameAccount = useCallback(async () => {
    // clear the state so make sure the hooks are properly triggered
    await clearStates();

    let sKeyPrivKey = loadGameAccount(address);
    if (!sKeyPrivKey) {
      sKeyPrivKey = web3.eth.accounts.create(web3.utils.randomHex(32)).privateKey;
      saveGameAccount(address, sKeyPrivKey);
    }

    setPlayerSK(sKeyPrivKey);

    let sKeyAccount = web3.eth.accounts.privateKeyToAccount(sKeyPrivKey);
    setGameWallet(sKeyAccount.address);
  }, [web3, address, clearStates]);

  // Load game account from local storage
  const loadGameAccount = (wallet) => {
    if (!wallet) {
      return null;
    }
    return localStorage.getItem('jit_gaming_account' + wallet);
  };

  // Save game account to local storage
  const saveGameAccount = (wallet, input) => {
    if (!wallet) {
      return;
    }
    localStorage.setItem('jit_gaming_account' + wallet, input);
  };

  // Render the component
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
                <button className="rounded-button" onClick={handleGameAccount} disabled={hasGameWallet}>
                  {hasGameWallet ? 'Game account: active' : 'Press to init game account'}
                </button>
                <div className='line'>
                  your player id: <span className="player-number-value">{playerRoomId}</span>
                </div>
                <div className='line'>
                  history score: <span className="player-number-value">{score}</span>
                </div>
                {/* Additional wallet information */}
                <div className='line'>
                  account: <span className="player-number-value">{address}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}

export default App;

