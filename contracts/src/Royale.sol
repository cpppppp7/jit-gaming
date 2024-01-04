// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract Royale {
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

    struct Score {
        address player;
        uint256 score;
    }

    struct Room {
        uint8 playerCount;
        address[PLAYER_COUNT] players;
        // The game board, each tile is represented by a uint8
        // If the uint8 is 0, the tile is empty
        // If the uint8 is non-zero, the tile is occupied by a player
        uint8[TILE_COUNT] board;
    }

    event Scored(address player, uint256 score);

    // Total rooms we have
    uint96 public _roomCount = 0;

    // Quick lookup for player position in a room
    // key: first 96 bit for room id, next 8 bit for player id
    // value: player position tile number
    mapping(uint128 => uint8) public playerPositions;

    // Quick lookup for player scores
    // key: player address
    // value: player score
    mapping(address => uint256) public scores;

    // Quick lookup for the room that a player has joined
    // key: player address
    // value: room id
    mapping(address => uint96) public playerRoomId;

    // Quick lookup for the players in a room
    // key: room id
    // value: array of player addresses
    mapping(uint96 => Room) public rooms;

    // Quick lookup for the player's address in a room
    // key: [96 Bit Room ID][8 Bit Player RoomId][24 Bit Empty]
    // value: player's actual address
    mapping(uint128 => address) public playerRoomIdReverseIndex;

    // Quick lookup for the player's room id in a room
    // key: [96 Bit Room ID][160 Bit Player Address]
    // value: player's id in the room
    mapping(uint256 => uint8) public playerRoomIdIndex;

    // owner of the contract
    address private owner;

    constructor() {
        owner = msg.sender;
    }

    function isOwner(address user) external view returns (bool result) {
        return user == owner;
    }

    function join() private {
        if (playerRoomId[msg.sender] > 0) {
            // already joined
            return;
        }

        // copy the storage to stack
        uint96 roomCount = _roomCount;
        uint96 availableRoom;
        bool foundRoom = false;
        for (uint96 i = 0; i < roomCount; ++i) {
            // find a room with empty slot
            if (rooms[i].playerCount < PLAYER_COUNT) {
                availableRoom = i;
                foundRoom = true;
                break;
            }
        }
        if (!foundRoom) {
            // create a new room, room number starts from 1
            availableRoom = roomCount + 1;
            _roomCount = availableRoom;
        }

        // find an empty slot in the room
        address[PLAYER_COUNT] memory playersInRoom = rooms[availableRoom].players;
        uint8 playerIdInRoom = 0;
        for (uint8 i = 0; i < PLAYER_COUNT; ++i) {
            if (playersInRoom[i] == address(0)) {
                rooms[availableRoom].players[i] = msg.sender;
                playerIdInRoom = i + 1;
                ++rooms[availableRoom].playerCount;
                break;
            }
        }

        // join the room
        playerRoomId[msg.sender] = availableRoom;
        playerRoomIdIndex[buildPlayerAddressIndex(availableRoom, msg.sender)] = playerIdInRoom;
        playerRoomIdReverseIndex[buildPlayerRoomIdIndex(availableRoom, playerIdInRoom)] = msg.sender;

        // This move will just assign a random position to the player, but not move it
        _move(availableRoom, playerIdInRoom, Dir.UP);
    }

    function buildPlayerRoomIdIndex(uint96 roomId, uint8 playerIdInRoom) private pure returns (uint128) {
        return (uint128(roomId) << 32) | (uint128(playerIdInRoom) << 24);
    }

    function buildPlayerAddressIndex(uint96 roomId, address playerAddress) private pure returns (uint256) {
        return (uint256(roomId) << 160) | (uint256(uint160(playerAddress)));
    }

    function generateRandomPosition(uint256 salt) private view returns (uint8) {
        return uint8(uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, salt))) % TILE_COUNT);
    }

    function _move(uint96 roomId, uint8 playerIdInRoom, Dir dir) private {
        uint128 playerRoomIdIndexKey = buildPlayerRoomIdIndex(roomId, playerIdInRoom);
        uint8 currentPosition = playerPositions[playerRoomIdIndexKey];
        uint8[TILE_COUNT] storage board = rooms[roomId].board;
        if (currentPosition == 0) {
            // Assign a random position if the player doesn't exist on the board
            uint256 salt = 0;
            uint8 newPosition = generateRandomPosition(salt++);
            while (board[newPosition] != 0) {
                // Keep generating a new position until we find an empty tile
                newPosition = generateRandomPosition(salt++);
            }
            playerPositions[playerRoomIdIndexKey] = newPosition;
            board[newPosition] = playerIdInRoom;
        } else {
            // Calculate new position based on direction
            uint8 newPosition = calculateNewPosition(currentPosition, dir);
            if (currentPosition == newPosition) {
                // if the new position is the same as the current position, do nothing
                return;
            }

            // if the tile was occupied, remove the previous occupant
            uint8 tileOccupant = board[newPosition];
            if (tileOccupant != 0) {
                // remove the previous occupant out of the board and room
                uint128 tileOccupantRoomIdIndexKey = buildPlayerRoomIdIndex(roomId, tileOccupant);
                delete playerPositions[tileOccupantRoomIdIndexKey];
                delete rooms[roomId].players[tileOccupant - 1];
                --rooms[roomId].playerCount;
                address tileOccupantAddress = playerRoomIdReverseIndex[tileOccupantRoomIdIndexKey];
                delete playerRoomIdReverseIndex[tileOccupantRoomIdIndexKey];
                delete playerRoomIdIndex[buildPlayerAddressIndex(roomId, tileOccupantAddress)];

                // update the killer's score and emit event
                emit Scored(msg.sender, ++scores[msg.sender]);
            }

            // set the player to the new position
            board[currentPosition] = playerIdInRoom;
            playerPositions[playerRoomIdIndexKey] = newPosition;
        }
    }

    function move(Dir dir) public {
        uint96 roomId = playerRoomId[msg.sender];
        if (roomId == 0) {
            // join the game if the player hasn't joined
            join();
        } else {
            // if the player has joined, move the player
            uint8 playerIdInRoom = playerRoomIdIndex[buildPlayerAddressIndex(roomId, msg.sender)];
            _move(roomId, playerIdInRoom, dir);
        }
    }

    function getBoard(uint96 roomId) public view returns (uint8[TILE_COUNT] memory) {
        return rooms[roomId].board;
    }

    function getMyPosition() public view returns (uint8) {
        uint96 roomId = playerRoomId[msg.sender];
        if (roomId == 0) {
            return 0;
        }
        uint8 playerIdInRoom = playerRoomIdIndex[buildPlayerAddressIndex(roomId, msg.sender)];
        uint128 playerRoomIdIndexKey = buildPlayerRoomIdIndex(roomId, playerIdInRoom);
        return playerPositions[playerRoomIdIndexKey];
    }

    function getScore(address player) public view returns (uint256) {
        return scores[player];
    }

    function calculateNewPosition(
        uint8 currentPosition,
        Dir dir
    ) private pure returns (uint8) {
        if (dir == Dir.DOWN) {
            uint8 newPosition = currentPosition + MAP_WIDTH;
            return newPosition >= TILE_COUNT ? currentPosition : newPosition;
        } else if (dir == Dir.LEFT) {
            return (currentPosition % MAP_WIDTH) == 0 ? currentPosition : currentPosition - 1;
        } else if (dir == Dir.UP) {
            return currentPosition >= MAP_WIDTH ? (currentPosition - MAP_WIDTH) : currentPosition;
        } else if (dir == Dir.RIGHT) {
            return (currentPosition % MAP_WIDTH) == (MAP_WIDTH - 1) ? currentPosition : currentPosition + 1;
        }
        return currentPosition;
    }

    function getPlayerByPosition(
        uint96 roomId,
        uint8 position
    ) private view returns (address) {
        uint8 playerIdInRoom = rooms[roomId].board[position];
        if (playerIdInRoom == 0) {
            return address(0);
        }

        uint128 playerRoomIdIndexKey = buildPlayerRoomIdIndex(roomId, playerIdInRoom);
        return playerRoomIdReverseIndex[playerRoomIdIndexKey];
    }
}
