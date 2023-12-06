"use strict"

const Web3 = require('@artela/web3');
const fs = require("fs");
const BigNumber = require('bignumber.js');


// ******************************************
// init web3 and private key
// ******************************************
const configJson = JSON.parse(fs.readFileSync('./project.config.json', "utf-8").toString());
const web3 = new Web3(configJson.node);

let sk = fs.readFileSync("privateKey.txt", 'utf-8');
const account = web3.eth.accounts.privateKeyToAccount(sk.trim());
web3.eth.accounts.wallet.add(account.privateKey);

// ******************************************
// init aspect client
// ******************************************
// instantiate an instance of the contract
let aspectCore = web3.atl.aspectCore();
// instantiate an instance of aspect
let aspect = new web3.atl.Aspect();

// ******************************************
// test data
// ******************************************
let jitAA = "0250032b4a11478969dc4caaa11ecc2ea98cfc12";

/**
 * begin test
 */
async function f() {

    console.log('start testing operation');
    await deployAspect();

    await testRegisterSysPlayer();
    await testGetSysPlayer();
}

async function deployAspect() {
    // load aspect code and deploy
    let aspectCode = fs.readFileSync('./build/release.wasm', {
        encoding: "hex"
    });

    let aspectDeployData = aspect.deploy({
        data: '0x' + aspectCode,
        properties: [],
        paymaster: account.address,
        proof: '0x0'
    }).encodeABI();

    let tx = await getOperationTx(aspectDeployData);

    console.log('signed Aspect deploy Tx');

    let signedTx = await web3.eth.accounts.signTransaction(tx, account.privateKey);

    console.log('send Aspect deploy Tx');

    let receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    aspect.options.address = receipt.aspectAddress;

    console.log('receipt :\n', receipt);
    console.log('aspect address is: ', aspect.options.address);
}

async function testRegisterSysPlayer() {

    printTestCase("testRegisterSysPlayer: success");

    let op = "0x0001";
    let params = jitAA;

    console.log("op: ", op);
    console.log("params: ", params);

    let calldata = aspect.operation(op + params).encodeABI();

    let tx = await getOperationTx(calldata)

    let signedTx = await web3.eth.accounts.signTransaction(tx, account.privateKey);
    let receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    console.log('testRegisterSysPlayer result: sucess');
    console.log(receipt)
}

async function testGetSysPlayer() {
    printTestCase("testGetSysPlayer: success");

    let op = "0x1001";
    let params = "";
    let calldata = aspect.operation(op + params).encodeABI();

    console.log("op: ", op);
    console.log("params: ", params);

    let ret = await web3.eth.call({
        to: aspectCore.options.address, // contract address
        data: calldata
    });

    console.log("ret ", ret);
    console.log("ret ", web3.eth.abi.decodeParameter('string', ret));
}

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

function printTestCase(intro) {
    console.log("\n\n" +
        "// ******************************************\n" +
        "// " + intro + "    \n" +
        "// ******************************************\n\n");
}
async function getOperationTx(calldata) {

    let nonce = await web3.eth.getTransactionCount(account.address);
    let gasPrice = await web3.eth.getGasPrice();
    let chainId = await web3.eth.getChainId();

    let tx = {
        from: account.address,
        nonce: nonce,
        gasPrice,
        gas: 8000000,
        data: calldata,
        to: aspectCore.options.address,
        chainId
    }

    console.log('tx: \n', tx);

    return tx;
}

f().then();
