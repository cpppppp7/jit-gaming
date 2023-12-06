// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract Counter {
    uint8 public constant MAP_WIDTH = 10;
    uint8 public constant MAP_HEIGHT = 10;
    uint8 public constant TILE_COUNT = MAP_WIDTH * MAP_HEIGHT;
    uint8 public constant PLAYER_COUNT = 10;

    enum Dir {
        DOWN,
        LEFT,
        UP,
        RIGHT
    }

    struct Tile {
        uint8 occupantId; // 1 - 4 is player, > 4 is item, 0 is empty
        bool isWall;
        address player;
    }

    struct Score {
        address player;
        uint256 score;
    }

    Tile[TILE_COUNT] public board;

    mapping(address => uint8) public playerPositions;
    mapping(address => uint256) public scores;

    uint256 public number;
    
    address private owner;

    constructor() {
        owner = msg.sender;
    }

    function isOwner(address user) external view returns (bool result) {
        return user == owner;
    }

    function setNumber(uint256 newNumber) public {
        number = newNumber;
    }

    function increment() public {
        number++;
    }

    function getNumber() public view returns (uint256) {
        return number;
    }

    function move(Dir dir) public {
        uint8 currentPosition = playerPositions[msg.sender];
        if (currentPosition == 0) {
            // Assign a random position if the player doesn't exist on the board
            uint8 newPosition = uint8(
                uint256(
                    keccak256(abi.encodePacked(block.timestamp, msg.sender))
                ) % TILE_COUNT
            );
            board[newPosition].occupantId = 1; // Assigning player ID as 1 for simplicity
            board[newPosition].player = msg.sender;
            playerPositions[msg.sender] = newPosition;
        } else {
            // Calculate new position based on direction
            uint8 newPosition = calculateNewPosition(currentPosition, dir);
            if (board[newPosition].occupantId != 0) {
                address displacedPlayer = board[newPosition].player;

                board[currentPosition].occupantId = 0;
                board[currentPosition].player = address(0);

                // uint8 randomPosition = uint8(uint256(keccak256(abi.encodePacked(block.timestamp, displacedPlayer))) % TILE_COUNT);
                // board[randomPosition].occupantId = 1;
                // board[randomPosition].player = displacedPlayer;
                // playerPositions[displacedPlayer] = randomPosition;

                playerPositions[displacedPlayer] = 0;

                // 更新移动玩家的位置信息
                board[newPosition].occupantId = 1; // 假设玩家的 occupantId 为 1
                board[newPosition].player = msg.sender;
                playerPositions[msg.sender] = newPosition;

                // 吞噬玩家，score+1
                scores[msg.sender] = scores[msg.sender] + 1;
            } else {
                // 如果新位置为空，直接移动玩家
                board[currentPosition].occupantId = 0;
                board[currentPosition].player = address(0);
                board[newPosition].occupantId = 1;
                board[newPosition].player = msg.sender;
                playerPositions[msg.sender] = newPosition;
            }
        }
    }

    function getBoard() public view returns (Tile[TILE_COUNT] memory) {
        return board;
    }

    function getMyPosition() public view returns (uint8) {
        return playerPositions[msg.sender];
    }

    function getScore(address player) public view returns (uint256) {
        return scores[player];
    }

    function calculateNewPosition(
        uint8 currentPosition,
        Dir dir
    ) private pure returns (uint8) {
        if (dir == Dir.DOWN) {
            return currentPosition + MAP_WIDTH;
        } else if (dir == Dir.LEFT) {
            return currentPosition - 1;
        } else if (dir == Dir.UP) {
            return currentPosition - MAP_WIDTH;
        } else if (dir == Dir.RIGHT) {
            return currentPosition + 1;
        }
        return currentPosition;
    }

    function getPlayerByPosition(
        uint8 position
    ) private view returns (address) {
        for (uint256 i = 0; i < TILE_COUNT; i++) {
            if (playerPositions[address(uint160(i))] == position) {
                return address(uint160(i));
            }
        }
        return address(0);
    }
}
