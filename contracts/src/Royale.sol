// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract Royale {
    uint8 public constant MAP_WIDTH = 10;
    uint8 public constant MAP_HEIGHT = 10;
    uint8 public constant TILE_COUNT = MAP_WIDTH * MAP_HEIGHT;
    uint8 public constant PLAYER_COUNT = 10;
    uint64 public constant MAX_ROOM_NUMBER = 10;

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

    // Quick lookup for player position in a room
    // key: first 64 bit for room id, next 8 bit for player id
    // value: player position tile number
    mapping(uint128 => uint8) public playerPositions;

    // Quick lookup for player scores
    // key: player address
    // value: player score
    mapping(address => uint256) public scores;

    // Quick lookup for the room that a player has joined
    // key: player address
    // value: room id
    mapping(address => uint64) public playerRoomId;

    // Quick lookup for the players in a room
    // key: room id
    // value: array of player addresses
    Room[MAX_ROOM_NUMBER] public rooms;

    // Quick lookup for the player's address in a room
    // key: [64 Bit Room ID][8 Bit Player RoomId][24 Bit Empty]
    // value: player's actual address
    mapping(uint128 => address) public playerRoomIdReverseIndex;

    // Quick lookup for the player's room id in a room
    // key: [64 Bit Room ID][160 Bit Player Address]
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

    function join() public {
        require(playerRoomId[msg.sender] == 0, "already joined another room");

        // copy the storage to stack
        uint64 availableRoom = _getAvailableRoom();
        require(availableRoom > 0, "all rooms are full");

        // join the available room
        _join(availableRoom);
    }


    function _getAvailableRoom() private view returns (uint64) {
        uint64 availableRoom;
        for (uint64 i = 0; i < MAX_ROOM_NUMBER; ++i) {
            // find a room with empty slot
            if (rooms[i].playerCount < PLAYER_COUNT) {
                availableRoom = i + 1;
                break;
            }
        }
        return availableRoom;
    }

    function _join(uint64 roomId) private {
        // find an empty slot in the room
        Room storage room = rooms[roomId - 1];
        address[PLAYER_COUNT] memory playersInRoom = room.players;
        uint8 playerIdInRoom = 0;

        require(room.playerCount < PLAYER_COUNT, "room is full");

        // find an empty slot in the room
        for (uint8 i = 0; i < PLAYER_COUNT; ++i) {
            if (playersInRoom[i] == address(0)) {
                room.players[i] = msg.sender;
                playerIdInRoom = i + 1;
                ++room.playerCount;
                break;
            }
        }

        // join the room
        playerRoomId[msg.sender] = roomId;
        playerRoomIdIndex[buildPlayerAddressIndex(roomId, msg.sender)] = playerIdInRoom;
        playerRoomIdReverseIndex[buildPlayerRoomIdIndex(roomId, playerIdInRoom)] = msg.sender;

        // This move will just assign a random position to the player, but not move it
        _move(roomId, playerIdInRoom, Dir.UP);
    }

    function buildPlayerRoomIdIndex(uint64 roomId, uint8 playerIdInRoom) private pure returns (uint128) {
        return (uint128(roomId) << 64) | (uint128(playerIdInRoom) << 24);
    }

    function buildPlayerAddressIndex(uint64 roomId, address playerAddress) private pure returns (uint256) {
        return (uint256(roomId) << 192) | (uint256(uint160(playerAddress)));
    }

    function generateRandomPosition(uint256 salt) private view returns (uint8) {
        return uint8(uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, salt))) % TILE_COUNT);
    }

    function _move(uint64 roomId, uint8 playerIdInRoom, Dir dir) private {
        uint128 playerRoomIdIndexKey = buildPlayerRoomIdIndex(roomId, playerIdInRoom);
        uint8 currentPosition = playerPositions[playerRoomIdIndexKey];
        Room storage room = rooms[roomId - 1];
        uint8[TILE_COUNT] storage board = room.board;
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
                delete room.players[tileOccupant - 1];
                --room.playerCount;
                address tileOccupantAddress = playerRoomIdReverseIndex[tileOccupantRoomIdIndexKey];
                delete playerRoomIdReverseIndex[tileOccupantRoomIdIndexKey];
                delete playerRoomIdIndex[buildPlayerAddressIndex(roomId, tileOccupantAddress)];

                // update the killer's score and emit event
                emit Scored(msg.sender, ++scores[msg.sender]);
            }

            // set the player to the new position
            board[newPosition] = playerIdInRoom;
            playerPositions[playerRoomIdIndexKey] = newPosition;
        }
    }

    function move(uint64 roomId, Dir dir) public {
        require(roomId <= MAX_ROOM_NUMBER && roomId > 0, "invalid room id");

        uint64 joinedRoom = playerRoomId[msg.sender];
        require(joinedRoom == 0 || roomId == joinedRoom, "already joined another room");
        if (joinedRoom == 0) {
            // join the given room if not joined
            // note this might fail if the room is full
            _join(roomId);
        }

        // move the player
        uint8 playerIdInRoom = playerRoomIdIndex[buildPlayerAddressIndex(roomId, msg.sender)];
        _move(roomId, playerIdInRoom, dir);
    }

    function getJoinedRoom() public view returns (uint64) {
        return playerRoomId[msg.sender];
    }

    function getBoard(uint64 roomId) public view returns (uint8[TILE_COUNT] memory) {
        return rooms[roomId].board;
    }

    function getMyPosition() public view returns (uint8) {
        uint64 roomId = playerRoomId[msg.sender];
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

    function getPlayerRoomId(address player) public view returns (uint64) {
        return playerRoomId[player];
    }

    function getPlayerByPosition(
        uint64 roomId,
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
