import { ConnectButton } from '@rainbow-me/rainbowkit';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import { useAccount, usePrepareSendTransaction, useSendTransaction } from 'wagmi'
import Web3 from 'web3';
import LoadingScreen from './components/LoadingScreen';
import './App.css';
import Map from './components/Map';
import royaleAbi from './royale-abi.json';
import 'react-toastify/dist/ReactToastify.css';
import 'bootstrap/dist/css/bootstrap.min.css';

// Environment variables for RPC URL and Contract Address
const rpcUrls = [
  'https://betanet-inner2.artela.network',
  'https://betanet-inner3.artela.network',
  'https://betanet-inner4.artela.network'
]
const contractAddr = '0x6559c92980E7DCa126738D47c58b41f6719799bB';

function DeathModal({ show, onRejoin }) {
  if (!show) return null;

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>You have been defeated</h2>
        <button onClick={ onRejoin } className="rejoin-game">Rejoin Game</button>
      </div>
    </div>
  );
}

const Banner = () => {
  return (
    <div className="event-banner alert alert-danger alert-dismissible" role="alert"
         onClick={ () => window.location.href = 'https://galxe.com/bitmart-exchange/campaign/GCGQ9ttwdH' }>
      Play fully on-chain game with on-chain NPC! <br/>
      Achieve 5 scores to win reward!
    </div>
  );
};

function App() {
  const createConnByRoomId = (roomId) => {
    const rpcUrl = !roomId || roomId <= 0
      // if not joined any room, we return a random one
      ? rpcUrls[Math.floor(Math.random() * 10) % rpcUrls.length]
      : rpcUrls[roomId % rpcUrls.length];

    console.log(`Room id is ${ roomId }, using rpc url ${ rpcUrl }`);
    return new Web3(rpcUrl);
  }

  // Create an empty map for initial state
  const createEmptyMap = () => Array.from({ length: 10 }, () => Array(10).fill(0));
  const createEmptyArray = () => Array.from({ length: 100 }, () => 0);
  const defaultGameStatus = () => ({
    playerIdInRoom: 0,
    roomId: 0,
    mapData: createEmptyMap(),
    score: 0
  });

  const defaultBurnableWallet = () => ({
    key: '',
    address: '',
  });

  // States for the app
  const [ burnableWallet, setBurnableWallet ] = useState(defaultBurnableWallet());
  const [ gameStatus, setGameStatus ] = useState(defaultGameStatus());
  const [ refreshIntervalId, setRefreshIntervalId ] = useState(0);

  // page status
  const [ initialized, setInitialized ] = useState(false);
  const [ isCharacterDead, setIsCharacterDead ] = useState(false);
  const [ isLoading, setIsLoading ] = useState(false);
  const [ isMoving, setMoving ] = useState(false);

  const currentWalletAddress = useRef('');
  const lastReportErrorTime = useRef(0);
  const lastJoinGameTime = useRef(0);

  const { config, error, } = usePrepareSendTransaction({
    to: burnableWallet.address.trim(),
    value: 100000000000000n,
  });

  const {
    sendTransactionAsync
  } = useSendTransaction(config);

  // Account information from wagmi
  const { address, isConnected } = useAccount({
    async onDisconnect() {
      toast.info('Wallet disconnected, game quit');
      setBurnableWallet(defaultBurnableWallet());
      resetGame();
    }
  });

  const getPlayerNumberFromAddress = async (contract, burnableWalletAddress) => {
    console.log("Getting player number from address:", burnableWalletAddress);
    const playerRoomId = await contract.methods.getPlayerNumberInRoom(burnableWalletAddress).call();
    console.log("Player number:", playerRoomId)
    return parseInt(playerRoomId, 10);
  };

  // Fetch board data from the blockchain
  const fetchGameStatus = async (contract, burnableWalletAddress) => {
    try {
      return await contract.methods.getGameStatus().call({ from: burnableWalletAddress });
    } catch (error) {
      console.error('Error fetching board data:', error);
      toast.error('Failed to load game board');
      return { board: createEmptyArray(), score: 0 }
    }
  };

  // Convert linear array to 2D array for the board
  const convertTo2DArray = (boardData, rowSize) => {
    const board2D = [];
    for (let i = 0; i < boardData.length; i += rowSize) {
      board2D.push(boardData.slice(i, i + rowSize));
    }
    return board2D;
  };

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

  // Move the player on the board
  const move = useCallback(async (direction) => {
    const roomId = gameStatus.roomId;
    const playerSK = burnableWallet.key;

    if (!playerSK) {
      console.error('Error: not initialized');
      return;
    }

    if (!roomId || roomId < 0) {
      console.error('Error: not joined any room');
      return;
    }

    const web3 = createConnByRoomId(roomId);
    const contract = new web3.eth.Contract(royaleAbi, contractAddr);

    // send move tx with burnable wallet
    setMoving(true);
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
      setMoving(false);
    }
  }, [ gameStatus, burnableWallet ]);

  // Get player's joined room number
  const loadJoinedRoom = async (contract, burnableWalletAddress) => {
    const joinedRoom = await contract.methods.getJoinedRoom().call({
      from: burnableWalletAddress
    });
    return parseInt(joinedRoom, 10);
  };

  // Clear all states
  const resetGame = useCallback(() => {
    console.log('Clearing states...');
    clearInterval(refreshIntervalId);
    setRefreshIntervalId(0);
    setGameStatus(defaultGameStatus());
    setInitialized(false);
    console.log('States cleared');
  }, [ refreshIntervalId ]);

  // Update map and load joined room periodically
  useEffect(() => {
    if (refreshIntervalId && !initialized) {
      // clear the board update timer if we don't have game wallet
      // save some resources when player is idle
      clearInterval(refreshIntervalId);
      setRefreshIntervalId(0);
    }

    return () => {
      // release the timer
      if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
      }
    }
  }, [ refreshIntervalId, initialized ]);

  const handleKeyDown = useCallback(async (event) => {
    if (isMoving) {
      console.log('Player is moving, ignore keydown event');
      return;
    }

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
  }, [ move, isMoving ]);

  // Handle keydown events for player movement
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    }
  }, [ handleKeyDown ]);

  // handle account change
  useEffect(() => {
    const handleAccountsChanged = async (accounts) => {
      // Handle the new accounts, or lack thereof.
      // "accounts" will always be an array, but it can be empty.
      if (accounts.length === 0) {
        console.log('Not connected to a wallet');
      } else if (accounts[0] !== currentWalletAddress.current) {
        toast.info('Wallet account changed, please rejoin the game');
        currentWalletAddress.current = accounts[0];
        setBurnableWallet(defaultBurnableWallet());
        resetGame();
      }
    };

    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
    }

    // Clean up the event listener
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    };
  }, [ resetGame ]); // Include any dependencies your effect relies on. If "currentAccount" is used inside the effect, it should be listed here.

  const prepare = useCallback(async (contract, roomId, playerIdInRoom, burnableWalletAddress) => {
    const refresh = async () => {
      console.log('Updating game status...');

      // update the board data
      const gameStatus = await fetchGameStatus(contract, burnableWalletAddress);
      const score = !gameStatus ? 0 : parseInt(gameStatus.score, 10);
      const boardData = !gameStatus ? createEmptyArray()
        : gameStatus.board.map((value) => parseInt(value, 10));

      const isEmptyBoard = boardData.every((value) => value === 0);

      if (isEmptyBoard) {
        console.log('Empty board, player has been removed from the room');
        // empty board means this player has been removed from the room
        // we need to reset the status
        resetGame();
        setIsCharacterDead(true);
      } else {
        // update the user score
        const gameStatus = {
          mapData: convertTo2DArray(boardData, 10),
          score,
          roomId,
          playerIdInRoom
        }
        console.log('New game status', gameStatus);
        setGameStatus(gameStatus);
        console.log('Game status updated');
      }
    };
    // for trigger the init map at the first time
    await refresh();

    // start the periodical update
    setRefreshIntervalId(setInterval(refresh, 2000));

    // mark the game status as ready
    setInitialized(true);
  }, []);


  const deposit = useCallback(async (web3) => {
    if (!sendTransactionAsync) {
      throw new Error('Transaction not initialized');
    }

    // transfer 0.01 ART to the game account
    console.log('Depositing 0.01 ART to game wallet...');
    let txHash = "";
    let ret = await sendTransactionAsync();
    txHash = ret.hash;
    console.log('Deposit Transaction hash:', txHash);
    let txReceipt = false;
    let txReceiptStatus = false;

    // we wait maximum 1 min, if tx still not confirmed, we will throw an error
    const timeoutId = setTimeout(() => {
      toast.error('Deposit to game wallet: transaction timeout');
      throw new Error('Deposit transaction timeout');
    }, 10 * 60 * 1000);

    // wait for the receipt
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
      toast.error('Deposit to game wallet: transaction failed');
      throw new Error('Deposit failed: ' + txReceiptStatus);
    }
  }, [ sendTransactionAsync ]);

  const loadGame = useCallback(async (ownerWalletAddress, burnableWalletAddress, burnableWalletKey, joinedRoom) => {
    if (!deposit || !prepare) {
      console.log('Not initialized');
      return;
    }

    let web3 = createConnByRoomId(joinedRoom);

    console.log("Checking game account balance...");
    let gameAccountBalance = parseInt(await web3.eth.getBalance(burnableWalletAddress), 10);
    if (gameAccountBalance < 10000000000000n) {
      console.log("Insufficient balance, initializing transaction...");
      // Transaction logic to deposit funds into game account
      try {
        await deposit(web3);
        setIsLoading(true);
      } catch (e) {
        console.error("Deposit failed:", e);
        toast.error('Failed to pay the game fee, please make sure you have more than 0.01 ART in your wallet');
        setIsLoading(false);
        return;
      }
    }

    const gasPrice = await web3.eth.getGasPrice();
    let contract = new web3.eth.Contract(royaleAbi, contractAddr);

    console.log("Checking wallet owner...");
    const walletOwner = await contract.methods.getWalletOwner(burnableWalletAddress).call();
    console.log("Wallet owner:", walletOwner);
    if (walletOwner !== address) {
      console.log(`Game wallet not owned by the player: ${ address }, initializing binding transaction...`);
      // bind burnable wallet to the player
      const bindData = contract.methods.registerWalletOwner(ownerWalletAddress).encodeABI();
      // send join room tx
      const tx = {
        from: burnableWalletAddress,
        to: contractAddr,
        data: bindData,
        gasPrice,
        gas: 2000000
      };
      let signedTx = await web3.eth.accounts.signTransaction(tx, burnableWalletKey);
      try {
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        console.log("Wallet binding success. Transaction receipt:", receipt);
      } catch (e) {
        console.error("Wallet binding failed:", e);
        toast.error('Failed to bind your wallet with game wallet');
        setIsLoading(false);
        return;
      }
    }

    // if player already in a room, retrieve the room info directly
    if (joinedRoom) {
      console.log("Player already in a room, loading game data...");
      const playerIdInRoom = await getPlayerNumberFromAddress(contract, burnableWalletAddress);
      console.log("Player id in room:", playerIdInRoom);
      await prepare(contract, joinedRoom, playerIdInRoom, burnableWalletAddress);

      // disable loading
      setIsLoading(false);
      return;
    }

    // If player not in a room, join a room
    console.log("Player not in a room, joining a room...");
    const joinRoomData = contract.methods.join().encodeABI();

    // send join room tx
    const tx = {
      from: burnableWalletAddress,
      to: contractAddr,
      data: joinRoomData,
      gasPrice,
      gas: 20000000
    };

    let signedTx = await web3.eth.accounts.signTransaction(tx, burnableWalletKey);
    try {
      const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
      console.log("Joined room. Transaction receipt:", receipt);
    } catch (e) {
      console.error("Join room failed:", e);
      toast.error('Failed to join a game room, please try it again');
      setIsLoading(false);
      return;
    }

    // load the joined room number
    joinedRoom = await loadJoinedRoom(contract, burnableWalletAddress);
    console.log("Joined room:", joinedRoom);

    if (!joinedRoom) {
      console.error("Failed to join any room");
      toast.error('Game\'s too hot, all rooms are full, please try again later');
      setIsLoading(false);
      return;
    }

    // reset web3 and contract to the correct rpc url
    web3 = createConnByRoomId(joinedRoom);
    contract = new web3.eth.Contract(royaleAbi, contractAddr);

    // load player id in the current room
    const playerIdInRoom = await getPlayerNumberFromAddress(contract, burnableWalletAddress);
    console.log("Player id in room:", playerIdInRoom);

    // prepare the game data
    await prepare(contract, joinedRoom, playerIdInRoom, burnableWalletAddress);

    // disable loading
    setIsLoading(false);
  }, [ deposit, prepare ])

  // Check and handle game account logic
  const joinGame = useCallback(async () => {
    if (lastJoinGameTime.current > 0 && (Date.now() - lastJoinGameTime.current) < 10000) {
      toast.error('Join game too frequently, please try again later');
      return;
    }

    lastJoinGameTime.current = Date.now();

    // clear the state so make sure the hooks are properly triggered
    resetGame();

    const web3 = createConnByRoomId(0);

    // show loading screen
    setIsLoading(true);

    // load burnable wallet from local storage
    let sKeyPrivKey = loadGameAccount(address);
    if (!sKeyPrivKey) {
      // if wallet does not exist, create a new one
      console.log(`Burnable wallet not exist for address ${ address }, creating a new one...`)
      sKeyPrivKey = web3.eth.accounts.create().privateKey;
      saveGameAccount(address, sKeyPrivKey);
    } else {
      console.log(`Burnable wallet found for address ${ address }`);
    }

    // update burnable wallet address
    let sKeyAccount = web3.eth.accounts.privateKeyToAccount(sKeyPrivKey);

    // check if there is any available room
    const contract = new web3.eth.Contract(royaleAbi, contractAddr);
    let { roomId, slot } = await contract.methods.getAvailableRoomAndSlot().call();
    if (!parseInt(roomId, 10) || !parseInt(slot, 10)) {
      console.error('No available room');
      toast.error('Game\'s too hot, all rooms are full, please try again later');
      setIsLoading(false);
      return;
    }

    setBurnableWallet({
      key: sKeyPrivKey,
      address: sKeyAccount.address
    });

  }, [ resetGame, address ]);

  // handle burnable wallet change, mostly for the first time or switching wallet
  useEffect(() => {
    if (error) {
      console.error('Error preparing tx:', error);
      const nowTime = Date.now();
      if (nowTime - lastReportErrorTime.current > 1000) {
        toast.error('Not enough balance! Need at least 0.0001 ART to join the game');
        lastReportErrorTime.current = nowTime;
      }
      setIsLoading(false);
      return;
    }
    const handleBurnableWalletChange = async () => {
      if (!sendTransactionAsync || !loadGame) {
        console.log('We should not update, components not initialized');
        return;
      }
      if (!burnableWallet.address || !burnableWallet.key) {
        console.log('We should not update, because this probably a game reset');
        return;
      }
      console.log('Burnable wallet changed, rejoining room...');
      const web3 = createConnByRoomId(0);
      const contract = new web3.eth.Contract(royaleAbi, contractAddr);
      const joinedRoom = await loadJoinedRoom(contract, burnableWallet.address);
      await loadGame(address, burnableWallet.address, burnableWallet.key, joinedRoom);
    }

    handleBurnableWalletChange().catch(console.error);
  }, [ burnableWallet, loadGame, sendTransactionAsync, error ]);

  const handleRejoin = useCallback(async () => {
    // Join game and reset the character death state
    await joinGame();
    setIsCharacterDead(false)
  }, [ joinGame ]);

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
          { isLoading && <LoadingScreen/> }
          <ToastContainer/>
          <DeathModal show={ isCharacterDead } onRejoin={ handleRejoin }/>
          <Map mapData={ gameStatus.mapData } playerIdInRoom={ gameStatus.playerIdInRoom }/>
          <div className="control-panel">
            <button className={ 'arrow-key' } onClick={ () => move('up') }
                    disabled={ isMoving }>{ isMoving ? '⌛️' : 'W' }</button>
            <button className={ 'arrow-key' } onClick={ () => move('left') }
                    disabled={ isMoving }>{ isMoving ? '⌛️' : 'A' }</button>
            <button className={ 'arrow-key' } onClick={ () => move('right') }
                    disabled={ isMoving }>{ isMoving ? '⌛️' : 'D' }</button>
            <button className={ 'arrow-key' } onClick={ () => move('down') }
                    disabled={ isMoving }>{ isMoving ? '⌛️' : 'S' }</button>
          </div>
          <div className="container">
            <Banner/>
          </div>
          <div className="wallet-panel">
            <div className="wallet-sub-panel">
              <ConnectButton/>
            </div>
            <div className="wallet-sub-panel">
              <button className="rounded-button" onClick={ handleRejoin }
                      disabled={ initialized || !isConnected }>
                { initialized && isConnected ? 'Game account: active' : 'Press to init game account' }
              </button>
              <div className='line'>
                your player id: <span className="player-number-value">{ gameStatus.playerIdInRoom }</span>
              </div>
              <div className='line'>
                history score: <span className="player-number-value">{ gameStatus.score }</span>
              </div>
              {/* Additional wallet information */ }
              <div className='line'>
                account: <span className="player-number-value">{ address }</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

