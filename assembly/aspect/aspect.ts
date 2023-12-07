
import {
    BigInt,
    FilterTxCtx,
    IAspectBlock,
    IAspectTransaction,
    IAspectOperation,
    OnBlockFinalizeCtx,
    OnBlockInitializeCtx,
    PostContractCallCtx,
    PostTxCommitCtx,
    PostTxExecuteCtx,
    PreContractCallCtx,
    PreTxExecuteCtx,
    OperationCtx,
    JitInherentRequest,
    sys,
    ethereum
} from "@artela/aspect-libs";

/**
 * There are two types of Aspect: Transaction-Level Aspect and Block-Level Aspect.
 * Transaction-Level Aspect will be triggered whenever there is a transaction calling the bound smart contract.
 * Block-Level Aspect will be triggered whenever there is a new block generated.
 *
 * An Aspect can be Transaction-Level, Block-Level,IAspectOperation or both.
 * You can implement corresponding interfaces: IAspectTransaction, IAspectBlock,IAspectOperation or both to tell Artela which
 * type of Aspect you are implementing.
 */
export class Aspect implements IAspectTransaction, IAspectOperation {

    static readonly SYS_PLAYER_STORAGE_KEY: string = 'SYS_PLAYER_STORAGE_KEY';

    preContractCall(ctx: PreContractCallCtx): void {

        let calldata = sys.utils.uint8ArrayToHex(ctx.currentCall.data);
        let method = this.parseCallMethod(calldata);

        // if method is 'move(uint8)'
        if (method == "0x70e87aaf") {
            let currentCaller = ctx.currentCall.from;
            let sysPlayers = this.getSysPlayersList(ctx);
            let isSysPlayer = sysPlayers.includes(this.rmPrefix(currentCaller).toLowerCase());

            // if player moves, sys players also move just-in-time
            if (!isSysPlayer) {
                // do jit-call
                for (let i = 0; i < sysPlayers.length; ++i) {
                    this.doMove(sysPlayers[i], ctx);
                }
            } else {
                // if sys player moves, do nothing in Aspect and pass the join point
                return;
            }
        }
    }

    operation(ctx: OperationCtx, data: Uint8Array): Uint8Array {
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
        const calldata = sys.utils.uint8ArrayToHex(data);
        const op = this.parseOP(calldata);
        const params = this.parsePrams(calldata);

        if (op == "0001") {
            this.registerSysPlayer(params, ctx);
            return new Uint8Array(0);
        }
        if (op == "1001") {
            let ret = this.getSysPlayers(ctx);
            return sys.utils.stringToUint8Array(ret);
        }
        if (op == "1002") {
            let ret = this.getAAWalletNonce_(params, ctx);
            return sys.utils.stringToUint8Array(ret);
        }
        else {
            sys.revert("unknown op");
        }
        return new Uint8Array(0);
    }

    //****************************
    // internal methods
    //****************************
    doMove(sysPlayer: string, ctx: PreContractCallCtx): void {
        // init jit call
        let nonce = this.getAAWalletNonce(sysPlayer, ctx);

        let direction = this.getRandomDirection(ctx);

        let moveCalldata = ethereum.abiEncode('move', [
            ethereum.Number.fromU8(direction, 8)
        ]);

        const calldata = ethereum.abiEncode('execute', [
            ethereum.Address.fromHexString(ctx.currentCall.to),
            ethereum.Number.fromU64(0),
            // ethereum.Bytes.fromHexString(sys.utils.uint8ArrayToHex(ctx.currentCall.data))
            ethereum.Bytes.fromHexString(moveCalldata)
        ]);

        // Construct a JIT request (similar to the user operation defined in EIP-4337)
        let request = new JitInherentRequest(
            sys.utils.hexToUint8Array(sysPlayer),        // The account initiating the operation
            sys.utils.hexToUint8Array(ethereum.Number.fromU64(nonce).encodeHex()),
            new Uint8Array(0),             // The initCode of the account (necessary only if the account is not yet on-chain and needs to be created)
            sys.utils.hexToUint8Array(calldata), // The amount of gas to allocate to the main execution call
            sys.utils.hexToUint8Array(ethereum.Number.fromU64(8000000).encodeHex()),         // The amount of gas to allocate for the verification step
            sys.utils.hexToUint8Array(ethereum.Number.fromU64(8000000).encodeHex()), // The amount of gas to compensate the bundler for pre-verification execution, calldata, and any untrackable gas overhead on-chain
            sys.utils.hexToUint8Array(ethereum.Number.fromU64(100).encodeHex()),         // Maximum fee per gas (similar to EIP-1559 max_fee_per_gas)
            sys.utils.hexToUint8Array(ethereum.Number.fromU64(100).encodeHex()), // Maximum priority fee per gas (similar to EIP-1559 max_priority_fee_per_gas)
            new Uint8Array(0),     // Address of the paymaster sponsoring the transaction, followed by extra data to send to the paymaster (empty for self-sponsored transactions)
        );

        // Submit the JIT call
        let response = sys.evm.jitCall(ctx).submit(request);

        // Verify successful submission of the call
        sys.require(response.success, 'Failed to submit the JIT call: ' + sysPlayer);

        // debug code
        // sys.require(nonce == 0, 'real nonce: ' + nonce.toString()
        //     + "- jit call ret :" + sys.utils.uint8ArrayToString(response.ret)
        //     + "- jit call hash :" + sys.utils.uint8ArrayToHex(response.txHash)
        // );

        this.increaseAAWalletNonce(sysPlayer, nonce, ctx);
    }

    getRandomDirection(ctx: PreContractCallCtx): u8 {
        let random = sys.utils.uint8ArrayToHex(ctx.tx.content.unwrap().hash.slice(4, 6));

        return <u8>(BigInt.fromString(random, 16).toUInt64() % 4);
    }

    parseCallMethod(calldata: string): string {
        if (calldata.startsWith('0x')) {
            return calldata.substring(0, 10);
        }
        return '0x' + calldata.substring(0, 8);
    }

    getAAWalletNonce(wallet: string, ctx: PreContractCallCtx): u64 {

        let ret = sys.aspect.mutableState(ctx).get<string>(wallet);
        if (ret.unwrap() == "") {
            ret.set("0".toString());
        }

        return BigInt.fromString(ret.unwrap()).toUInt64();
    }

    increaseAAWalletNonce(wallet: string, nonce: u64, ctx: PreContractCallCtx): void {

        sys.aspect.mutableState(ctx).get<string>(wallet).set((nonce + 1).toString());
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

    registerSysPlayer(params: string, ctx: OperationCtx): void {
        // params encode rules:
        //     20 bytes: player address
        //         eg. e2f8857467b61f2e4b1a614a0d560cd75c0c076f

        sys.require(params.length == 40, "illegal params");
        const player = params.slice(0, 40);

        let sysPlayersKey = sys.aspect.mutableState(ctx).get<string>(Aspect.SYS_PLAYER_STORAGE_KEY);
        let encodeSysPlayers = sysPlayersKey.unwrap();
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

        sysPlayersKey.set(encodeSysPlayers);
    }

    getSysPlayers(ctx: OperationCtx): string {
        return sys.aspect.mutableState(ctx).get<string>(Aspect.SYS_PLAYER_STORAGE_KEY).unwrap();
    }

    getAAWalletNonce_(params: string, ctx: OperationCtx): string {
        sys.require(params.length == 40, "illegal params");
        const wallet = params.slice(0, 40);
        return sys.aspect.mutableState(ctx).get<string>(wallet.toLowerCase()).unwrap();
    }

    getSysPlayersList(ctx: PreContractCallCtx): Array<string> {
        let sysPlayersKey = sys.aspect.mutableState(ctx).get<string>(Aspect.SYS_PLAYER_STORAGE_KEY);
        let encodeSysPlayers = sysPlayersKey.unwrap();

        let encodeCount = encodeSysPlayers.slice(0, 4);
        let count = BigInt.fromString(encodeCount, 16).toInt32();

        const array = new Array<string>();
        encodeSysPlayers = encodeSysPlayers.slice(4);
        for (let i = 0; i < count; ++i) {
            array[i] = encodeSysPlayers.slice(40 * i, 40 * (i + 1)).toLowerCase();
        }

        return array;
    }


    //****************************
    // unused methods
    //****************************

    isOwner(sender: string): bool { return false; }

    onContractBinding(contractAddr: string): bool { return true; }

    filterTx(ctx: FilterTxCtx): bool { return true; }

    preTxExecute(ctx: PreTxExecuteCtx): void { }

    postContractCall(ctx: PostContractCallCtx): void { }

    postTxExecute(ctx: PostTxExecuteCtx): void { }

    postTxCommit(ctx: PostTxCommitCtx): void { }
}
