import idl from "../idl/swiv_privacy.json";
import { SwivPrivacy } from "../idl/swiv_privacy";
import { 
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

export const SEED_GLOBAL_CONFIG = Buffer.from("global_config_v1");
export const SEED_POOL = Buffer.from("pool");
export const SEED_POOL_VAULT = Buffer.from("pool_vault");
export const SEED_BET = Buffer.from("user_bet");

export const RPC_ENDPOINTS = [
    { 
        label: "Europe (EU) - Default", 
        value: "https://devnet-eu.magicblock.app", 
        wsValue: "wss://devnet-eu.magicblock.app",
        validatorKey: "MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e"
    },
    { 
        label: "Asia (AS)", 
        value: "https://devnet-as.magicblock.app", 
        wsValue: "wss://devnet-as.magicblock.app",
        validatorKey: "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"
    },
    { 
        label: "United States (US)", 
        value: "https://devnet-us.magicblock.app", 
        wsValue: "wss://devnet-us.magicblock.app",
        validatorKey: "MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd"
    },
];

export const IDL = idl as SwivPrivacy;

export { 
    permissionPdaFromAccount, 
    PERMISSION_PROGRAM_ID, 
    DELEGATION_PROGRAM_ID, 
    getAuthToken, 
    verifyTeeRpcIntegrity,
    delegationRecordPdaFromDelegatedAccount,
    delegationMetadataPdaFromDelegatedAccount,
    delegateBufferPdaFromDelegatedAccountAndOwnerProgram
};