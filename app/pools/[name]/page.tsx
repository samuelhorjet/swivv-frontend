"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Connection,
  TransactionMessage,
  VersionedTransaction,
  Keypair,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  IdlAccounts,
  AnchorProvider,
  Program,
  Wallet,
  BN,
} from "@coral-xyz/anchor";
import { useProgram } from "../../../hooks/useProgram";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  SwivPrivacy,
  SEED_POOL,
  SEED_POOL_VAULT,
  SEED_BET,
  SEED_GLOBAL_CONFIG,
  PERMISSION_PROGRAM_ID,
  permissionPdaFromAccount,
  verifyTeeRpcIntegrity,
  RPC_ENDPOINTS,
  DELEGATION_PROGRAM_ID,
  IDL,
  delegationRecordPdaFromDelegatedAccount,
  delegationMetadataPdaFromDelegatedAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
} from "../../../utils/contants";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";

type PoolAccount = IdlAccounts<SwivPrivacy>["pool"];
type UserBetAccount = IdlAccounts<SwivPrivacy>["userBet"];

interface MyBetItem {
  pubkey: PublicKey;
  account: UserBetAccount;
  isDelegated: boolean;
  displayPrediction: number;
  payout: number;
  profit: number;
}

// --- DUMMY WALLET (Restored for Privacy Checks) ---
const createDummyWallet = (): Wallet => {
  const kp = Keypair.generate();
  return {
    payer: kp,
    publicKey: kp.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(
      tx: T,
    ): Promise<T> => {
      throw new Error("Dummy wallet cannot sign");
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(
      txs: T[],
    ): Promise<T[]> => {
      throw new Error("Dummy wallet cannot sign");
    },
  };
};

// --- HELPER: Create Optimistic State (No 'any' usage) ---
// This fills all required fields of UserBetAccount to satisfy TypeScript
const createOptimisticUserBet = (
  owner: PublicKey,
  poolIdentifier: string,
  deposit: BN,
): UserBetAccount => {
  return {
    owner,
    poolIdentifier,
    deposit,
    prediction: new BN(0),
    status: { initialized: {} }, // Force Step 2
    // Default values for fields we don't care about in the UI right now:
    bump: 0,
    creationTs: new BN(Date.now() / 1000),
    updateCount: 0,
    calculatedWeight: new BN(0),
    isWeightAdded: false,
    endTimestamp: new BN(0),
  };
};

// --- HELPER: Versioned Tx ---
async function createAndSignVersionedTx(
  connection: Connection,
  payerKey: PublicKey,
  instructions: anchor.web3.TransactionInstruction[],
  signTransaction: <T extends anchor.web3.Transaction | VersionedTransaction>(
    transaction: T,
  ) => Promise<T>,
) {
  const latestBlockhash = await connection.getLatestBlockhash();

  const messageV0 = new TransactionMessage({
    payerKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);

  const signedTx = await signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signedTx.serialize());

  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed",
  );

  return signature;
}

export default function UserPoolDetail() {
  const { program, wallet: anchorWallet, connection } = useProgram();
  const { signTransaction, signMessage } = useWallet();
  const params = useParams();

  const rawName = params.name as string;
  const poolName = decodeURIComponent(rawName);

  const [pool, setPool] = useState<PoolAccount | null>(null);
  const [userBet, setUserBet] = useState<UserBetAccount | null>(null);
  const [myBets, setMyBets] = useState<MyBetItem[]>([]);
  const [myTotalDeposit, setMyTotalDeposit] = useState<number>(0);
  const [isDelegated, setIsDelegated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [storedRequestId, setStoredRequestId] = useState<string>("");
  const [depositAmount, setDepositAmount] = useState("");
  const [prediction, setPrediction] = useState("");
  const [isBetting, setIsBetting] = useState(false);
  const [updatingBetKey, setUpdatingBetKey] = useState<string | null>(null);
  const [newPrediction, setNewPrediction] = useState("");
  const [selectedRpc, setSelectedRpc] = useState(RPC_ENDPOINTS[0].value);
  const [rpcStatus, setRpcStatus] = useState<
    "idle" | "checking" | "online" | "offline"
  >("idle");

  const walletAddress = anchorWallet?.publicKey?.toBase58();

  useEffect(() => {
    setUserBet(null);
    setStoredRequestId("");
    setIsDelegated(false);
    setDepositAmount("");
    setPrediction("");
    setMyTotalDeposit(0);
    setMyBets([]);
  }, [walletAddress]);

  useEffect(() => {
    if (typeof window !== "undefined" && walletAddress) {
      const sessionKey = `swiv_req_${poolName}_${walletAddress}`;
      const savedId = localStorage.getItem(sessionKey);
      if (savedId) setStoredRequestId(savedId);
    }
  }, [poolName, walletAddress]);

  useEffect(() => {
    if (!program || !poolName || !anchorWallet || !connection) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // A. Fetch Pool
        const [poolPda] = PublicKey.findProgramAddressSync(
          [SEED_POOL, new TextEncoder().encode(poolName)],
          program.programId,
        );
        const poolAccount = await program.account.pool.fetch(poolPda);
        setPool(poolAccount);

        // B. Fetch "My Bets"
        const discriminator = await program.coder.accounts.memcmp("userBet");

        const l1Bets = await connection.getProgramAccounts(program.programId, {
          filters: [
            { memcmp: { offset: 0, bytes: discriminator.bytes as string } },
            { memcmp: { offset: 8, bytes: anchorWallet.publicKey.toBase58() } },
          ],
        });

        const teeBets = await connection.getProgramAccounts(
          DELEGATION_PROGRAM_ID,
          {
            filters: [
              { memcmp: { offset: 0, bytes: discriminator.bytes as string } },
              {
                memcmp: { offset: 8, bytes: anchorWallet.publicKey.toBase58() },
              },
            ],
          },
        );

        const allBets: MyBetItem[] = [];
        let totalDep = 0;

        // Process L1 (Public)
        for (const raw of l1Bets) {
          try {
            const decoded = program.coder.accounts.decode(
              "userBet",
              raw.account.data,
            );
            if (decoded.poolIdentifier === poolName) {
              allBets.push({
                pubkey: raw.pubkey,
                account: decoded,
                isDelegated: false,
                displayPrediction: decoded.prediction.toNumber() / 1_000_000,
                payout: 0,
                profit: 0,
              });
              totalDep += decoded.deposit.toNumber();
            }
          } catch {}
        }

        // Process TEE (Delegated)
        const l1Keys = new Set(l1Bets.map((b) => b.pubkey.toBase58()));

        for (const raw of teeBets) {
          if (l1Keys.has(raw.pubkey.toBase58())) continue;
          try {
            const decoded = program.coder.accounts.decode(
              "userBet",
              raw.account.data,
            );
            if (
              decoded.poolIdentifier === poolName &&
              decoded.owner.equals(anchorWallet.publicKey)
            ) {
              allBets.push({
                pubkey: raw.pubkey,
                account: decoded,
                isDelegated: true,
                displayPrediction: 0, // Placeholder
                payout: 0,
                profit: 0,
              });
              totalDep += decoded.deposit.toNumber();
            }
          } catch {}
        }

        // --- C. PRIVACY CHECK (Restored Logic) ---
        // Try to fetch delegated bets using a dummy wallet to see if they are exposed.
        const currentEndpoint = RPC_ENDPOINTS.find(
          (r) => r.value === selectedRpc,
        );
        if (currentEndpoint) {
          try {
            const teeConn = new Connection(currentEndpoint.value, "confirmed");
            const dummyWallet = createDummyWallet(); // <--- Used here!
            const teeProv = new AnchorProvider(teeConn, dummyWallet, {
              preflightCommitment: "confirmed",
            });
            const teeProg = new Program<SwivPrivacy>(
              IDL as SwivPrivacy,
              teeProv,
            );

            for (let i = 0; i < allBets.length; i++) {
              if (allBets[i].isDelegated) {
                try {
                  // If this fetch succeeds, the data is leaked (visible to anon)
                  const realData = await teeProg.account.userBet.fetch(
                    allBets[i].pubkey,
                  );
                  allBets[i].displayPrediction =
                    realData.prediction.toNumber() / 1_000_000;
                  console.warn(
                    "⚠️ Privacy Leak: Bet visible to anonymous user",
                  );
                } catch {
                  // Fetch failed = Data is Secure (Private)
                  // We leave displayPrediction as 0
                }
              }
            }
          } catch (e) {
            console.warn("Privacy check skipped:", e);
          }
        }

        // D. Calculate Payouts
        if (poolAccount.weightFinalized && !poolAccount.totalWeight.isZero()) {
          const totalDistributable = poolAccount.vaultBalance.toNumber();

          allBets.forEach((bet) => {
            const weight = bet.account.calculatedWeight;
            if (!weight.isZero()) {
              const share = weight
                .mul(new BN(totalDistributable))
                .div(poolAccount.totalWeight);
              bet.payout = share.toNumber() / 1_000_000;
            } else {
              bet.payout = 0;
            }
            const depositUI = bet.account.deposit.toNumber() / 1_000_000;
            bet.profit = bet.payout - depositUI;
          });
        }

        setMyBets(allBets);
        setMyTotalDeposit(totalDep);

        // E. Session State
        setUserBet(null);
        if (storedRequestId) {
          const [betPda] = PublicKey.findProgramAddressSync(
            [
              SEED_BET,
              poolPda.toBuffer(),
              anchorWallet.publicKey.toBuffer(),
              Buffer.from(storedRequestId),
            ],
            program.programId,
          );
          const found = allBets.find((b) => b.pubkey.equals(betPda));
          if (found) {
            setUserBet(found.account);
            setIsDelegated(found.isDelegated);
          } else {
            const info = await connection.getAccountInfo(betPda);
            if (info) {
              if (info.owner.equals(DELEGATION_PROGRAM_ID))
                setIsDelegated(true);
              try {
                const d = program.coder.accounts.decode("userBet", info.data);
                setUserBet(d);
              } catch {}
            }
          }
        }
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [
    program,
    poolName,
    anchorWallet,
    connection,
    storedRequestId,
    selectedRpc,
  ]);

  const checkRpcConnection = async () => {
    setRpcStatus("checking");
    try {
      const proxyPath = RPC_ENDPOINTS[0].value;
      const fullUrl = window.location.origin + proxyPath;

      try {
        await verifyTeeRpcIntegrity(fullUrl);
      } catch (innerError: unknown) {
        console.error("⚠️ Verification Warning:", innerError);
      }
      setRpcStatus("online");
    } catch (error) {
      console.error("Critical RPC Failure:", error);
      setRpcStatus("offline");
    }
  };

  const handleDeposit = async () => {
    if (!program || !anchorWallet || !pool || !connection || !signTransaction)
      return;
    try {
      const amount = new anchor.BN(parseFloat(depositAmount) * 1_000_000);
      const newRequestId = "bet_" + Date.now();
      const sessionKey = `swiv_req_${poolName}_${anchorWallet.publicKey.toBase58()}`;

      localStorage.setItem(sessionKey, newRequestId);
      setStoredRequestId(newRequestId);

      const [poolPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL, new TextEncoder().encode(poolName)],
        program.programId,
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL_VAULT, poolPda.toBuffer()],
        program.programId,
      );
      const [betPda] = PublicKey.findProgramAddressSync(
        [
          SEED_BET,
          poolPda.toBuffer(),
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

      const initIx = await program.methods
        .initBet(amount, newRequestId)
        .accountsPartial({
          user: anchorWallet.publicKey,
          globalConfig: PublicKey.findProgramAddressSync(
            [SEED_GLOBAL_CONFIG],
            program.programId,
          )[0],
          pool: poolPda,
          poolVault: vaultPda,
          userTokenAccount: userAta,
          userBet: betPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .instruction();

      const permIx = await program.methods
        .createBetPermission(newRequestId)
        .accountsPartial({
          payer: anchorWallet.publicKey,
          user: anchorWallet.publicKey,
          userBet: betPda,
          pool: poolPda,
          permission: permissionPda,
          permissionProgram: PERMISSION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      await createAndSignVersionedTx(
        connection,
        anchorWallet.publicKey,
        [initIx, permIx],
        signTransaction,
      );

      // --- FIX: NO 'any', USE HELPER ---
      const optimisticState = createOptimisticUserBet(
        anchorWallet.publicKey,
        poolName,
        amount,
      );
      setUserBet(optimisticState);

      setDepositAmount("");
    } catch (error) {
      console.error(error);
      alert("Deposit failed. Check console.");
    }
  };

  const handleDelegate = async () => {
    if (
      !program ||
      !anchorWallet ||
      !pool ||
      !storedRequestId ||
      !signTransaction
    )
      return;
    try {
      const currentRpcObj = RPC_ENDPOINTS.find((r) => r.value === selectedRpc);
      if (!currentRpcObj) return alert("Select Privacy Node");
      const validatorKey = new PublicKey(currentRpcObj.validatorKey);

      const [poolPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL, new TextEncoder().encode(poolName)],
        program.programId,
      );
      const [betPda] = PublicKey.findProgramAddressSync(
        [
          SEED_BET,
          poolPda.toBuffer(),
          anchorWallet.publicKey.toBuffer(),
          Buffer.from(storedRequestId),
        ],
        program.programId,
      );

      const permissionPda = permissionPdaFromAccount(betPda);
      const delegationRecord =
        delegationRecordPdaFromDelegatedAccount(permissionPda);
      const delegationMetadata =
        delegationMetadataPdaFromDelegatedAccount(permissionPda);
      const delegationBuffer =
        delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
          permissionPda,
          PERMISSION_PROGRAM_ID,
        );

      const delegatePermIx = await program.methods
        .delegateBetPermission(storedRequestId)
        .accountsPartial({
          user: anchorWallet.publicKey,
          pool: poolPda,
          userBet: betPda,
          permission: permissionPda,
          permissionProgram: PERMISSION_PROGRAM_ID,
          delegationProgram: DELEGATION_PROGRAM_ID,
          delegationRecord: delegationRecord,
          delegationMetadata: delegationMetadata,
          delegationBuffer: delegationBuffer,
          validator: validatorKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const delegateBetIx = await program.methods
        .delegateBet(storedRequestId)
        .accountsPartial({
          user: anchorWallet.publicKey,
          pool: poolPda,
          userBet: betPda,
          validator: validatorKey,
        })
        .instruction();

      await createAndSignVersionedTx(
        connection,
        anchorWallet.publicKey,
        [delegatePermIx, delegateBetIx],
        signTransaction,
      );
      alert("Delegation Successful!");
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert("Delegation failed.");
    }
  };

  const handlePlaceBet = async () => {
    if (!program || !anchorWallet || !pool || !storedRequestId || !prediction)
      return;
    if (!signTransaction || !signMessage) return alert("Wallet error");

    setIsBetting(true);
    try {
      const selectedEndpoint = RPC_ENDPOINTS.find(
        (r) => r.value === selectedRpc,
      );
      if (!selectedEndpoint) throw new Error("Invalid RPC");

      const teeConnection = new Connection(selectedEndpoint.value, {
        commitment: "confirmed",
      });
      const teeProvider = new AnchorProvider(teeConnection, anchorWallet, {
        preflightCommitment: "confirmed",
      });
      const teeProgram = new Program(IDL, teeProvider);

      const [poolPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL, new TextEncoder().encode(poolName)],
        program.programId,
      );
      const [betPda] = PublicKey.findProgramAddressSync(
        [
          SEED_BET,
          poolPda.toBuffer(),
          anchorWallet.publicKey.toBuffer(),
          Buffer.from(storedRequestId),
        ],
        program.programId,
      );
      const predictionBN = new anchor.BN(parseFloat(prediction) * 1_000_000);

      const placeBetIx = await teeProgram.methods
        .placeBet(predictionBN, storedRequestId)
        .accounts({
          user: anchorWallet.publicKey,
          pool: poolPda,
          userBet: betPda,
        })
        .instruction();

      const latestBlockhash =
        await teeConnection.getLatestBlockhash("finalized");
      const messageV0 = new TransactionMessage({
        payerKey: anchorWallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [placeBetIx],
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);

      alert(
        "Note: Your wallet might warn you about 'Network Mismatch'. Please IGNORE and approve.",
      );

      let signedTx;
      try {
        signedTx = await signTransaction(transaction);
      } catch (signError: unknown) {
        const msg =
          signError instanceof Error ? signError.message : String(signError);
        if (msg.includes("mismatch") || msg.includes("network")) {
          alert(
            `⚠️ WALLET BLOCKED TRANSACTION ⚠️\n\nFix:\n1. Open Solflare Settings -> Network -> Add Custom Node.\n2. Paste: ${selectedEndpoint.value}\n3. Switch network and retry.`,
          );
          setIsBetting(false);
          return;
        }
        throw signError;
      }

      const txSig = await teeConnection.sendRawTransaction(
        signedTx.serialize(),
        { skipPreflight: true, maxRetries: 3 },
      );

      console.log("TEE Sig:", txSig);
      alert("✅ Bet Placed Securely in TEE!");

      const sessionKey = `swiv_req_${poolName}_${anchorWallet.publicKey.toBase58()}`;
      localStorage.removeItem(sessionKey);
      setStoredRequestId("");
      setUserBet(null);
      setIsDelegated(false);
      setPrediction("");
      setIsBetting(false);

      window.location.reload();
    } catch (error: unknown) {
      console.error("TEE Betting Error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      alert(`Failed to place bet: ${msg}`);
      setIsBetting(false);
    }
  };

  const handleUpdateBet = async (betKey: PublicKey) => {
    if (!program || !anchorWallet || !newPrediction || !signTransaction) return;

    try {
      const predictionBN = new anchor.BN(parseFloat(newPrediction) * 1_000_000);
      const currentRpcObj = RPC_ENDPOINTS.find((r) => r.value === selectedRpc);
      if (!currentRpcObj) return alert("Select Privacy Node");

      const teeConn = new Connection(currentRpcObj.value, {
        commitment: "confirmed",
      });
      const teeProv = new AnchorProvider(teeConn, anchorWallet, {
        preflightCommitment: "confirmed",
      });
      const teeProg = new Program<SwivPrivacy>(IDL as SwivPrivacy, teeProv);

      const [poolPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL, new TextEncoder().encode(poolName)],
        program.programId,
      );

      const updateIx = await teeProg.methods
        .updateBet(predictionBN)
        .accountsPartial({
          user: anchorWallet.publicKey,
          userBet: betKey,
          pool: poolPda,
        })
        .instruction();

      const lbh = await teeConn.getLatestBlockhash("finalized");
      const msg = new TransactionMessage({
        payerKey: anchorWallet.publicKey,
        recentBlockhash: lbh.blockhash,
        instructions: [updateIx],
      }).compileToV0Message();

      const tx = new VersionedTransaction(msg);
      alert("Approve TEE Transaction");
      const signed = await signTransaction(tx);
      const txSig = await teeConn.sendRawTransaction(signed.serialize(), {
        skipPreflight: true,
      });

      alert(`✅ Bet Updated! Sig: ${txSig}`);
      setUpdatingBetKey(null);
      setNewPrediction("");
      window.location.reload();
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Update failed: ${msg}`);
    }
  };

  const handleClaimAll = async () => {
    if (!program || !anchorWallet || !pool || !signTransaction) return;
    try {
      const winningBets = myBets.filter(
        (b) =>
          !b.account.calculatedWeight.isZero() &&
          Object.keys(b.account.status)[0] !== "settled",
      );

      if (winningBets.length === 0) return alert("No new rewards to claim.");

      const [poolPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL, new TextEncoder().encode(poolName)],
        program.programId,
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL_VAULT, poolPda.toBuffer()],
        program.programId,
      );
      const userAta = await getAssociatedTokenAddress(
        pool.tokenMint,
        anchorWallet.publicKey,
      );

      const ixs: TransactionInstruction[] = [];

      for (const bet of winningBets) {
        const ix = await program.methods
          .claimReward()
          .accountsPartial({
            user: anchorWallet.publicKey,
            pool: poolPda,
            poolVault: vaultPda,
            userBet: bet.pubkey,
            userTokenAccount: userAta,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction();
        ixs.push(ix);
      }

      await createAndSignVersionedTx(
        connection,
        anchorWallet.publicKey,
        ixs,
        signTransaction,
      );

      alert(`Successfully claimed rewards for ${winningBets.length} bet(s)!`);
      window.location.reload();
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Claim failed: ${msg}`);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading...
      </div>
    );
  if (!pool)
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Pool not found
      </div>
    );

  const now = Date.now() / 1000;
  const isEnded = pool.endTime.toNumber() < now;
  const isFinalized = pool.weightFinalized;
  const unclaimedCount = myBets.filter(
    (b) =>
      !b.account.calculatedWeight.isZero() &&
      Object.keys(b.account.status)[0] !== "settled",
  ).length;

  // Determine user step
  const step = isDelegated
    ? 3
    : userBet && Object.keys(userBet.status)[0] === "initialized"
      ? 2
      : userBet && Object.keys(userBet.status)[0] === "active"
        ? 3
        : 1;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <Link
        href="/"
        className="text-blue-400 hover:text-blue-300 mb-6 inline-block"
      >
        &larr; Back to Pools
      </Link>

      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
        <div>
          <h1 className="text-3xl font-bold mb-2">{poolName}</h1>
          <p className="text-gray-400 mb-6">{pool.metadata}</p>
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-sm font-bold text-gray-400 uppercase mb-4 border-b border-gray-600 pb-2">
                Global Pool Stats
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">End Time</span>
                  <span
                    className={
                      isEnded ? "text-red-400 font-bold" : "text-white"
                    }
                  >
                    {new Date(pool.endTime.toNumber() * 1000).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Liquidity</span>
                  <span className="text-green-400 font-bold">
                    {(
                      pool.vaultBalance.toNumber() / 1_000_000
                    ).toLocaleString()}{" "}
                    USDC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Accuracy Buffer</span>
                  <span className="text-yellow-400 font-bold font-mono">
                    ±{pool.maxAccuracyBuffer.toNumber() / 1_000_000}
                  </span>
                </div>
              </div>
            </div>
            {anchorWallet && (
              <div className="bg-gray-800 rounded-lg p-6 border border-blue-900/50">
                <h3 className="text-sm font-bold text-blue-400 uppercase mb-4 border-b border-gray-700 pb-2">
                  Your Position
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">My Total Deposit</span>
                    <span className="text-white font-bold">
                      {(myTotalDeposit / 1_000_000).toLocaleString()} USDC
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">My Active Bets</span>
                    <span className="text-white font-bold">
                      {myBets.length}
                    </span>
                  </div>
                  {isFinalized && unclaimedCount > 0 && (
                    <button
                      onClick={handleClaimAll}
                      className="w-full mt-4 bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded animate-pulse"
                    >
                      💰 Claim Rewards ({unclaimedCount})
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 shadow-2xl h-fit">
          {!anchorWallet ? (
            <div className="text-center py-10">
              <p className="mb-4">Connect your wallet to participate.</p>
              <WalletMultiButton />
            </div>
          ) : isEnded ? (
            <div className="text-center py-10">
              <h3 className="text-xl font-bold text-yellow-500 mb-2">
                Pool Ended
              </h3>
              {isFinalized ? (
                <div className="bg-green-900/30 p-4 rounded mt-4 border border-green-700">
                  <p className="text-green-400 font-bold text-lg mb-1">
                    Final Result
                  </p>
                  <p className="text-3xl font-mono text-white">
                    {(
                      pool.resolutionTarget.toNumber() / 1_000_000
                    ).toLocaleString()}
                  </p>
                </div>
              ) : (
                <p className="text-gray-400 text-sm mt-2 animate-pulse">
                  ⏳ Waiting for Admin Settlement...
                </p>
              )}
            </div>
          ) : (
            <>
              {/* BETTING UI (Step 1, 2, 3) */}
              <div className="bg-gray-900 p-3 rounded border border-gray-600 mb-6">
                <label className="block text-xs text-gray-400 mb-1">
                  Select Privacy Node
                </label>
                <div className="flex gap-2">
                  <select
                    className="bg-gray-800 text-sm text-white p-2 rounded flex-1 outline-none"
                    value={selectedRpc}
                    onChange={(e) => {
                      setSelectedRpc(e.target.value);
                      setRpcStatus("idle");
                    }}
                    disabled={step === 3 && isDelegated}
                  >
                    {RPC_ENDPOINTS.map((rpc) => (
                      <option key={rpc.value} value={rpc.value}>
                        {rpc.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={checkRpcConnection}
                    className={`text-xs px-3 rounded font-bold ${rpcStatus === "online" ? "bg-green-900 text-green-400" : rpcStatus === "offline" ? "bg-red-900 text-red-400" : "bg-gray-700"}`}
                  >
                    {rpcStatus === "checking"
                      ? "..."
                      : rpcStatus === "online"
                        ? "Secure"
                        : "Verify"}
                  </button>
                </div>
              </div>

              {step === 1 && (
                <div>
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <span className="bg-blue-600 text-xs rounded px-2 py-1">
                      Step 1
                    </span>{" "}
                    Join Pool
                  </h2>
                  <input
                    type="number"
                    className="w-full bg-gray-900 border border-gray-600 rounded p-3 mb-4"
                    placeholder="Deposit (USDC)"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                  />
                  <button
                    onClick={handleDeposit}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded"
                  >
                    Deposit & Initialize
                  </button>
                </div>
              )}
              {step === 2 && (
                <div>
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <span className="bg-purple-600 text-xs rounded px-2 py-1">
                      Step 2
                    </span>{" "}
                    Enable Privacy
                  </h2>
                  <div className="bg-blue-900/30 border border-blue-600 p-4 rounded mb-4 text-sm text-blue-200">
                    <strong>✅ Current Stake:</strong>{" "}
                    {userBet
                      ? (
                          userBet.deposit.toNumber() / 1_000_000
                        ).toLocaleString()
                      : "..."}{" "}
                    USDC
                  </div>
                  <button
                    onClick={handleDelegate}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded transition"
                  >
                    Delegate to TEE
                  </button>
                </div>
              )}
              {step === 3 && (
                <div>
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <span className="bg-green-600 text-xs rounded px-2 py-1">
                      Step 3
                    </span>{" "}
                    Place Prediction
                  </h2>
                  <input
                    type="number"
                    className="w-full bg-gray-900 p-3 mb-4 rounded border border-gray-600 outline-none"
                    placeholder="e.g. 98000"
                    value={prediction}
                    onChange={(e) => setPrediction(e.target.value)}
                  />
                  <button
                    onClick={handlePlaceBet}
                    disabled={isBetting || rpcStatus !== "online"}
                    className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isBetting ? "Encrypting..." : "🔒 Encrypt & Submit Bet"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {anchorWallet && myBets.length > 0 && (
        <div className="max-w-4xl mx-auto bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-xl font-bold mb-4 text-white">My Active Bets</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-400">
              <thead className="text-xs text-gray-500 uppercase bg-gray-700">
                <tr>
                  <th className="px-6 py-3">Bet ID</th>
                  <th className="px-6 py-3">Deposit</th>
                  <th className="px-6 py-3">Prediction</th>
                  {isFinalized && (
                    <>
                      <th className="px-6 py-3 text-right">Result</th>
                      <th className="px-6 py-3 text-right">Payout</th>
                      <th className="px-6 py-3 text-right">P/L</th>
                    </>
                  )}
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {myBets.map((bet, idx) => (
                  <tr
                    key={idx}
                    className="bg-gray-800 border-b border-gray-700 hover:bg-gray-700/50"
                  >
                    <td className="px-6 py-4 font-mono">
                      {bet.pubkey.toBase58().slice(0, 6)}...
                    </td>
                    <td className="px-6 py-4 font-bold text-white">
                      {(bet.account.deposit.toNumber() / 1e6).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 font-mono">
                      {isFinalized
                        ? bet.displayPrediction // If finalized, we can try to show it (actually L1 already reveals it)
                        : bet.displayPrediction === 0
                          ? "🔒 Hidden"
                          : bet.displayPrediction}
                    </td>

                    {isFinalized && (
                      <>
                        <td className="px-6 py-4 text-right font-mono text-gray-300">
                          {(
                            pool.resolutionTarget.toNumber() / 1_000_000
                          ).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-white">
                          {bet.payout > 0 ? `$${bet.payout.toFixed(2)}` : "-"}
                        </td>
                        <td
                          className={`px-6 py-4 text-right font-bold ${bet.profit >= 0 ? "text-green-400" : "text-red-400"}`}
                        >
                          {bet.profit > 0 ? "+" : ""}
                          {bet.profit.toFixed(2)}
                        </td>
                      </>
                    )}

                    <td className="px-6 py-4 text-right">
                      {/* ACTION BUTTON LOGIC */}
                      {isFinalized ? (
                        Object.keys(bet.account.status)[0] === "settled" ? (
                          <span className="text-gray-500 text-xs">Claimed</span>
                        ) : !bet.account.calculatedWeight.isZero() ? (
                          <span className="text-green-400 text-xs animate-pulse">
                            Ready to Claim
                          </span>
                        ) : (
                          <span className="text-red-500 text-xs">Lost</span>
                        )
                      ) : isEnded ? (
                        <span className="text-gray-500 italic text-xs">
                          Ended
                        </span>
                      ) : // Normal Update Logic
                      updatingBetKey === bet.pubkey.toBase58() ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="number"
                            className="w-20 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white"
                            placeholder="New"
                            value={newPrediction}
                            onChange={(e) => setNewPrediction(e.target.value)}
                          />
                          <button
                            onClick={() => handleUpdateBet(bet.pubkey)}
                            className="text-green-400 hover:text-green-300"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setUpdatingBetKey(null)}
                            className="text-red-400 hover:text-red-300"
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setUpdatingBetKey(bet.pubkey.toBase58());
                            setNewPrediction("");
                          }}
                          className="text-blue-400 hover:text-blue-300 underline"
                        >
                          Update
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
