const Web3 = require('@artela/web3');
const fs = require("fs");
const rpcUrls = JSON.parse(fs.readFileSync('./project.config.json').toString()).nodes; // Replace with your RPC URL
const royaleAbi = JSON.parse(fs.readFileSync('./contracts/build/contract/Royale.abi').toString());
const contractAddr = '0x11fC90e9635ca31D616153c777b395Fcd8e770cC';
const vaultKey = fs.readFileSync("privateKey.txt", 'utf-8').trim();

// Simulate a player's behavior in the game
async function simulatePlayer(playerIndex, playerKey, stopSignal) {
  const web3 = new Web3(rpcUrls[playerIndex % rpcUrls.length]);
  const contract = new web3.eth.Contract(royaleAbi, contractAddr);

  const playerAccount = web3.eth.accounts.privateKeyToAccount(playerKey);
  web3.eth.accounts.wallet.add(playerAccount);

  try {
    while (!stopSignal.stop) {
      // Join the game and get room ID
      let roomId = 0;
      try {
        roomId = await joinGame(contract, playerAccount);
        if (!roomId) {
          continue;
        }
        console.log(`[Player ${ playerIndex }]: Joined room ${ roomId }`);
      } catch (e) {
        console.error(`[Player ${ playerIndex }]: Error in joinGame: ${ e }`);
        // wait for 5 seconds and retry
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      // Start a task to fetch board data and score every 2 seconds
      const intervalId = setInterval(async () => {
        try {
          await fetchBoardAndScore(contract, playerAccount);
        } catch (e) {
          console.error(`[Player ${ playerIndex }]: Error in fetchBoardAndScore: ${ e }`);
        }
      }, 2000);

      // Continuously move in random directions until killed
      while (!stopSignal.stop) {
        try {
          const isKilled = await moveRandomly(contract, playerIndex, playerAccount, roomId);
          if (isKilled) {
            console.log(`[Player ${ playerIndex }]: Killed`);
            clearInterval(intervalId); // Clear the interval if killed
            break;
          }
        } catch (e) {
          console.error(`[Player ${ playerIndex }]: Need to rejoin game, failed to move: ${ e }`);
          break;
        }
      }
    }
  } catch (error) {
    console.error("Error in simulatePlayer:", error);
  }
}

// Player joins the game and returns room ID
async function joinGame(contract, playerAccount) {
  await contract.methods.join().send({
    from: playerAccount.address,
    to: contractAddr,
    gas: 2000000,
    gasPrice: 7
  });

  // Fetch joined room ID
  return await contract.methods.getJoinedRoom().call({ from: playerAccount.address });
}

// Move the player in a random direction
async function moveRandomly(contract, playerIndex, playerAccount, roomId) {
  const direction = Math.floor(Math.random() * 10 % 4); // Random direction

  console.log(`[Player ${ playerIndex }]: Moving to direction ${ direction } in room ${ roomId }`);
  await contract.methods.move(roomId, direction).send({
    from: playerAccount.address,
    to: contractAddr,
    gas: 2000000,
    gasPrice: 7
  });

  // Check if the player was killed by fetching the board data
  const boardData = await contract.methods.getBoard().call({ from: playerAccount.address });
  return boardData.every(value => value === 0);
}

// Fetch board data and player score
async function fetchBoardAndScore(contract, playerAccount) {
  const boardData = await contract.methods.getBoard().call({ from: playerAccount.address });
  const score = await contract.methods.getScore(playerAccount.address).call();
  // console.log(`Room ID: ${ roomId }, Board Data: ${ boardData }, Score: ${ score }`);
}

// Main function to initiate simulation
async function main() {
  const web3 = new Web3(rpcUrls[0]);
  const gasPrice = await web3.eth.getGasPrice();
  const playerCount = 100;
  const stopSignal = { stop: false }; // Signal to stop the players

  const vaultAccount = web3.eth.accounts.privateKeyToAccount(vaultKey);
  web3.eth.accounts.wallet.add(vaultAccount);

  for (let i = 0; i < playerCount; i++) {
    const newAccount = web3.eth.accounts.create();
    // fund the new account with 0.01 ART
    const receipt = await web3.eth.sendTransaction({
      from: vaultAccount.address,
      to: newAccount.address,
      value: web3.utils.toWei("0.01", "ether"),
      gas: 21000,
      gasPrice
    });
    if (!receipt.status) {
      throw new Error(`Funding transaction for player ${ i } failed: ${ receipt }`);
    }
    simulatePlayer(i, newAccount.privateKey, stopSignal).catch(console.error);
  }

  // Additional logic to stop the simulation, e.g., based on time or external input
  // stopSignal.stop = true; to stop all players
  process.on('SIGINT', () => {
    console.log('Received SIGINT. Stopping players and exiting.');
    stopSignal.stop = true;
    process.exit(0);
  });
}

main().catch(console.error);
