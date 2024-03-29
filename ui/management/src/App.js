import { ConnectButton } from '@rainbow-me/rainbowkit';
import React, { useCallback, useEffect, useState } from 'react';
import { useAccount, usePrepareSendTransaction, useSendTransaction } from 'wagmi'
import Web3 from 'web3';
import './App.css';

const web3 = new Web3("https://betanet-inner1.artela.network");
const contractAddress = '0x6559c92980E7DCa126738D47c58b41f6719799bB';
const contractABI = require('./royale-abi.json');
const contract = new web3.eth.Contract(contractABI, contractAddress);

const App = () => {
  const [ isOwner, setIsOwner ] = useState(false);
  const [ account, setAccount ] = useState(null);
  const [ refreshRate, setRefreshRate ] = useState(0); // Default refresh rate in seconds
  const [ rooms, setRooms ] = useState([]);
  const [ maxRoomEnabled, setMaxRoomEnabled ] = useState(0);
  const [ resetRoomNumber, setResetRoomNumber ] = useState(1);
  const [ callData, setCallData ] = useState(null);
  const [ isSending, setIsSending ] = useState(false);

  const { config, error, } = usePrepareSendTransaction({
    to: contractAddress,
    data: callData,
  });

  const {
    sendTransaction
  } = useSendTransaction(config);

  useEffect(() => {
    let interval;
    if (account && refreshRate > 0) {
      interval = setInterval(fetchRooms, refreshRate * 1000);
    }
    return () => clearInterval(interval);
  }, [ account, refreshRate ]);

  const { address } = useAccount({
    onConnect({ address, connector, isReconnected, }) {
      setAccount(address);
      onOwnerCheck(address);
      fetchMaxRoomEnabled();
    }
  });

  useEffect(() => {
    setAccount(address);
    onOwnerCheck(address);
    fetchMaxRoomEnabled().then(value => setMaxRoomEnabled(value));
    fetchRooms();
  }, [ address ]);

  const fetchMaxRoomEnabled = async () => {
    return parseInt(await contract.methods.maxRoomEnabled().call(), 10);
  }
  const onOwnerCheck = async (account) => {
    const isOwner = await contract.methods.isOwner(account).call();
    console.log(`address ${ account } is owner: ${ isOwner }`);
    setIsOwner(isOwner);
  };

  const fetchRooms = () => {
    contract.methods.getAllRooms().call()
      .then(result => {
        setRooms(result);
      })
      .catch(error => {
        console.error("Error fetching rooms", error);
      });
  };

  const resetRoom = useCallback(async (resetRoomNumber) => {
    setIsSending(true);
    setCallData(contract.methods.resetRoom(resetRoomNumber).encodeABI());
  }, []);

  const convertTo2DArray = (boardData, rowSize) => {
    const board2D = [];
    for (let i = 0; i < rowSize; i++) {
      const row = [];
      for (let j = 0; j < boardData.length / rowSize; j++) {
        row.push(boardData[j * rowSize + i]);
      }
      board2D.push(row);
    }
    return board2D;
  };
  const resetAllRooms = useCallback(async () => {
    setIsSending(true);
    setCallData(contract.methods.resetAllRooms().encodeABI());
  }, []);

  const setMaxRoomEnabledAction = useCallback(async (maxRoomEnabled) => {
    setIsSending(true);
    setCallData(contract.methods.setMaxRoomEnabled(maxRoomEnabled).encodeABI());
  }, []);

  useEffect(() => {
    if (!sendTransaction) {
      return;
    }

    async function send() {
      await sendTransaction();
      setIsSending(false);
    }

    send();
  }, [ sendTransaction ]);

  const renderBoard = (board) => {
    return (
      <div className="board">
        { board.map((row, rowIndex) => (
          <div key={ rowIndex } className="row">
            { row.map((cell, cellIndex) => (
              <div key={ cellIndex } className="cell">
                {
                  parseInt(cell, 10) === 0 ? '🟩' : '🟥'
                }
              </div>
            )) }
          </div>
        )) }
      </div>
    );
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Royale Game Management</h1>
      </div>

      <div className="container">
        <ConnectButton/>
      </div>

      { account && (
        <>
          <div className="container form-group">
            <label htmlFor="refreshRate" className="label">Refresh Rate (seconds):</label>
            <input
              type="number"
              id="refreshRate"
              className="input"
              min="1"
              value={ refreshRate }
              onChange={ (e) => setRefreshRate(parseInt(e.target.value, 10)) }
            />
          </div>

          <div className="form-group">
            <div className="container">
              <label htmlFor="resetRoomNumber" className="label">Room Number:</label>
              <input
                type="number"
                min="1"
                max="10"
                className="input"
                value={ resetRoomNumber }
                onChange={ (e) => setResetRoomNumber(e.target.value) }
              />
              <button onClick={ () => resetRoom(resetRoomNumber) } className="button" disabled={ !isOwner || isSending }>Reset Room</button>
              <button onClick={ resetAllRooms } className="button" disabled={ !isOwner || isSending }>Reset All Rooms</button>
            </div>
            <div className="container">
              <label htmlFor="resetRoomNumber" className="label">Max Number of Room: </label>
              <input
                type="number"
                className="input"
                value={ maxRoomEnabled }
                onChange={ (e) => setMaxRoomEnabled(e.target.value) }
              />
              <button onClick={ () => setMaxRoomEnabledAction(maxRoomEnabled) } className="button"
                      disabled={ !isOwner || isSending }>Set Max Room Enabled
              </button>
            </div>
          </div>

          <div className="container room-info">
            <div className="container">
              { rooms.map((room, index) => (
                <div key={ index }>
                  <p>Room { index + 1 }</p>
                  <div className="board">
                    { renderBoard(convertTo2DArray(room.board, 10)) }
                  </div>
                  <ul className="players-list">
                    { room.players.map((player, idx) => (
                      <li key={ idx }>
                        Address: { player }, Last
                        Move: { new Date(parseInt(room.playerLastMoved[idx], 10) * 1000).toLocaleString() }
                      </li>
                    )) }
                  </ul>
                </div>
              )) }
            </div>
          </div>
        </>
      ) }
    </div>
  );

};

export default App;
