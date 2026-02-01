import { IdlAccounts } from "@coral-xyz/anchor";
import { SwivPrivacy } from "../idl/swiv_privacy";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export type SwivPrivacyProgram = SwivPrivacy;

export type PoolAccount = IdlAccounts<SwivPrivacy>["pool"];
export type UserBetAccount = IdlAccounts<SwivPrivacy>["userBet"];
export type ProtocolAccount = IdlAccounts<SwivPrivacy>["protocol"];

export interface PoolWithAddress {
  publicKey: PublicKey;
  account: PoolAccount;
}

export interface BetWithAddress {
  publicKey: PublicKey;
  account: UserBetAccount;
}

export interface GroupedParticipant {
  userKey: string;
  totalDeposit: number;
  betCount: number; 
  predictions: (number | string)[]; 
  status: string;
  hasWon: boolean;
  totalWeight: BN;
  payout: number;
  profit: number;
  displayPayout: string;
  displayProfit: string;
  displayStatus: string;
}