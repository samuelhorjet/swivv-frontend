import idl from "../idl/swiv_privacy.json";
import { SwivPrivacy } from "../idl/swiv_privacy";
import { PublicKey } from "@solana/web3.js";

export { 
    permissionPdaFromAccount, 
    PERMISSION_PROGRAM_ID, 
    DELEGATION_PROGRAM_ID, 
    getAuthToken, 
    verifyTeeRpcIntegrity,
    delegationRecordPdaFromDelegatedAccount,
    delegationMetadataPdaFromDelegatedAccount,
    delegateBufferPdaFromDelegatedAccountAndOwnerProgram
} from "@magicblock-labs/ephemeral-rollups-sdk";

export type { SwivPrivacy };

export const SEED_PROTOCOL = Buffer.from("protocol_v2");
export const SEED_POOL = Buffer.from("pool");
export const SEED_POOL_VAULT = Buffer.from("pool_vault");
export const SEED_BET = Buffer.from("user_bet");

export const TEE_VALIDATOR_KEY = new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA");

export const RPC_ENDPOINTS = [
    { 
        label: "Production TEE", 
        value: "https://tee.magicblock.app", 
        wsValue: "wss://tee.magicblock.app",
        validatorKey: TEE_VALIDATOR_KEY.toBase58()
    },
];

export const IDL = idl as SwivPrivacy;