"use strict"

//todo modify it

const Web3 = require('@artela/web3');
const fs = require("fs");
const { numberToHex } = require("@artela/web3-utils");
const BigNumber = require('bignumber.js');

const contractBin = fs.readFileSync('./contracts/build/contract/Counter.bin', "utf-8");
const abi = fs.readFileSync('./contracts/build/contract/Counter.abi', "utf-8")
const contractABI = JSON.parse(abi);
const EthereumTx = require('ethereumjs-tx').Transaction;

const walletABI = JSON.parse(fs.readFileSync('./tests/jit-aa-abi/AspectEnabledSimpleAccount.abi', "utf-8"));
const factoryABI = JSON.parse(fs.readFileSync('./tests/jit-aa-abi/AspectEnabledSimpleAccountFactory.abi', "utf-8"));
const factoryAddress = "0x7b20970624Cd01582Cd01385B67B969446AC5110";

const demoContractOptions = {
    data: contractBin
};
function rmPrefix(data) {
    if (data.startsWith('0x')) {
        return data.substring(2, data.length);
    } else {
        return data;
    }
}

function getOriginalV(hexV, chainId_) {
    const v = new BigNumber(hexV, 16);
    const chainId = new BigNumber(chainId_);
    const chainIdMul = chainId.multipliedBy(2);

    const originalV = v.minus(chainIdMul).minus(8);

    const originalVHex = originalV.toString(16);

    return originalVHex;
}

async function f() {
    console.log('start running demo');

    // ******************************************
    // init web3 and private key
    // ******************************************
    const configJson = JSON.parse(fs.readFileSync('./project.config.json', "utf-8").toString());
    const web3 = new Web3(configJson.node);

    let sk = fs.readFileSync("privateKey.txt", 'utf-8');
    const account = web3.eth.accounts.privateKeyToAccount(sk.trim());
    web3.eth.accounts.wallet.add(account.privateKey);

    let gasPrice = await web3.eth.getGasPrice();
    let chainId = await web3.eth.getChainId();
    let nonce = await web3.eth.getTransactionCount(account.address);
    let aspectCore = web3.atl.aspectCore();


    let factoryConract = new web3.eth.Contract(factoryABI, factoryAddress)

    // ******************************************
    // prepare 1. deploy contract
    // ******************************************

    let contract = new web3.eth.Contract(contractABI);
    let deployData = contract.deploy(demoContractOptions).encodeABI();
    let tx = {
        from: account.address,
        nonce: nonce++,
        gasPrice,
        gas: 4000000,
        data: deployData,
        chainId
    }

    let signedTx = await web3.eth.accounts.signTransaction(tx, account.privateKey);
    console.log("signed contract deploy tx : \n", signedTx);

    let receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    contract.options.address = receipt.contractAddress;
    console.log('contract address is: ', contract.options.address);

    // ******************************************
    // prepare 2. deploy aspect
    // ******************************************

    // load aspect code and deploy
    let aspectCode = fs.readFileSync('./build/release.wasm', {
        encoding: "hex"
    });

    // instantiate an instance of aspect
    let aspect = new web3.atl.Aspect();
    let aspectDeployData = aspect.deploy({
        data: '0x' + aspectCode,
        properties: [],
        joinPoints:["PreContractCall"],
        paymaster: account.address,
        proof: '0x0'
    }).encodeABI();

    tx = {
        from: account.address,
        nonce: nonce++,
        gasPrice,
        gas: 4000000,
        to: aspectCore.options.address,
        data: aspectDeployData,
        chainId
    }

    console.log('signed Aspect deploy Tx');
    signedTx = await web3.eth.accounts.signTransaction(tx, account.privateKey);
    console.log('send Aspect deploy Tx');
    receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    aspect.options.address = receipt.aspectAddress;
    console.log('aspect address is: ', aspect.options.address);

    // ******************************************
    // prepare 3. binding contract to aspect
    // ******************************************

    console.log(`binding contract`);
    // binding with smart contract
    let contractBindingData = await contract.bind({
        priority: 1,
        aspectId: aspect.options.address,
        aspectVersion: 1,
    }).encodeABI();

    tx = {
        from: account.address,
        nonce: nonce++,
        gasPrice,
        gas: 4000000,
        data: contractBindingData,
        to: aspectCore.options.address,
        chainId
    }

    signedTx = await web3.eth.accounts.signTransaction(tx, account.privateKey);
    receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    console.log(`binding contract result:`);
    console.log(receipt);

    // ******************************************
    // prepare 4. create jit AA
    // ******************************************
    await factoryConract.methods.createAccount(account.address, nonce + 1).send({
        from: account.address,
        gas: 4000000,
        gasPrice: gasPrice,
        nonce: nonce++
    }).on('transactionHash', (txHash) => {
        console.log('aa wallet create tx: ', txHash);
    }).on('receipt', function (receipt) {
        console.log('aa wallet create receipt: ', receipt);
    }).on('error', function (error) {
        console.log('aa wallet create error: ', error);
    });

    let walletAddr = await factoryConract.methods.getAddress(account.address, nonce).call();
    console.log('wallet address: ', walletAddr);
    let walletContract = new web3.eth.Contract(walletABI, walletAddr);

    console.log('tranfer balance to aa');
    let amount = 0.01;
    tx = {
        from: account.address,
        nonce: nonce++,
        gasPrice,
        gas: 210000,
        value: web3.utils.toWei(amount.toString(), 'ether'),
        to: walletAddr,
        chainId
    }

    signedTx = await web3.eth.accounts.signTransaction(tx, account.privateKey);
    receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    console.log('tranfer balance to aa success');
    console.log(receipt)

    // ******************************************
    // start testing session keys
    // ******************************************

    // ******************************************
    // step 1. approve aa to aspect
    // ******************************************

    await walletContract.methods.approveAspects([aspect.options.address]).send({
        from: account.address,
        gas: 20000000,
        gasPrice: gasPrice,
        nonce: nonce++
    }).on('transactionHash', (txHash) => {
        console.log('aa wallet approve aspect tx: ', txHash);
    }).on('receipt', function (receipt) {
        console.log('aa wallet approve aspect receipt: ', receipt);
    }).on('error', function (error) {
        console.log('aa wallet approve aspect error: ', error);
    });

    // ******************************************
    // step 2. register sys player
    // ******************************************

    let op = "0x0001";
    let params = rmPrefix(walletAddr);

    console.log("op: ", op);
    console.log("params: ", params);

    let calldata = aspect.operation(op + params).encodeABI();

    tx = {
        from: account.address,
        nonce: nonce++,
        gasPrice,
        gas: 8000000,
        data: calldata,
        to: aspectCore.options.address,
        chainId
    }

    signedTx = await web3.eth.accounts.signTransaction(tx, account.privateKey);
    receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    console.log('register sys player result: sucess');
    console.log(receipt)

    op = "0x1001";
    params = "";
    calldata = aspect.operation(op + params).encodeABI();

    console.log("op: ", op);
    console.log("params: ", params);

    let ret = await web3.eth.call({
        to: aspectCore.options.address, // contract address
        data: calldata
    });

    console.log("ret ", ret);
    console.log("get sys player ret  ", web3.eth.abi.decodeParameter('string', ret));

    // ******************************************
    // step 3. call contract
    // ******************************************

    // call fisrt, if success then send tx
    calldata = contract.methods.move(2).encodeABI();
    tx = {
        from: account.address,
        data: calldata,
        to: contract.options.address,
        gas: 20000000,
    }

    console.log("call move : ", tx);
    ret = await web3.eth.call(tx);
    console.log("ret ", ret);

    // send tx
    await contract.methods.move(2).send({
        from: account.address,
        gas: 20000000,
        gasPrice: gasPrice,
        nonce: nonce++
    }).on('transactionHash', (txHash) => {
        console.log('move tx: ', txHash);
    }).on('receipt', function (receipt) {
        console.log('move receipt: ', receipt);
    }).on('error', function (error) {
        console.log('move error: ', error);
    });

    op = "0x1002";
    params = rmPrefix(walletAddr);
    calldata = aspect.operation(op + params).encodeABI();

    console.log("op: ", op);
    console.log("params: ", params);

    ret = await web3.eth.call({
        to: aspectCore.options.address, // contract address
        data: calldata
    });

    console.log("ret ", ret);
    console.log("get aa wallet nonces  ", web3.eth.abi.decodeParameter('string', ret));

    console.log(`all test cases pass`);

}

f().then();
