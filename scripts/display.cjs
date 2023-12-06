"use strict"

const { execSync } = require('child_process');
const Web3 = require('@artela/web3');
const web3 = new Web3();
const MAP_WIDTH = 10;
const MAP_HEIGHT = 10;

// 假设这是从智能合约获取到的board数据
// 您需要将其替换为实际的输出

function parseBoardData(boardData) {
    // 解析board数据，根据您的智能合约输出格式进行调整
    // 这里假设boardData是一个包含Tile结构的数组
    return boardData.map(tile => {
        if (tile.occupantId === '0') {
            return 'O';
        } else {
            // 使用地址的首个字符来表示玩家
            // return "X";
            return tile.player[3].toUpperCase();
        }
    });
}

function displayBoard(board) {
    for (let y = 0; y < MAP_HEIGHT; y++) {
        let row = "";
        for (let x = 0; x < MAP_WIDTH; x++) {
            const tile = board[y * MAP_WIDTH + x];
            if (tile == 'O') {
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
const tileABI = [
    { type: 'uint8', name: 'occupantId' },
    { type: 'bool', name: 'isWall' },
    { type: 'address', name: 'player' },
];

function pull() {
    return execSync("cast call --rpc-url https://testnet-rpc1.artela.network $(grep CONTRACT .env | cut -d '=' -f2) \"getBoard()\" --private-key $(grep ACCOUNT_1_SK .env | cut -d '=' -f2)").toString();
}

// 解码Tile数据
function decodeBoardData(encodedData) {
    // 假设你的board有100个Tile，根据你的实际数量调整
    const tileCount = 100;
    let boardData = [];
    encodedData = encodedData.slice(2);

    for (let i = 0; i < tileCount; i++) {
        // 每个Tile的编码数据长度
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
}
function clearScreen() {
    // execSync("clear", { stdio: 'inherit' });
    process.stdout.write('\x1B[2J\x1B[0f');

}

let boardHexCache = "";
// 增加了一个定期执行的函数
function updateBoard() {
    let newBoardHex = pull();
    if (boardHexCache == newBoardHex) {
        return;
    }
    boardHexCache = newBoardHex;

    let board = parseBoardData(decodeBoardData(newBoardHex));
    clearScreen();
    displayBoard(board);
}

// 每 200 毫秒更新一次棋盘
setInterval(updateBoard, 200);
