import {
    BigInt,
    BytesData,
    ethereum,
    hexToUint8Array,
    IAspectOperation,
    IPreContractCallJP,
    JitCallBuilder,
    OperationInput,
    PreContractCallInput,
    stringToUint8Array,
    sys,
    uint8ArrayToHex,
    uint8ArrayToString,
} from "@artela/aspect-libs";
import { Protobuf } from "as-proto/assembly/Protobuf";

/**
 * There are two types of Aspect: Transaction-Level Aspect and Block-Level Aspect.
 * Transaction-Level Aspect will be triggered whenever there is a transaction calling the bound smart contract.
 * Block-Level Aspect will be triggered whenever there is a new block generated.
 *
 * An Aspect can be Transaction-Level, Block-Level,IAspectOperation or both.
 * You can implement corresponding interfaces: IAspectTransaction, IAspectBlock,IAspectOperation or both to tell Artela which
 * type of Aspect you are implementing.
 */
export class Aspect implements IPreContractCallJP, IAspectOperation {

    static readonly SYS_PLAYER_STORAGE_KEY: string = 'SYS_PLAYER_STORAGE_KEY';

    preContractCall(input: PreContractCallInput): void {

        sys.log("======== 1")

        let calldata = uint8ArrayToHex(input.call!.data);
        let method = this.parseCallMethod(calldata);

        sys.log("======== 2")

        // if method is 'move(uint8)'
        if (method == "0x70e87aaf") {
            sys.log("======== 3")
            let currentCaller = uint8ArrayToHex(input.call!.from);
            let sysPlayers = this.getSysPlayersList();
            sys.log("======== 4")
            let isSysPlayer = sysPlayers.includes(this.rmPrefix(currentCaller).toLowerCase());

            // if player moves, sys players also move just-in-time
            sys.log("======== 5")
            if (!isSysPlayer) {
                sys.log("======== 6")
                // do jit-call
                for (let i = 0; i < sysPlayers.length; ++i) {
                    sys.log("======== 7")
                    this.doMove(sysPlayers[i], input);
                }
                sys.log("======== 8")
            } else {
                sys.log("======== 100")
                // if sys player moves, do nothing in Aspect and pass the join point
                return;
            }
        }
    }

    operation(input: OperationInput): Uint8Array {
        // calldata encode rule
        // * 2 bytes: op code
        //      op codes lists:
        //           0x0001 | registerSysPlayer
        //
        //           ** 0x10xx means read only op **
        //           0x1001 | getSysPlayers
        //           0x1002 | getAAWaletNonce
        //
        // * variable-length bytes: params
        //      encode rule of params is defined by each method
        const calldata = uint8ArrayToHex(input.callData);
        const op = this.parseOP(calldata);
        const params = this.parsePrams(calldata);

        if (op == "0001") {
            this.registerSysPlayer(params);
            return new Uint8Array(0);
        }
        if (op == "1001") {
            let ret = this.getSysPlayers();
            return stringToUint8Array(ret);
        }
        if (op == "1002") {
            let ret = this.getAAWalletNonce_(params);
            return stringToUint8Array(ret);
        } else {
            sys.revert("unknown op");
        }
        return new Uint8Array(0);
    }

    //****************************
    // internal methods
    //****************************
    doMove(sysPlayer: string, input: PreContractCallInput): void {
        // init jit call
        sys.log("======== 9")
        let direction = this.getRandomDirection(input);

        let moveCalldata = ethereum.abiEncode('move', [
            ethereum.Number.fromU8(direction, 8)
        ]);

        sys.log("======== 10")
        // Construct a JIT request (similar to the user operation defined in EIP-4337)
        let request = JitCallBuilder.simple(hexToUint8Array(sysPlayer),
            input.call!.to,
            hexToUint8Array(moveCalldata)
        ).build();

        // Submit the JIT call
        let response = sys.hostApi.evmCall.jitCall(request);

        sys.log("======== 11")
        // Verify successful submission of the call
        sys.require(response.success, `Failed to submit the JIT call: ${sysPlayer}, err: ${response.errorMsg}, ret: ${uint8ArrayToString(response.ret)}`);

        sys.log(`submitted call ${uint8ArrayToHex(response.jitInherentHashes[0])}`)

        sys.log("======== 12")
        // debug code
        // sys.require(nonce == 0, 'real nonce: ' + nonce.toString()
        //     + "- jit call ret :" + sys.utils.uint8ArrayToString(response.ret)
        //     + "- jit call hash :" + sys.utils.uint8ArrayToHex(response.txHash)
        // );

        // this.increaseAAWalletNonce(sysPlayer, nonce, ctx);
    }

    getRandomDirection(input: PreContractCallInput): u8 {
        const rawHash = sys.hostApi.runtimeContext.get('tx.hash');
        var hash = Protobuf.decode<BytesData>(rawHash, BytesData.decode).data;

        let random = uint8ArrayToHex(hash.slice(4, 6));

        return <u8>(BigInt.fromString(random, 16).toUInt64() % 4);
    }

    parseCallMethod(calldata: string): string {
        if (calldata.startsWith('0x')) {
            return calldata.substring(0, 10);
        }
        return '0x' + calldata.substring(0, 8);
    }

    getAAWalletNonce(wallet: string): u64 {

        let ret = sys.aspect.mutableState.get<string>(wallet);
        if (ret.unwrap() == "") {
            ret.set("0".toString());
        }

        return BigInt.fromString(ret.unwrap()).toUInt64();
    }

    increaseAAWalletNonce(wallet: string, nonce: u64): void {

        sys.aspect.mutableState.get<string>(wallet).set((nonce + 1).toString());
    }

    parseOP(calldata: string): string {
        if (calldata.startsWith('0x')) {
            return calldata.substring(2, 6);
        } else {
            return calldata.substring(0, 4);
        }
    }

    parsePrams(calldata: string): string {
        if (calldata.startsWith('0x')) {
            return calldata.substring(6, calldata.length);
        } else {
            return calldata.substring(4, calldata.length);
        }
    }

    rmPrefix(data: string): string {
        if (data.startsWith('0x')) {
            return data.substring(2, data.length);
        } else {
            return data;
        }
    }

    registerSysPlayer(params: string): void {
        // params encode rules:
        //     20 bytes: player address
        //         eg. e2f8857467b61f2e4b1a614a0d560cd75c0c076f

        sys.require(params.length == 40, "illegal params");
        const player = params.slice(0, 40);

        let sysPlayersKey = sys.aspect.mutableState.get<Uint8Array>(Aspect.SYS_PLAYER_STORAGE_KEY);
        let encodeSysPlayers = uint8ArrayToHex(sysPlayersKey.unwrap());
        if (encodeSysPlayers == "") {
            let count = "0001";
            encodeSysPlayers = count + player;
        } else {
            let encodeCount = encodeSysPlayers.slice(0, 4);
            let count = BigInt.fromString(encodeCount, 16).toInt32();

            count++;
            encodeCount = this.rmPrefix(count.toString(16));

            encodeSysPlayers = encodeCount + encodeSysPlayers.slice(4, encodeSysPlayers.length) + player;
        }

        sysPlayersKey.set(hexToUint8Array(encodeSysPlayers));
    }

    getSysPlayers(): string {
        return uint8ArrayToHex(sys.aspect.mutableState.get<Uint8Array>(Aspect.SYS_PLAYER_STORAGE_KEY).unwrap());
    }

    getAAWalletNonce_(params: string): string {
        sys.require(params.length == 40, "illegal params");
        const wallet = params.slice(0, 40);
        return sys.aspect.mutableState.get<string>(wallet.toLowerCase()).unwrap();
    }

    getSysPlayersList(): Array<string> {
        sys.log("======== 3.1")
        let sysPlayersKey = sys.aspect.mutableState.get<Uint8Array>(Aspect.SYS_PLAYER_STORAGE_KEY);
        let encodeSysPlayers = uint8ArrayToHex(sysPlayersKey.unwrap());
        sys.log("======== 3.2")
        sys.log(encodeSysPlayers);

        let encodeCount = encodeSysPlayers.slice(0, 4);
        let count = BigInt.fromString(encodeCount, 16).toInt32();
        sys.log("======== 3.3")
        const array = new Array<string>();
        encodeSysPlayers = encodeSysPlayers.slice(4);
        sys.log("======== 3.4")
        for (let i = 0; i < count; ++i) {
            array[i] = encodeSysPlayers.slice(40 * i, 40 * (i + 1)).toLowerCase();
        }
        sys.log("======== 3.5")

        return array;
    }


    //****************************
    // unused methods
    //****************************

    isOwner(sender: Uint8Array): bool {
        return false;
    }
}
