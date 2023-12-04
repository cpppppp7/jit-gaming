let web3;
let vaultContract;
const contractAddress = '0xBFEF2f7d652bC8711D4a97517E796bc4BeF28b2d';
const abi = [{ "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "sender", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "Deposit", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "receiver", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "Withdraw", "type": "event" }, { "inputs": [], "name": "MAP_HEIGHT", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "MAP_WIDTH", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "PLAYER_COUNT", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "TILE_COUNT", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "", "type": "address" }], "name": "balances", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "name": "board", "outputs": [{ "internalType": "uint8", "name": "occupantId", "type": "uint8" }, { "internalType": "bool", "name": "isWall", "type": "bool" }, { "internalType": "address", "name": "player", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "deposit", "outputs": [], "stateMutability": "payable", "type": "function" }, { "inputs": [], "name": "getBalance", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getBoard", "outputs": [{ "components": [{ "internalType": "uint8", "name": "occupantId", "type": "uint8" }, { "internalType": "bool", "name": "isWall", "type": "bool" }, { "internalType": "address", "name": "player", "type": "address" }], "internalType": "struct Counter.Tile[100]", "name": "", "type": "tuple[100]" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getMyPosition", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getNumber", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "player", "type": "address" }], "name": "getScore", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "increment", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "enum Counter.Dir", "name": "dir", "type": "uint8" }], "name": "move", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "number", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "", "type": "address" }], "name": "playerPositions", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "", "type": "address" }], "name": "scores", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "newNumber", "type": "uint256" }], "name": "setNumber", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "withdraw", "outputs": [], "stateMutability": "nonpayable", "type": "function" }]

let web3code = new Web3(new Web3.providers.HttpProvider("https://testnet-rpc1.artela.network"));
let vaultContractCode = new web3code.eth.Contract(abi, contractAddress);

console.log(Web3.version)

window.addEventListener('load', async () => {
    console.log('Load MetaMask!');
    if (window.ethereum) {
        console.log("Ethereum provider detected.");

        web3 = new Web3(window.ethereum);
        console.log(web3.version)
        vaultContract = new web3.eth.Contract(abi, contractAddress);
        try {
            await window.ethereum.enable();
            setInterval(updateBalance, 500);
        } catch (error) {
            console.error("User denied account access");
        }
    } else {
        console.log('Please install MetaMask!');
    }
});

document.getElementById('depositButton').addEventListener('click', () => {
    deposit();
});

document.getElementById('withdrawButton').addEventListener('click', () => {
    withdraw();
});
document.getElementById('bindingButton').addEventListener('click', () => {
    binding();
});
document.getElementById('sessionButton').addEventListener('click', () => {
    session();
});

async function deposit() {
    const accounts = await web3.eth.getAccounts();
    const amount = web3.utils.toWei('0.01', 'ether'); // Deposit 1 ETH, change as needed

    vaultContract.methods.deposit().send({ from: accounts[0], value: amount })
        .on('transactionHash', hash => {
            console.log(`Transaction hash: ${hash}`);
        })
        .on('receipt', receipt => {
            console.log(`Transaction receipt: ${receipt}`);
        })
        .on('error', error => {
            console.error(error);
        });
}

async function binding() {
    const accounts = await web3.eth.getAccounts();

    let calldata = "0x3446f1d2000000000000000000000000640Fa8872cf086e9ab181ce6d7801284e20bc4d70000000000000000000000000000000000000000000000000000000000000001000000000000000000000000d89d8a8adf83256fb32c7c4fbb633cd6f0115e4f0000000000000000000000000000000000000000000000000000000000000001";

    let tx2 = {
        from: accounts[0], // The user's active address.
        to: "0x0000000000000000000000000000000000A27E14", // Required except during contract publications.
        value: 0, // Only required to send ether to the recipient from the initiating external account.
        gasLimit: '0x5028', // Customizable by the user during MetaMask confirmation.
        maxPriorityFeePerGas: '0x3b9aca00', // Customizable by the user during MetaMask confirmation.
        maxFeePerGas: '0x2540be400', // Customizable by the user during MetaMask confirmation.}
        data: calldata,
    }
    console.log("eoaBindingData tx,", tx2);
    // let signedTx = await web3.eth.accounts.signTransaction(tx, accounts[0]);

    // 发送交易请求到 MetaMask
    const txHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [tx2, accounts[0]]
    });

    console.log(`signedTx:`, txHash);
    // let receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    console.log(`binding EoA result:`, receipt);
}

async function session() {
    const accounts = await web3.eth.getAccounts();
    // create session keys
    let sKeyPrivKey = web3code.eth.accounts.create(web3.utils.randomHex(32)).privateKey;
    let sKeyAccount = web3code.eth.accounts.privateKeyToAccount(sKeyPrivKey);

    let mainKey = rmPrefix(accounts[0]);
    let sKey = rmPrefix(sKeyAccount.address);
    let sKeyContract = "BFEF2f7d652bC8711D4a97517E796bc4BeF28b2d";

    calldata = "0x995a75e8000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000380001e2f8857467b61f2e4b1a614a0d560cd75c0c076f640fa8872cf086e9ab181ce6d7801284e20bc4d70003d0e30db0d0e30db02e1a7d4d0000000000000000";

    tx2 = {
        from: accounts[0], // The user's active address.
        to: "0x0000000000000000000000000000000000A27E14", // Required except during contract publications.
        value: 0, // Only required to send ether to the recipient from the initiating external account.
        gasLimit: '0x5028', // Customizable by the user during MetaMask confirmation.
        maxPriorityFeePerGas: '0x3b9aca00', // Customizable by the user during MetaMask confirmation.
        maxFeePerGas: '0x2540be400', // Customizable by the user during MetaMask confirmation.}
        data: calldata,
    }

     // 发送交易请求到 MetaMask
     const txHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [tx2, accounts[0]]
    });

    console.log(`signedTx:`, txHash);
}

async function withdraw() {
    const accounts = await web3.eth.getAccounts();
    const amount = web3.utils.toWei('0.01', 'ether'); // Withdraw 1 ETH, change as needed

    vaultContract.methods.withdraw(amount).send({ from: accounts[0] })
        .on('transactionHash', hash => {
            console.log(`Transaction hash: ${hash}`);
        })
        .on('receipt', receipt => {
            console.log(`Transaction receipt: ${receipt}`);
        })
        .on('error', error => {
            console.error(error);
        });
}

async function updateBalance() {
    const accounts = await web3.eth.getAccounts();
    // const balance = await vaultContractCode.methods.getMyPosition().call({from: "0xD89d8A8adF83256fb32C7c4fBb633CD6f0115E4F"});
    let ret = await web3.eth.call({
        from: "0xD89d8A8adF83256fb32C7c4fBb633CD6f0115E4F",
        to: "0xBFEF2f7d652bC8711D4a97517E796bc4BeF28b2d", // contract address
        data: "0x12065fe00000000000000000000000000000000000000000000000000000000000000000"
    });
    // const balance = await vaultContract.methods.getBalance(0).call({from: "0xD89d8A8adF83256fb32C7c4fBb633CD6f0115E4F" });
    balance = web3.eth.abi.decodeParameter('uint256', ret);
    document.getElementById('balance').innerText = `Balance: ${web3code.utils.fromWei(balance, 'ether')} ETH`;
}
