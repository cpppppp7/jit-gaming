"use strict"

const { execSync } = require('child_process');
const Web3 = require('@artela/web3');
const fs = require('fs');
const web3 = new Web3();
const MAP_WIDTH = 10;
const MAP_HEIGHT = 10;
const rpcUrls = JSON.parse(fs.readFileSync('./project.config.json').toString()).nodes;

// 假设这是从智能合约获取到的board数据
// 您需要将其替换为实际的输出

function parseBoardData(boardData) {
    // 解析board数据，根据您的智能合约输出格式进行调整
    // 这里假设boardData是一个包含Tile结构的数组
    return boardData.map(tile => {
        if (!tile) {
            return 'O';
        } else {
            return parseInt(tile).toString(16);
        }
    });
}

function displayBoard(board) {
    for (let y = 0; y < MAP_HEIGHT; y++) {
        let row = "";
        for (let x = 0; x < MAP_WIDTH; x++) {
            const tile = board[y * MAP_WIDTH + x];
            if (tile === '0' || tile === 'O') {
                // 如果是 'X'字符按原样打印
                row += tile + " ";
            } else {
                // 其他则以红色打印
                row += '\x1b[31m' + tile + '\x1b[0m ';
            }
        }
        console.log(row);
    }
}

// // 主逻辑
// const board = parseBoardData(boardData);
// displayBoard(board);

// 假设 'encodedBoardData' 是从合约返回的 ABI 编码数据
// const encodedBoardData = ''; // 替换为实际的编码数据


// Tile结构体的ABI定义
const tileABI = [{"internalType":"uint8[100]","name":"","type":"uint8[100]"}];

function pull(roomId, rpcUrl) {
    return execSync(`cast call --rpc-url ${rpcUrl} $(grep CONTRACT .env | cut -d '=' -f2) \"getBoardByRoom(uint64)\" ${roomId} --private-key $(grep ACCOUNT_1_SK .env | cut -d '=' -f2)`).toString();
}

// 解码Tile数据
function decodeBoardData(encodedData) {
    // 假设你的board有100个Tile，根据你的实际数量调整
    return web3.eth.abi.decodeParameters(tileABI, encodedData.trim())[0];
}
function clearScreen() {
    // execSync("clear", { stdio: 'inherit' });
    process.stdout.write('\x1B[2J\x1B[0f');

}

let boardHexCache = "";
// 增加了一个定期执行的函数
function updateBoard(roomId, rpcUrl) {
    let newBoardHex = pull(roomId, rpcUrl);
    if (boardHexCache === newBoardHex) {
        return;
    }
    boardHexCache = newBoardHex;

    let board = parseBoardData(decodeBoardData(newBoardHex));
    clearScreen();
    displayBoard(board);
}

// 获取命令行参数
const args = process.argv.slice(2);

// 使用命令行参数
if (args.length > 0) {
    const roomId = args[0];
    const rpcUrl = rpcUrls[roomId % rpcUrls.length];
    setInterval(() => updateBoard(roomId, rpcUrl), 2000);
} else {
    console.log('Please provide a room ID as a command line argument.');
    process.exit(1);
}

