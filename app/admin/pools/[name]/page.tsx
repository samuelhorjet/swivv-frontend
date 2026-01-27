"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PublicKey,
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
  ComputeBudgetProgram,
  SystemProgram,
} from "@solana/web3.js";
import {
  IdlAccounts,
  Program,
  AnchorProvider,
  Wallet,
  BN,
} from "@coral-xyz/anchor";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, } from "@solana/spl-token";
import { useProgram } from "../../../../hooks/useProgram";
import {
  SwivPrivacy,
  SEED_POOL,
  SEED_POOL_VAULT,
  SEED_GLOBAL_CONFIG,
  DELEGATION_PROGRAM_ID,
  RPC_ENDPOINTS,
  IDL,
} from "../../../../utils/contants";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

// --- TYPES ---
type PoolAccount = IdlAccounts<SwivPrivacy>["pool"];
type UserBetAccount = IdlAccounts<SwivPrivacy>["userBet"];
type GlobalConfigAccount = IdlAccounts<SwivPrivacy>["globalConfig"];

type BetItem = {
  publicKey: PublicKey;
  account: UserBetAccount;
};

type GroupedParticipant = {
  userKey: string;
  totalDeposit: number;
  betCount: number;
  predictions: number[];
  status: string;
  hasWon: boolean;
  totalWeight: BN;
  payout: number;
  profit: number;
};

// --- DUMMY WALLET ---
const createDummyWallet = (): Wallet => {
  const kp = Keypair.generate();
  return {
    payer: kp,
    publicKey: kp.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(
      _tx: T,
    ): Promise<T> => {
      throw new Error("Dummy wallet cannot sign");
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(
      _txs: T[],
    ): Promise<T[]> => {
      throw new Error("Dummy wallet cannot sign");
    },
  };
};

export default function AdminPoolDetail() {
  // FIX: Destructure wallet as anchorWallet
  const { program, connection, wallet: anchorWallet } = useProgram();
  const params = useParams();
  const router = useRouter();

  const rawName = params.name as string;
  const poolName = decodeURIComponent(rawName);

  const [pool, setPool] = useState<PoolAccount | null>(null);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfigAccount | null>(
    null,
  );
  const [bets, setBets] = useState<BetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [poolAddress, setPoolAddress] = useState<string>("");

  // --- STEP TRACKING STATE ---
  const [steps, setSteps] = useState({
    1: false, // Delegated
    2: false, // Resolved
    3: false, // Calculated
    4: false, // Returned/Finalized
  });

  useEffect(() => {
    if (!program || !poolName || !connection) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // A. Config & Pool
        const [configPda] = PublicKey.findProgramAddressSync(
          [SEED_GLOBAL_CONFIG],
          program.programId,
        );
        const configAccount = await program.account.globalConfig.fetch(configPda);
        setGlobalConfig(configAccount);

        const [poolPda] = PublicKey.findProgramAddressSync(
          [SEED_POOL, new TextEncoder().encode(poolName)],
          program.programId,
        );
        setPoolAddress(poolPda.toBase58());
        const poolAccount = await program.account.pool.fetch(poolPda);
        setPool(poolAccount);

        if (poolAccount.isResolved && !poolAccount.weightFinalized) {
            setSteps({ 1: true, 2: true, 3: true, 4: false });
        } else if (poolAccount.weightFinalized) {
            setSteps({ 1: true, 2: true, 3: true, 4: true });
        }

        // B. Bets (With Deduplication)
        const discriminator = await program.coder.accounts.memcmp("userBet");
        const [standardBets, delegatedBets] = await Promise.all([
          connection.getProgramAccounts(program.programId, {
            filters: [{ memcmp: { offset: 0, bytes: discriminator.bytes as string } }],
          }),
          connection.getProgramAccounts(DELEGATION_PROGRAM_ID, {
            filters: [{ memcmp: { offset: 0, bytes: discriminator.bytes as string } }],
          }),
        ]);

        const allRawBets = [...standardBets, ...delegatedBets];
        
        // Use a Map to deduplicate by Pubkey string
        const uniqueBets = new Map<string, BetItem>();

        for (const raw of allRawBets) {
          try {
            // Only decode if we haven't seen this pubkey yet
            if (!uniqueBets.has(raw.pubkey.toBase58())) {
                const decodedAccount = program.coder.accounts.decode(
                  "userBet",
                  raw.account.data,
                );
                if (decodedAccount.poolIdentifier === poolName) {
                  uniqueBets.set(raw.pubkey.toBase58(), {
                    publicKey: raw.pubkey,
                    account: decodedAccount,
                  });
                }
            }
          } catch { /* skip */ }
        }
        setBets(Array.from(uniqueBets.values()));

      } catch (error: unknown) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [program, connection, poolName]);

  // --- HELPER: Get TEE Program (No Auth Token) ---
  const getTeeProgram = useMemo(() => {
    return () => {
      if (!anchorWallet) throw new Error("Wallet not connected");
      // Use the first endpoint from constants (usually devnet-eu)
      const teeEndpoint = RPC_ENDPOINTS[0].value;

      const teeConnection = new Connection(teeEndpoint, "confirmed");
      const teeProvider = new AnchorProvider(teeConnection, anchorWallet, {
        preflightCommitment: "confirmed",
        skipPreflight: true, // Often helpful with TEEs
      });
      return new Program<SwivPrivacy>(IDL as SwivPrivacy, teeProvider);
    };
  }, [anchorWallet]);

  // --- ACTIONS ---

  // 1. DELEGATE POOL (L1 -> TEE)
  const handleDelegate = async () => {
    if (!program || !pool || !globalConfig || !anchorWallet) return;
    try {
      const teeValidator = new PublicKey(RPC_ENDPOINTS[0].validatorKey);
      const [poolPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL, new TextEncoder().encode(poolName)],
        program.programId,
      );
      const [configPda] = PublicKey.findProgramAddressSync(
        [SEED_GLOBAL_CONFIG],
        program.programId,
      );

      const tx = await program.methods
        .delegatePool(poolName)
        .accountsPartial({
          admin: anchorWallet.publicKey,
          globalConfig: configPda,
          pool: poolPda,
          validator: teeValidator,
          ownerProgram: program.programId,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`Pool Delegated! Tx: ${tx}`);
      setSteps((prev) => ({ ...prev, 1: true }));
    } catch (error: unknown) {
      console.error(error);
      if (error instanceof Error) alert(`Error: ${error.message}`);
    }
  };

  // 2. RESOLVE POOL (TEE)
  const handleResolve = async () => {
    if (!program || !pool || !globalConfig || !anchorWallet) return;
    try {
      const priceStr = window.prompt("Enter Final Outcome Price (e.g. 95000):");
      if (!priceStr) return;

      // Assuming 6 decimals for USDC based on your tests
      const finalPrice = new BN(parseFloat(priceStr) * 1_000_000);

      const teeProgram = getTeeProgram();
      const [poolPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL, new TextEncoder().encode(poolName)],
        program.programId,
      );
      const [configPda] = PublicKey.findProgramAddressSync(
        [SEED_GLOBAL_CONFIG],
        program.programId,
      );

      // Call resolve on TEE
      const tx = await teeProgram.methods
        .resolvePool(finalPrice)
        .accountsPartial({
          admin: anchorWallet.publicKey,
          globalConfig: configPda,
          pool: poolPda,
        })
        .rpc();

      console.log(`Pool Resolved on TEE! Tx: ${tx}`);
      setSteps((prev) => ({ ...prev, 2: true }));
    } catch (error: unknown) {
      console.error(error);
      if (error instanceof Error) alert(`Error: ${error.message}`);
    }
  };

  // 3. CALCULATE WEIGHTS (TEE)
  const handleCalculate = async () => {
    if (!program || !pool || !anchorWallet) return;
    try {
      const teeProgram = getTeeProgram();
      const [poolPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL, new TextEncoder().encode(poolName)],
        program.programId,
      );

      // Construct remaining accounts from all bets
      const remainingAccounts = bets.map((b) => ({
        pubkey: b.publicKey,
        isWritable: true,
        isSigner: false,
      }));

      const tx = await teeProgram.methods
        .batchCalculateWeights()
        .accountsPartial({
          admin: anchorWallet.publicKey,
          pool: poolPda,
        })
        .remainingAccounts(remainingAccounts)
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        ])
        .rpc();

      console.log(`Weights Calculated on TEE! Tx: ${tx}`);
      setSteps((prev) => ({ ...prev, 3: true }));
    } catch (error: unknown) {
      console.error(error);
      if (error instanceof Error) alert(`Error: ${error.message}`);
    }
  };

  // 4. RETURN / UNDELEGATE (TEE -> L1)
  const handleUndelegate = async () => {
    if (!program || !pool || !globalConfig || !anchorWallet) return;
    try {
      const teeProgram = getTeeProgram();
      const [poolPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL, new TextEncoder().encode(poolName)],
        program.programId
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL_VAULT, poolPda.toBuffer()],
        program.programId
      );
      const [configPda] = PublicKey.findProgramAddressSync(
        [SEED_GLOBAL_CONFIG],
        program.programId
      );

      // --- STEP A & B (TEE Work - Silent Try) ---
      // (Same as before...)
      const remainingAccounts = bets.map((b) => ({
        pubkey: b.publicKey,
        isWritable: true,
        isSigner: false,
      }));

      try {
          console.log("Attempting TEE Undelegation...");
          await teeProgram.methods
            .batchUndelegateBets()
            .accountsPartial({
              payer: anchorWallet.publicKey,
              pool: poolPda,
              magicProgram: new PublicKey("Magic11111111111111111111111111111111111111"),
              magicContext: new PublicKey("MagicContext1111111111111111111111111111111"),
            })
            .remainingAccounts(remainingAccounts)
            .rpc();
            
          await teeProgram.methods
            .undelegatePool()
            .accountsPartial({
              admin: anchorWallet.publicKey,
              globalConfig: configPda,
              pool: poolPda,
              magicProgram: new PublicKey("Magic11111111111111111111111111111111111111"),
              magicContext: new PublicKey("MagicContext1111111111111111111111111111111"),
            })
            .rpc();
      } catch {
          console.log("TEE steps might already be done, proceeding to L1 Finalize...");
      }

      // --- STEP C: Finalize Weights (THE FIX) ---
      console.log("Finalizing weights on L1...");

      // 1. Calculate where the Treasury ATA should be
      const treasuryAta = await getAssociatedTokenAddress(
        pool.tokenMint,
        globalConfig.treasuryWallet,
        true // allowOwnerOffCurve
      );

      // 2. Check if it exists
      const info = await connection.getAccountInfo(treasuryAta);
      
      const preInstructions = [];
      
      // 3. If it doesn't exist, add an instruction to create it!
      if (!info) {
          console.log("Treasury ATA missing. Creating it now...");
          preInstructions.push(
              createAssociatedTokenAccountInstruction(
                  anchorWallet.publicKey, // Payer (You)
                  treasuryAta,            // The new ATA address
                  globalConfig.treasuryWallet, // The Owner (Treasury)
                  pool.tokenMint          // The Mint (USDC)
              )
          );
      }

      const tx = await program.methods
        .finalizeWeights()
        .accountsPartial({
          admin: anchorWallet.publicKey,
          globalConfig: configPda,
          pool: poolPda,
          poolVault: vaultPda,
          treasuryTokenAccount: treasuryAta, // Use the address we calculated
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions(preInstructions) // <--- Attach creation instruction here
        .rpc();

      console.log(`Pool Returned & Finalized on L1! Tx: ${tx}`);
      setSteps((prev) => ({ ...prev, 4: true }));
      window.location.reload();

    } catch (error: unknown) {
      console.error(error);
      if (error instanceof Error) alert(`Error: ${error.message}`);
    }
  };

  // --- AGGREGATION & PAYOUT LOGIC ---
  const groupedParticipants = useMemo(() => {
    if (!pool || !globalConfig) return [];

    const map = new Map<string, GroupedParticipant>();
    const poolTotalWeightBN = pool.totalWeight; // BN
    const isWeightFinalized = pool.weightFinalized;

    // Calculate Pot available for winners (Vault Balance - Protocol Fee)
    const vaultBalance = pool.vaultBalance.toNumber(); // raw units
    const feeBps = globalConfig.protocolFeeBps.toNumber();
    const feeAmount = (vaultBalance * feeBps) / 10000;
    const netVaultBalance = vaultBalance - feeAmount;

    bets.forEach((bet) => {
      const userKey = bet.account.owner.toBase58();

      const depositRaw = bet.account.deposit.toNumber();
      const depositUI = depositRaw / 1_000_000;

      const predictionRaw = bet.account.prediction.toNumber();
      const predictionUI = predictionRaw / 1_000_000;

      const weightBN = bet.account.calculatedWeight;
      const hasWon = !weightBN.isZero();
      const statusStr = Object.keys(bet.account.status)[0] || "Unknown";

      if (!map.has(userKey)) {
        map.set(userKey, {
          userKey,
          totalDeposit: 0, // Accumulator
          betCount: 0,
          predictions: [],
          status: statusStr,
          hasWon: false,
          totalWeight: new BN(0),
          payout: 0,
          profit: 0,
        });
      }

      const entry = map.get(userKey)!;
      entry.totalDeposit += depositUI;
      entry.betCount += 1;
      entry.predictions.push(predictionUI);
      entry.totalWeight = entry.totalWeight.add(weightBN);

      if (hasWon) entry.hasWon = true;
    });

    // Final Pass: Calculate Payout & Profit
    const results = Array.from(map.values());

    return results.map((p) => {
      let payout = 0;

      if (isWeightFinalized && !poolTotalWeightBN.isZero()) {
        if (p.totalWeight.gt(new BN(0))) {
          // Formula: (UserWeight / TotalWeight) * NetVault
          // Use BN for precision then convert to number
          // Note: Multiplying large numbers might overflow JS Number, so use BN for math
          const netVaultBN = new BN(netVaultBalance);
          const payoutBN = p.totalWeight.mul(netVaultBN).div(poolTotalWeightBN);
          payout = payoutBN.toNumber() / 1_000_000;
        } else {
          payout = 0;
        }
      }

      return {
        ...p,
        payout: payout,
        profit: isWeightFinalized ? payout - p.totalDeposit : 0,
      };
    });
  }, [bets, pool, globalConfig]);

  // --- AUDIT TOOL ---
  const verifyPrivacy = async () => {
    if (bets.length === 0) return alert("No bets.");
    const teeEndpoint = RPC_ENDPOINTS[0].value;
    const publicConnection = new Connection(teeEndpoint, "confirmed");
    const dummyWallet = createDummyWallet();
    const publicProvider = new AnchorProvider(publicConnection, dummyWallet, {
      preflightCommitment: "confirmed",
    });
    const publicProgram = new Program<SwivPrivacy>(
      IDL as SwivPrivacy,
      publicProvider,
    );

    let details = "";
    for (const bet of bets) {
      const userKey = bet.account.owner.toBase58();
      const shortUser = `${userKey.substring(0, 4)}...${userKey.substring(
        userKey.length - 4,
      )}`;
      try {
        const data = await publicProgram.account.userBet.fetch(bet.publicKey);
        details += `❌ ${shortUser}: LEAKED (Pred: ${data.prediction.toString()})\n`;
      } catch (error: unknown) {
        let message = "";
        if (error instanceof Error) message = error.message;
        else message = String(error);

        if (
          message.includes("Account does not exist") ||
          message.includes("fetch failed")
        ) {
          details += `✅ ${shortUser}: Secure\n`;
        } else {
          details += `⚠️ ${shortUser}: Error\n`;
        }
      }
    }
    alert(details);
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
  const isResolved = pool.isResolved;

  const protocolFeePct = globalConfig
    ? (globalConfig.protocolFeeBps.toNumber() / 100).toFixed(2)
    : "0";

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="flex justify-between items-center mb-10 border-b border-gray-700 pb-4">
        <div>
          <h1 className="text-2xl font-bold">Pool: {poolName}</h1>
          <div className="text-xs text-gray-500 font-mono mt-1">
            Address: {poolAddress}
          </div>
          <button
            onClick={() => router.back()}
            className="text-sm text-blue-400 hover:text-blue-300 mt-2"
          >
            &larr; Back to List
          </button>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={verifyPrivacy}
            className="bg-gray-800 text-xs px-3 py-2 rounded border border-gray-600 hover:bg-gray-700"
          >
            🕵️ Audit
          </button>
          <WalletMultiButton />
        </div>
      </header>

      <main className="max-w-6xl mx-auto space-y-8">
        {/* SETTLEMENT CONSOLE */}
        {isEnded && !pool.weightFinalized && (
          <div className="bg-linear-to-r from-yellow-900/50 to-orange-900/50 border border-yellow-600 p-6 rounded-lg shadow-xl">
            <h2 className="text-2xl font-bold text-white mb-4">
              ⚠️ Settlement Console
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* BUTTON 1: DELEGATE */}
              <button
                onClick={handleDelegate}
                disabled={steps[1]}
                className={`p-4 rounded border transition-colors group ${
                  steps[1]
                    ? "bg-green-900/50 border-green-500 cursor-not-allowed"
                    : "bg-gray-800 border-gray-600 hover:bg-gray-700"
                }`}
              >
                <span
                  className={`font-bold block mb-1 ${steps[1] ? "text-green-400" : "text-blue-400"}`}
                >
                  Step 1: Delegate {steps[1] && "✓"}
                </span>
                <span className="text-xs text-gray-500">
                  {steps[1] ? "Completed" : "Move Pool to TEE"}
                </span>
              </button>

              {/* BUTTON 2: RESOLVE */}
              <button
                onClick={handleResolve}
                disabled={!steps[1] || steps[2]}
                className={`p-4 rounded border transition-colors group ${
                  steps[2]
                    ? "bg-green-900/50 border-green-500 cursor-not-allowed"
                    : !steps[1]
                      ? "opacity-50 cursor-not-allowed bg-gray-800 border-gray-700"
                      : "bg-gray-800 border-gray-600 hover:bg-gray-700"
                }`}
              >
                <span
                  className={`font-bold block mb-1 ${steps[2] ? "text-green-400" : "text-purple-400"}`}
                >
                  Step 2: Resolve {steps[2] && "✓"}
                </span>
                <span className="text-xs text-gray-500">
                  {steps[2] ? "Completed" : "Set Final Price"}
                </span>
              </button>

              {/* BUTTON 3: CALCULATE */}
              <button
                onClick={handleCalculate}
                disabled={!steps[2] || steps[3]}
                className={`p-4 rounded border transition-colors group ${
                  steps[3]
                    ? "bg-green-900/50 border-green-500 cursor-not-allowed"
                    : !steps[2]
                      ? "opacity-50 cursor-not-allowed bg-gray-800 border-gray-700"
                      : "bg-gray-800 border-gray-600 hover:bg-gray-700"
                }`}
              >
                <span
                  className={`font-bold block mb-1 ${steps[3] ? "text-green-400" : "text-green-400"}`}
                >
                  Step 3: Calc {steps[3] && "✓"}
                </span>
                <span className="text-xs text-gray-500">
                  {steps[3] ? "Completed" : "Compute Weights"}
                </span>
              </button>

              {/* BUTTON 4: RETURN */}
              <button
                onClick={handleUndelegate}
                disabled={!steps[3] || steps[4]}
                className={`p-4 rounded border transition-colors group ${
                  steps[4]
                    ? "bg-green-900/50 border-green-500 cursor-not-allowed"
                    : !steps[3]
                      ? "opacity-50 cursor-not-allowed bg-gray-800 border-gray-700"
                      : "bg-gray-800 border-gray-600 hover:bg-gray-700"
                }`}
              >
                <span
                  className={`font-bold block mb-1 ${steps[4] ? "text-green-400" : "text-red-400"}`}
                >
                  Step 4: Return {steps[4] && "✓"}
                </span>
                <span className="text-xs text-gray-500">
                  {steps[4] ? "Completed" : "Sync to L1"}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-gray-400 text-sm font-bold uppercase mb-2">
              Status
            </h3>
            <div className="text-2xl font-bold">
              {pool.weightFinalized ? (
                <span className="text-green-400">Settled</span>
              ) : isResolved ? (
                <span className="text-purple-400">Resolving...</span>
              ) : isEnded ? (
                <span className="text-yellow-500">Ended</span>
              ) : (
                <span className="text-blue-400">Active</span>
              )}
            </div>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-gray-400 text-sm font-bold uppercase mb-2">
              Vault Balance
            </h3>
            <div className="text-2xl font-bold text-white">
              {(pool.vaultBalance.toNumber() / 1_000_000).toLocaleString()}{" "}
              <span className="text-sm text-gray-500">USDC</span>
            </div>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-gray-400 text-sm font-bold uppercase mb-2">
              Participants
            </h3>
            <div className="text-2xl font-bold text-purple-400">
              {groupedParticipants.length}
            </div>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-gray-400 text-sm font-bold uppercase mb-2">
              Bets Placed
            </h3>
            <div className="text-2xl font-bold text-blue-400">
              {bets.length}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* CONFIGURATION BLOCK */}
          <div className="bg-gray-800 p-6 rounded-lg h-fit border border-gray-700">
            <h3 className="text-lg font-bold border-b border-gray-700 pb-2 mb-4">
              Configuration
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Metadata:</span>
                <span className="font-medium text-white">
                  {pool.metadata || "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Accuracy Buffer:</span>
                <span className="font-mono text-yellow-400 font-bold">
                  {/* Show raw number for debugging */}
                  {pool.maxAccuracyBuffer.toString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Start Time:</span>
                <span className="text-right">
                  {new Date(pool.startTime.toNumber() * 1000).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">End Time:</span>
                <span
                  className={`text-right ${
                    isEnded ? "text-red-400 font-bold" : "text-white"
                  }`}
                >
                  {new Date(pool.endTime.toNumber() * 1000).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-700 mt-2">
                <span className="text-gray-400">Protocol Fee:</span>
                <span className="text-orange-400 font-bold">
                  {protocolFeePct}%
                </span>
              </div>
            </div>
          </div>

          {/* PARTICIPANTS TABLE */}
          <div className="md:col-span-2 bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-lg font-bold border-b border-gray-700 pb-2 mb-4">
              Participants & Outcomes
            </h3>
            {groupedParticipants.length === 0 ? (
              <p className="text-gray-500 italic">No bets placed yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-150">
                  <thead className="text-xs text-gray-400 uppercase bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap">User</th>
                      <th className="px-4 py-3 text-right">Deposit</th>
                      <th className="px-4 py-3 text-right">Prediction</th>
                      <th className="px-4 py-3 text-right">Status</th>
                      <th className="px-4 py-3 text-right">Payout</th>
                      <th className="px-4 py-3 text-right">P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedParticipants.map((row, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-700 hover:bg-gray-700/50"
                      >
                        <td className="px-4 py-3 font-mono text-gray-300">
                          {row.userKey.substring(0, 4)}...
                        </td>
                        <td className="px-4 py-3 text-right text-white">
                          ${row.totalDeposit.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400 font-mono">
                          {pool.weightFinalized ? (
                            row.predictions.join(", ")
                          ) : (
                            <span className="text-gray-500">🔒</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {pool.weightFinalized ? (
                            row.hasWon ? (
                              <span className="bg-green-900 text-green-300 px-2 py-1 text-xs rounded">
                                WON
                              </span>
                            ) : (
                              <span className="bg-red-900 text-red-300 px-2 py-1 text-xs rounded">
                                LOST
                              </span>
                            )
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-white">
                          {pool.weightFinalized
                            ? `$${row.payout.toFixed(2)}`
                            : "-"}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-bold ${
                            row.profit > 0
                              ? "text-green-400"
                              : row.profit < 0
                                ? "text-red-400"
                                : "text-gray-400"
                          }`}
                        >
                          {pool.weightFinalized
                            ? (row.profit > 0 ? "+" : "") +
                              row.profit.toFixed(2)
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
