"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Connection,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
  AccountInfo,
} from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { useProgram } from "../../../hooks/useProgram";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  SEED_POOL_VAULT,
  SEED_BET,
  SEED_PROTOCOL,
  PERMISSION_PROGRAM_ID,
  permissionPdaFromAccount,
  RPC_ENDPOINTS,
  DELEGATION_PROGRAM_ID,
  IDL,
  delegationRecordPdaFromDelegatedAccount,
  delegationMetadataPdaFromDelegatedAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  getAuthToken,
} from "../../../utils/contants";
import { PoolAccount, UserBetAccount } from "../../../types/swiv";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";

interface MyBetItem {
  pubkey: PublicKey;
  account: UserBetAccount;
  isDelegated: boolean;
  displayPrediction: number | string;
  payout: number;
  profit: number;
  revealed?: boolean;
  status: "Live" | "Lost" | "Ready to Claim" | "Claimed";
}

// Define a mutable type for internal processing to fix 'readonly' errors
type MutableAccount = {
  pubkey: PublicKey;
  account: AccountInfo<Buffer>;
};

export default function UserPoolDetail() {
  const { program, wallet: anchorWallet, connection } = useProgram();
  const { signTransaction, signMessage } = useWallet();
  const params = useParams();

  const poolAddressStr = params.address as string;

  const [pool, setPool] = useState<PoolAccount | null>(null);
  const [myBets, setMyBets] = useState<MyBetItem[]>([]);
  const [myTotalDeposit, setMyTotalDeposit] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Form States
  const [depositAmount, setDepositAmount] = useState("");
  const [prediction, setPrediction] = useState("");
  const [newPrediction, setNewPrediction] = useState("");
  const [isBetting, setIsBetting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [updatingBetKey, setUpdatingBetKey] = useState<string | null>(null);
  const [selectedRpc, setSelectedRpc] = useState(RPC_ENDPOINTS[0].value);

  const walletAddress = anchorWallet?.publicKey?.toBase58();

  const pollTeeReady = async (betKey: PublicKey, maxRetries = 10) => {
    try {
      // 1. You must get the token first because this RPC requires it for every call
      const tokenResponse = await authenticateTEE();
      const token = tokenResponse; // Adjust based on your authenticateTEE return type (string or object)

      // 2. Initialize connection with the token query parameter
      const authenticatedUrl = `${selectedRpc}?token=${token}`;
      const teeConn = new Connection(authenticatedUrl, "confirmed");

      for (let i = 0; i < maxRetries; i++) {
        console.log(
          `Checking TEE indexing status (attempt ${i + 1}/${maxRetries})...`,
        );
        const info = await teeConn.getAccountInfo(betKey);

        // If the TEE returns info, the delegation is indexed and ready for writes
        if (info) return true;

        await new Promise((res) => setTimeout(res, 2000));
      }
    } catch (error) {
      console.error("Error during TEE polling:", error);
    }
    return false;
  };

  const fetchData = useCallback(async () => {
    if (!program || !poolAddressStr || !anchorWallet || !connection) return;

    try {
      setLoading(true);
      const poolKey = new PublicKey(poolAddressStr);
      const poolAccount = (await program.account.pool.fetch(
        poolKey,
      )) as PoolAccount;
      setPool(poolAccount);

      const discriminator = await program.coder.accounts.memcmp("userBet");

      // Filter for THIS user and THIS pool
      const filters = [
        {
          memcmp: {
            offset: 0,
            bytes: discriminator.bytes as string, // Keep as string if it matches Anchor's output
          },
        },
        {
          memcmp: {
            offset: 8,
            bytes: anchorWallet.publicKey.toBase58(),
            encoding: "base58" as const, // ADD THIS: Explicitly set encoding
          },
        },
        {
          memcmp: {
            offset: 40,
            bytes: poolAddressStr,
            encoding: "base58" as const, // ADD THIS: Explicitly set encoding
          },
        },
      ];

      // --- IMPROVED FETCHING LOGIC (Shadow Filter) ---

      const isResolved = poolAccount.isResolved;

      // Fetch from BOTH locations to ensure we catch accounts in transition
      // We cast the response to 'unknown' first then to our Mutable type to satisfy TS
      const [l1Response, teeResponse] = await Promise.all([
        connection.getProgramAccounts(program.programId, { filters }),
        connection.getProgramAccounts(DELEGATION_PROGRAM_ID, { filters }),
      ]);

      const l1Bets = l1Response as unknown as MutableAccount[];
      const teeBets = teeResponse as unknown as MutableAccount[];

      const uniqueBets = new Map<string, MyBetItem>();
      let totalDep = 0;

      // Helper to process a list of accounts
      const processAccountList = (list: MutableAccount[], isTee: boolean) => {
        list.forEach((raw) => {
          const pubkeyStr = raw.pubkey.toBase58();

          // DEDUPLICATION:
          // If we already have this bet (likely from L1), skip the TEE version
          if (uniqueBets.has(pubkeyStr)) return;

          try {
            const decoded = program.coder.accounts.decode(
              "userBet",
              raw.account.data,
            ) as UserBetAccount;

            const rawPredVal =
              Number(decoded.prediction.toString()) / 1_000_000;

            // SHADOW FILTER:
            // If we are in "Resolved/Flushing" phase, ignore TEE accounts with 0 prediction.
            // These are likely privacy shadows. The real L1 account will have the data (or 0 if user actually bet 0).
            if (isResolved && isTee && rawPredVal === 0) {
              return;
            }

            // CALCULATE PAYOUT & STATUS
            let payout = 0;
            let profit = 0;
            let status: MyBetItem["status"] = "Live";

            if (
              poolAccount.weightFinalized &&
              !poolAccount.totalWeight.isZero()
            ) {
              const totalDistributable = Number(
                poolAccount.vaultBalance.toString(),
              );
              const w = decoded.calculatedWeight;

              if (!w.isZero()) {
                const share = w
                  .mul(new BN(totalDistributable))
                  .div(poolAccount.totalWeight);
                payout = Number(share.toString()) / 1_000_000;
              }

              const dep = Number(decoded.deposit.toString()) / 1_000_000;
              profit = payout - dep;

              // FIX 'ANY' ERROR: Safely check for 'claimed' enum variant
              const rawStatus = decoded.status as Record<string, unknown>;
              const isClaimed = "claimed" in rawStatus;

              if (isClaimed) {
                status = "Claimed";
              } else {
                status = payout > 0 ? "Ready to Claim" : "Lost";
              }
            }

            // ENCRYPTION / DISPLAY LOGIC
            let displayPred: string | number = "🔒";

            if (poolAccount.weightFinalized) {
              // If finalized, show the L1 value (which is revealed)
              displayPred = rawPredVal;
            } else {
              // If NOT finalized, check if user revealed it locally via "Eye" button
              // (Handled by handleReveal logic modifying state, but default here is lock)

              // If the value is 0, it's likely encrypted/hidden on-chain (L1 default)
              // If it's > 0, the user might have revealed it or it's visible.
              // For consistent UI, we default to Lock unless finalized.
              displayPred = "🔒";
            }

            uniqueBets.set(pubkeyStr, {
              pubkey: raw.pubkey,
              account: decoded,
              isDelegated: isTee,
              displayPrediction: displayPred,
              payout,
              profit,
              status,
            });

            totalDep += Number(decoded.deposit.toString());
          } catch {
            console.warn("Skipping corrupt account:", pubkeyStr);
          }
        });
      };

      // 1. Process L1 Bets FIRST (Priority - Truth)
      processAccountList(l1Bets, false);

      // 2. Process TEE Bets SECOND (Shadows filtered out)
      processAccountList(teeBets, true);

      setMyBets(Array.from(uniqueBets.values()));
      setMyTotalDeposit(totalDep);
    } catch (error: unknown) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, [program, poolAddressStr, anchorWallet, connection]);

  useEffect(() => {
    fetchData();
  }, [fetchData, walletAddress]);

  const authenticateTEE = async () => {
    if (!signMessage || !anchorWallet) throw new Error("Wallet not connected");
    const authToken = await getAuthToken(
      selectedRpc,
      anchorWallet.publicKey,
      async (msg: Uint8Array) => await signMessage(msg),
    );
    return authToken.token;
  };

  // --- ACTIONS (ALL VERSIONED TX) ---

  const handleClaim = async () => {
    if (!program || !anchorWallet || !pool || !signTransaction || !connection)
      return;

    const betsToClaim = myBets.filter((b) => b.status === "Ready to Claim");
    if (betsToClaim.length === 0) return alert("No rewards to claim.");

    setIsClaiming(true);
    try {
      const poolKey = new PublicKey(poolAddressStr);
      const userAta = await getAssociatedTokenAddress(
        pool.tokenMint,
        anchorWallet.publicKey,
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL_VAULT, poolKey.toBuffer()],
        program.programId,
      );

      const ixs: TransactionInstruction[] = [];

      for (const bet of betsToClaim) {
        const ix = await program.methods
          .claimReward()
          .accountsPartial({
            user: anchorWallet.publicKey,
            pool: poolKey,
            poolVault: vaultPda,
            userBet: bet.pubkey,
            userTokenAccount: userAta,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction();
        ixs.push(ix);
      }

      const latestBlockhash = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: anchorWallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: ixs,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(
        signedTx.serialize(),
      );
      await connection.confirmTransaction({ signature, ...latestBlockhash });

      alert(`Successfully claimed rewards for ${betsToClaim.length} bets!`);
      fetchData();
    } catch (e: unknown) {
      console.error(e);
      alert(
        "Claim failed: " + (e instanceof Error ? e.message : "Unknown error"),
      );
    } finally {
      setIsClaiming(false);
    }
  };

  const handleReveal = async (betKey: PublicKey) => {
    if (!anchorWallet || !program) return;
    try {
      // Fetch specifically from TEE to get the real value
      const token = await authenticateTEE();
      const teeConn = new Connection(
        `${selectedRpc}?token=${token}`,
        "confirmed",
      );
      const accountInfo = await teeConn.getAccountInfo(betKey);

      if (accountInfo) {
        const decoded = program.coder.accounts.decode(
          "userBet",
          accountInfo.data,
        ) as UserBetAccount;

        const val = Number(decoded.prediction.toString()) / 1_000_000;

        // Update local state to show the value
        setMyBets((prev) =>
          prev.map((b) =>
            b.pubkey.equals(betKey)
              ? { ...b, displayPrediction: val, revealed: true }
              : b,
          ),
        );
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Reveal failed");
    }
  };

  const handleUpdateBet = async (betKey: PublicKey) => {
    if (!anchorWallet || !newPrediction || !program || !signTransaction) return;
    try {
      const token = await authenticateTEE();
      const teeConn = new Connection(
        `${selectedRpc}?token=${token}`,
        "confirmed",
      );
      const teeProvider = new AnchorProvider(teeConn, anchorWallet, {
        preflightCommitment: "confirmed",
      });
      const teeProgram = new Program(IDL, teeProvider);

      const predBN = new BN(parseFloat(newPrediction) * 1_000_000);
      const ix = await teeProgram.methods
        .updateBet(predBN)
        .accounts({
          user: anchorWallet.publicKey,
          userBet: betKey,
          pool: new PublicKey(poolAddressStr),
        })
        .instruction();

      const { blockhash } = await teeConn.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: anchorWallet.publicKey,
        recentBlockhash: blockhash,
        instructions: [ix],
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      const signed = await signTransaction(transaction);
      await teeConn.sendRawTransaction(signed.serialize(), {
        skipPreflight: true,
      });

      alert("Bet Updated!");
      setUpdatingBetKey(null);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleDepositAndDelegate = async () => {
    if (!program || !anchorWallet || !pool || !signTransaction || !connection)
      return;
    try {
      const poolKey = new PublicKey(poolAddressStr);
      const amount = new BN(parseFloat(depositAmount) * 1_000_000);
      const newRequestId = "bet_" + Date.now();
      const rpcConfig = RPC_ENDPOINTS.find((r) => r.value === selectedRpc);
      if (!rpcConfig) return;

      const [protocolPda] = PublicKey.findProgramAddressSync(
        [SEED_PROTOCOL],
        program.programId,
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL_VAULT, poolKey.toBuffer()],
        program.programId,
      );
      const [betPda] = PublicKey.findProgramAddressSync(
        [
          SEED_BET,
          poolKey.toBuffer(),
          anchorWallet.publicKey.toBuffer(),
          Buffer.from(newRequestId),
        ],
        program.programId,
      );
      const permissionPda = permissionPdaFromAccount(betPda);
      const userAta = await getAssociatedTokenAddress(
        pool.tokenMint,
        anchorWallet.publicKey,
      );

      const ixs: TransactionInstruction[] = [
        await program.methods
          .initBet(amount, newRequestId)
          .accountsPartial({
            user: anchorWallet.publicKey,
            protocol: protocolPda,
            pool: poolKey,
            poolVault: vaultPda,
            userTokenAccount: userAta,
            userBet: betPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .instruction(),
        await program.methods
          .createBetPermission(newRequestId)
          .accountsPartial({
            payer: anchorWallet.publicKey,
            user: anchorWallet.publicKey,
            userBet: betPda,
            pool: poolKey,
            permission: permissionPda,
            permissionProgram: PERMISSION_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        await program.methods
          .delegateBetPermission(newRequestId)
          .accountsPartial({
            user: anchorWallet.publicKey,
            pool: poolKey,
            userBet: betPda,
            permission: permissionPda,
            permissionProgram: PERMISSION_PROGRAM_ID,
            delegationProgram: DELEGATION_PROGRAM_ID,
            delegationRecord:
              delegationRecordPdaFromDelegatedAccount(permissionPda),
            delegationMetadata:
              delegationMetadataPdaFromDelegatedAccount(permissionPda),
            delegationBuffer:
              delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
                permissionPda,
                PERMISSION_PROGRAM_ID,
              ),
            validator: new PublicKey(rpcConfig.validatorKey),
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        await program.methods
          .delegateBet(newRequestId)
          .accountsPartial({
            user: anchorWallet.publicKey,
            pool: poolKey,
            userBet: betPda,
            validator: new PublicKey(rpcConfig.validatorKey),
            ownerProgram: program.programId,
            delegationProgram: DELEGATION_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
      ];

      const latest = await connection.getLatestBlockhash();
      const msg = new TransactionMessage({
        payerKey: anchorWallet.publicKey,
        recentBlockhash: latest.blockhash,
        instructions: ixs,
      }).compileToV0Message();
      const signed = await signTransaction(new VersionedTransaction(msg));
      await connection.sendRawTransaction(signed.serialize());
      localStorage.setItem(`pending_bet_${poolAddressStr}`, newRequestId);
      setDepositAmount("");
      fetchData();
    } catch (err: unknown) {
      console.error(err);
    }
  };

  const handlePlaceBet = async () => {
    if (!anchorWallet || !prediction || !program || !signTransaction) return;
    setIsBetting(true);
    try {
      const requestId = localStorage.getItem(`pending_bet_${poolAddressStr}`);
      if (!requestId) throw new Error("No pending bet found in local storage.");

      const poolKey = new PublicKey(poolAddressStr);
      const [betPda] = PublicKey.findProgramAddressSync(
        [
          SEED_BET,
          poolKey.toBuffer(),
          anchorWallet.publicKey.toBuffer(),
          Buffer.from(requestId),
        ],
        program.programId,
      );

      // STEP A: Ensure TEE is synchronized with L1 delegation
      const isReady = await pollTeeReady(betPda);
      if (!isReady) {
        alert(
          "TEE is still indexing your delegation. Please try again in a few seconds.",
        );
        return;
      }

      // STEP B: Standard TEE Setup
      const token = await authenticateTEE();
      const teeConn = new Connection(
        `${selectedRpc}?token=${token}`,
        "confirmed",
      );
      const teeProgram = new Program(
        IDL,
        new AnchorProvider(teeConn, anchorWallet, {
          preflightCommitment: "confirmed",
        }),
      );

      // STEP C: Execute Transaction
      const predBN = new BN(parseFloat(prediction) * 1_000_000);
      const ix = await teeProgram.methods
        .placeBet(predBN, requestId)
        .accounts({
          user: anchorWallet.publicKey,
          pool: poolKey,
          userBet: betPda,
        })
        .instruction();

      const { blockhash, lastValidBlockHeight } =
        await teeConn.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: anchorWallet.publicKey,
        recentBlockhash: blockhash,
        instructions: [ix],
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      const signed = await signTransaction(transaction);

      // Remove skipPreflight to catch errors immediately
      const signature = await teeConn.sendRawTransaction(signed.serialize());

      // Explicitly confirm so we know the TEE state updated
      await teeConn.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      alert("Bet recorded successfully in TEE!");
      localStorage.removeItem(`pending_bet_${poolAddressStr}`);
      setPrediction("");
      fetchData();
    } catch (err: unknown) {
      console.error("Place Bet Error:", err);
      alert(err instanceof Error ? err.message : "Failed to place bet.");
    } finally {
      setIsBetting(false);
    }
  };

  const runSpyCheck = async (betKey: PublicKey) => {
    if (!program) return;
    try {
      const teeConn = new Connection(selectedRpc);
      const info = await teeConn.getAccountInfo(betKey);
      if (info) {
        const decoded = program.coder.accounts.decode(
          "userBet",
          info.data,
        ) as UserBetAccount;
        alert(
          `⚠️ LEAK! Private Val: ${Number(decoded.prediction.toString()) / 1e6}`,
        );
      } else
        alert(
          "✅ Privacy Secure. (Account not found on public RPC or data is encrypted)",
        );
    } catch {
      alert("✅ Privacy Secure.");
    }
  };

  if (loading || !pool)
    return (
      <div className="min-h-screen bg-[#0b0f1a] text-white flex justify-center items-center">
        Loading...
      </div>
    );

  const now = Date.now() / 1000;
  const isEnded = Number(pool.endTime.toString()) < now;
  const pendingRequestId =
    typeof window !== "undefined"
      ? localStorage.getItem(`pending_bet_${poolAddressStr}`)
      : null;

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-white p-4 md:p-8">
      <Link
        href="/"
        className="text-gray-400 hover:text-white mb-8 inline-block"
      >
        ← Back to Pools
      </Link>

      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-extrabold mb-1">{pool.name}</h1>
        <p className="text-blue-400 font-medium mb-8">BTC/USDC</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* STATS BOX */}
          <div className="bg-[#161b2c] border border-gray-800 rounded-xl p-6">
            <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">
              Global Pool Stats
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span>End Time</span>
                <span className="text-red-500 font-mono">
                  {new Date(
                    Number(pool.endTime.toString()) * 1000,
                  ).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total Liquidity</span>
                <span className="text-green-400 font-bold">
                  {(
                    Number(pool.vaultBalance.toString()) / 1e6
                  ).toLocaleString()}{" "}
                  USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span>Accuracy Buffer</span>
                <span className="text-yellow-500 font-mono">
                  ±
                  {(
                    Number(pool.maxAccuracyBuffer.toString()) / 1_000_000
                  ).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-700 pt-2 mt-2">
                <span>Final Price</span>
                <span
                  className={`font-bold font-mono ${pool.isResolved ? "text-white" : "text-gray-600"}`}
                >
                  {pool.isResolved
                    ? (
                        Number(pool.resolutionTarget.toString()) / 1_000_000
                      ).toLocaleString()
                    : "Pending"}
                </span>
              </div>
            </div>
          </div>

          {/* USER POSITION BOX */}
          <div className="bg-[#161b2c] border border-gray-800 rounded-xl p-6">
            <h3 className="text-blue-500 text-xs font-bold uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">
              Your Position
            </h3>
            <div className="space-y-3 text-sm mb-4">
              <div className="flex justify-between">
                <span>My Total Deposit</span>
                <span className="font-bold">
                  {(myTotalDeposit / 1e6).toLocaleString()} USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span>My Active Bets</span>
                <span className="font-bold">{myBets.length}</span>
              </div>
            </div>
            {(() => {
              const claimableCount = myBets.filter(
                (b) => b.status === "Ready to Claim",
              ).length;
              const alreadyClaimedCount = myBets.filter(
                (b) => b.status === "Claimed",
              ).length;
              const totalWinningBets = claimableCount + alreadyClaimedCount;

              if (totalWinningBets === 0) return null;

              const allClaimed =
                claimableCount === 0 && alreadyClaimedCount > 0;

              return (
                <button
                  onClick={handleClaim}
                  disabled={isClaiming || allClaimed}
                  className={`w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition 
        ${
          isClaiming || allClaimed
            ? "bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed"
            : "bg-green-600 hover:bg-green-500 text-white"
        }`}
                >
                  {isClaiming ? (
                    "Claiming..."
                  ) : allClaimed ? (
                    <>✅ Rewards Claimed</>
                  ) : (
                    <>💰 Claim Rewards ({claimableCount})</>
                  )}
                </button>
              );
            })()}
          </div>

          {/* ACTION BOX */}
          <div className="bg-[#161b2c] border border-gray-800 rounded-xl p-6 flex flex-col justify-center">
            {isEnded ? (
              <div className="text-center">
                <p className="text-xs text-green-500 font-bold uppercase mb-1">
                  Final Result
                </p>
                <p className="text-4xl font-black text-white">
                  {pool.weightFinalized ? "Finalized" : "Pending"}
                </p>
              </div>
            ) : !anchorWallet ? (
              <WalletMultiButton />
            ) : (
              <div className="space-y-3">
                <select
                  className="bg-[#0b0f1a] w-full p-2 rounded text-xs border border-gray-700"
                  value={selectedRpc}
                  onChange={(e) => setSelectedRpc(e.target.value)}
                >
                  {RPC_ENDPOINTS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {!pendingRequestId ? (
                  <>
                    <input
                      type="number"
                      className="w-full bg-[#0b0f1a] p-2 rounded border border-gray-700 text-sm"
                      placeholder="Amount (USDC)"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                    />
                    <button
                      onClick={handleDepositAndDelegate}
                      className="w-full bg-blue-600 py-2 rounded font-bold"
                    >
                      1. Deposit & Delegate
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="number"
                      className="w-full bg-[#0b0f1a] p-2 rounded border border-gray-700 text-sm"
                      placeholder="Target Price"
                      value={prediction}
                      onChange={(e) => setPrediction(e.target.value)}
                    />
                    <button
                      onClick={handlePlaceBet}
                      disabled={isBetting}
                      className="w-full bg-green-600 py-2 rounded font-bold"
                    >
                      {isBetting ? "..." : "2. Submit Private Bet"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* BETS TABLE */}
        <div className="bg-[#161b2c] border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <h3 className="font-bold text-lg">My Active Bets</h3>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-[#1e243a] text-[10px] text-gray-500 uppercase">
              <tr>
                <th className="px-6 py-3">Bet ID</th>
                <th className="px-6 py-3">Deposit</th>
                <th className="px-6 py-3">Prediction</th>
                <th className="px-6 py-3">Result</th>
                <th className="px-6 py-3">Payout</th>
                <th className="px-6 py-3">P/L</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {myBets.map((b, i) => (
                <tr key={i} className="hover:bg-white/5 transition">
                  <td className="px-6 py-4 font-mono text-gray-400">
                    {b.pubkey.toBase58().slice(0, 6)}...
                  </td>
                  <td className="px-6 py-4 font-bold">
                    {(Number(b.account.deposit.toString()) / 1e6).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 flex items-center gap-2">
                    {updatingBetKey === b.pubkey.toBase58() ? (
                      <input
                        className="bg-gray-900 w-16 px-1 rounded border border-blue-500"
                        value={newPrediction}
                        onChange={(e) => setNewPrediction(e.target.value)}
                      />
                    ) : (
                      b.displayPrediction
                    )}
                    {/* Show reveal eye only if encrypted and NOT finalized */}
                    {!pool.weightFinalized && b.displayPrediction === "🔒" && (
                      <button
                        onClick={() => handleReveal(b.pubkey)}
                        className="text-xs opacity-50 hover:opacity-100"
                      >
                        👁️
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-400">
                    {pool.weightFinalized ? "Finalized" : "-"}
                  </td>
                  <td className="px-6 py-4">
                    {pool.weightFinalized
                      ? b.payout > 0
                        ? `$${b.payout.toFixed(2)}`
                        : "-"
                      : "-"}
                  </td>
                  <td
                    className={`px-6 py-4 font-bold ${b.profit > 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {pool.weightFinalized
                      ? b.profit > 0
                        ? `+${b.profit.toFixed(2)}`
                        : b.profit.toFixed(2)
                      : "-"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {updatingBetKey === b.pubkey.toBase58() ? (
                      <button
                        onClick={() => handleUpdateBet(b.pubkey)}
                        className="text-green-400 text-xs font-bold"
                      >
                        Save
                      </button>
                    ) : b.status === "Live" ? (
                      // Only allow update if NOT finalized
                      !pool.weightFinalized && (
                        <button
                          onClick={() => setUpdatingBetKey(b.pubkey.toBase58())}
                          className="text-blue-400 text-xs"
                        >
                          Update
                        </button>
                      )
                    ) : (
                      <span
                        className={`text-xs font-bold uppercase ${b.status === "Lost" ? "text-red-500" : "text-green-500"}`}
                      >
                        {b.status}
                      </span>
                    )}
                    <button
                      onClick={() => runSpyCheck(b.pubkey)}
                      className="ml-2 text-[9px] text-yellow-600 border border-yellow-600/30 px-1 rounded"
                    >
                      Audit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
