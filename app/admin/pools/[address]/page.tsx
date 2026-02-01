"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PublicKey,
  Connection,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  AccountInfo,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { useProgram } from "../../../../hooks/useProgram";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  SwivPrivacy,
  SEED_POOL_VAULT,
  SEED_PROTOCOL,
  DELEGATION_PROGRAM_ID,
  RPC_ENDPOINTS,
  IDL,
  delegationRecordPdaFromDelegatedAccount,
  getAuthToken,
  TEE_VALIDATOR_KEY,
} from "../../../../utils/contants";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  PoolAccount,
  ProtocolAccount,
  BetWithAddress,
  GroupedParticipant,
  UserBetAccount,
} from "../../../../types/swiv";

// Mutable type definition to fix TypeScript errors
type MutableAccount = {
  pubkey: PublicKey;
  account: AccountInfo<Buffer>;
};

export default function AdminPoolDetail() {
  const { program, connection, wallet: anchorWallet } = useProgram();
  const { signMessage, signTransaction, publicKey: walletKey } = useWallet();
  const params = useParams();
  const router = useRouter();
  const poolAddressStr = params.address as string;

  const [pool, setPool] = useState<PoolAccount | null>(null);
  const [protocol, setProtocol] = useState<ProtocolAccount | null>(null);
  const [bets, setBets] = useState<BetWithAddress[]>([]);

  // Loading States
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [auditLogs, setAuditLogs] = useState<string[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);

  const [steps, setSteps] = useState({
    1: false,
    2: false,
    3: false,
    4: false,
    5: false,
  });

  // --- 1. SAFE FETCH DATA (L1 ONLY - NO TEE AUTH) ---
  const fetchData = useCallback(async () => {
    // We only rely on poolAddressStr to trigger this.
    // We check program/connection inside to avoid dependency loops.
    if (!program || !poolAddressStr || !connection) return;

    try {
      // Don't set loading(true) here if we want background updates,
      // but for first load we need it.
      // We rely on the initial state of 'loading' to show the spinner.

      const poolKey = new PublicKey(poolAddressStr);
      const [protocolPda] = PublicKey.findProgramAddressSync(
        [SEED_PROTOCOL],
        program.programId,
      );

      // A. Fetch Basic L1 State
      const [protocolAccount, poolAccount] = await Promise.all([
        program.account.protocol.fetch(protocolPda),
        program.account.pool.fetch(poolKey),
      ]);

      setProtocol(protocolAccount as ProtocolAccount);
      setPool(poolAccount as PoolAccount);

      // B. Check Delegation Status (Public L1 RPC)
      const delegationRecord = delegationRecordPdaFromDelegatedAccount(poolKey);
      const delegationInfo = await connection.getAccountInfo(delegationRecord);

      const isDelegatedOnL1 = delegationInfo !== null;
      const isFinalizedOnL1 = (poolAccount as PoolAccount).weightFinalized;
      const isFlushedToL1 =
        (poolAccount as PoolAccount).isResolved && !isDelegatedOnL1;

      setSteps((prev) => ({
        ...prev,
        1: isDelegatedOnL1 || isFinalizedOnL1,
        4: isFlushedToL1 || isFinalizedOnL1,
        5: isFinalizedOnL1,
      }));

      // C. FETCH BETS (Public L1 RPC only)
      const discriminator = await program.coder.accounts.memcmp("userBet");
      const filters = [
        { memcmp: { offset: 0, bytes: discriminator.bytes as string } },
        { memcmp: { offset: 40, bytes: poolKey.toBase58() } },
      ];

      // Fetch from BOTH locations (Standard L1 + Delegation Program)
      // This does NOT require TEE Auth, just standard RPC read.
      const [stdResponse, delResponse] = await Promise.all([
        connection.getProgramAccounts(program.programId, { filters }),
        connection.getProgramAccounts(DELEGATION_PROGRAM_ID, { filters }),
      ]);

      const stdAccounts = stdResponse as unknown as MutableAccount[];
      const delAccounts = delResponse as unknown as MutableAccount[];

      const allRawAccounts = [...stdAccounts, ...delAccounts];

      const uniqueBets = new Map<string, BetWithAddress>();

      allRawAccounts.forEach((raw) => {
        if (!uniqueBets.has(raw.pubkey.toBase58())) {
          try {
            const decodedAccount = program.coder.accounts.decode(
              "userBet",
              raw.account.data,
            ) as UserBetAccount;

            uniqueBets.set(raw.pubkey.toBase58(), {
              publicKey: raw.pubkey,
              account: decodedAccount,
            });
          } catch {
            console.warn("Skipping corrupt account:", raw.pubkey.toBase58());
          }
        }
      });

      setBets(Array.from(uniqueBets.values()));
    } catch (e: unknown) {
      console.error("Fetch Error:", e);
    } finally {
      // ALWAYS stop loading, even if error
      setLoading(false);
    }
  }, [connection, poolAddressStr, program]); // Reduced dependencies to prevent loops

  // Trigger fetch on mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- HELPERS ---

  const sendVersionedTx = async (
    instructions: TransactionInstruction[],
    conn: Connection,
  ) => {
    if (!walletKey || !signTransaction) throw new Error("Wallet not connected");

    const { blockhash, lastValidBlockHeight } =
      await conn.getLatestBlockhash("confirmed");
    const messageV0 = new TransactionMessage({
      payerKey: walletKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    const signed = await signTransaction(transaction);

    const txid = await conn.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    await conn.confirmTransaction({
      signature: txid,
      blockhash,
      lastValidBlockHeight,
    });

    return txid;
  };

  const getAuthTeeProgram = useCallback(async () => {
    if (!signMessage || !anchorWallet) throw new Error("Wallet not connected");
    const authToken = await getAuthToken(
      RPC_ENDPOINTS[0].value,
      anchorWallet.publicKey,
      async (msg: Uint8Array) => await signMessage(msg),
    );
    const teeConn = new Connection(
      `${RPC_ENDPOINTS[0].value}?token=${authToken.token}`,
      "confirmed",
    );
    return new Program<SwivPrivacy>(
      IDL,
      new AnchorProvider(teeConn, anchorWallet, {
        preflightCommitment: "confirmed",
      }),
    );
  }, [anchorWallet, signMessage]);

  const syncTeeState = async () => {
    if (!anchorWallet) return;
    setIsSyncing(true);
    try {
      const tee = await getAuthTeeProgram();
      const poolKey = new PublicKey(poolAddressStr);
      try {
        const teePool = (await tee.account.pool.fetch(poolKey)) as PoolAccount;
        setSteps((prev) => ({
          ...prev,
          2: teePool.isResolved,
          3: teePool.totalWeight.gt(new BN(0)),
        }));
      } catch {
        if (steps[1] && !steps[5])
          setSteps((prev) => ({ ...prev, 2: true, 3: true, 4: true }));
      }
    } catch {
      alert("TEE Sync Failed. Ensure you signed the message.");
    } finally {
      setIsSyncing(false);
    }
  };

  const [signatures, setSignatures] = useState<Record<number, string>>({});

  const handleStep1Delegate = async () => {
    if (!program || !pool || !walletKey || !connection) return;

    try {
      const poolKey = new PublicKey(poolAddressStr);
      const [protocolPda] = PublicKey.findProgramAddressSync(
        [SEED_PROTOCOL],
        program.programId,
      );

      const ix = await program.methods
        .delegatePool(pool.poolId) 
        .accountsPartial({
          admin: walletKey,
          protocol: protocolPda,
          pool: poolKey,
          validator: TEE_VALIDATOR_KEY,
          systemProgram: SystemProgram.programId, // FIX: Used SystemProgram
        })
        .instruction();

      const txid = await sendVersionedTx([ix], connection);
      setSignatures((prev) => ({ ...prev, 1: txid }));
      setSteps((prev) => ({ ...prev, 1: true }));
      await fetchData();
    } catch (e) {
      console.error("Step 1 Failed:", e);
    }
  };

  const handleStep2Resolve = async () => {
    if (!program || !pool || !walletKey) return;

    try {
      // 1. Prompt for a human-readable number
      const userInput = window.prompt(
        "Enter the Resolution Price (e.g., 200.50). \n\nNote: The system will automatically scale this by 1,000,000 for the TEE.",
        (Number(pool.resolutionTarget.toString()) / 1_000_000).toString(),
      );

      // 2. Handle Cancel or Empty
      if (userInput === null || userInput === "") return;

      // 3. Validation and Scaling
      const parsedPrice = parseFloat(userInput);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        alert("Invalid input. Please enter a positive number.");
        return;
      }

      // Convert human number to BN (e.g., 200.5 -> 200,500,000)
      const scaledPrice = new BN(Math.round(parsedPrice * 1_000_000));

      // 4. Confirmation for the Admin
      const confirmProceed = window.confirm(
        `Confirming Resolution: \n\nInput: ${parsedPrice} \nScaled Value: ${scaledPrice.toString()} \n\nProceed to TEE?`,
      );
      if (!confirmProceed) return;

      const tee = await getAuthTeeProgram();
      const [protocolPda] = PublicKey.findProgramAddressSync(
        [SEED_PROTOCOL],
        program.programId,
      );

      const ix = await tee.methods
        .resolvePool(scaledPrice) // Fixed: Using correctly scaled BN
        .accountsPartial({
          admin: walletKey,
          protocol: protocolPda,
          pool: new PublicKey(poolAddressStr),
        })
        .instruction();

      const txid = await sendVersionedTx([ix], tee.provider.connection);
      setSignatures((prev) => ({ ...prev, 2: txid }));
      setSteps((prev) => ({ ...prev, 2: true }));
    } catch (e) {
      console.error("Step 2 Failed:", e);
      alert("TEE Resolution failed. Check console.");
    }
  };

  const handleStep3Calculate = async () => {
    // FIX: Guard clause
    if (!program || !pool || !walletKey) return;
    try {
      const tee = await getAuthTeeProgram();
      const batchAccounts = bets.map((b) => ({
        pubkey: b.publicKey,
        isWritable: true,
        isSigner: false,
      }));

      const ix = await tee.methods
        .batchCalculateWeights()
        .accountsPartial({
          admin: walletKey,
          pool: new PublicKey(poolAddressStr),
        })
        .remainingAccounts(batchAccounts)
        .instruction();

      const txid = await sendVersionedTx([ix], tee.provider.connection);
      setSignatures((prev) => ({ ...prev, 3: txid }));
      setSteps((prev) => ({ ...prev, 3: true }));
    } catch (e) {
      console.error("Step 3 Failed:", e);
    }
  };

  const handleStep4Undelegate = async () => {
    // FIX: Guard clause
    if (!program || !pool || !walletKey) return;
    try {
      const tee = await getAuthTeeProgram();
      const poolKey = new PublicKey(poolAddressStr);
      const batchAccounts = bets.map((b) => ({
        pubkey: b.publicKey,
        isWritable: true,
        isSigner: false,
      }));

      // Part 4a: Flush User Bets
      const ixBets = await tee.methods
        .batchUndelegateBets()
        .accountsPartial({
          payer: walletKey,
          pool: poolKey,
        })
        .remainingAccounts(batchAccounts)
        .instruction();

      const txidA = await sendVersionedTx([ixBets], tee.provider.connection);
      console.log("Sub-step 4a: Bets Flushed", txidA);

      // Part 4b: Flush Pool PDA
      const [protocolPda] = PublicKey.findProgramAddressSync(
        [SEED_PROTOCOL],
        program.programId,
      );
      const ixPool = await tee.methods
        .undelegatePool()
        .accountsPartial({
          admin: walletKey,
          protocol: protocolPda,
          pool: poolKey,
        })
        .instruction();

      const txidB = await sendVersionedTx([ixPool], tee.provider.connection);

      setSignatures((prev) => ({ ...prev, 4: txidB }));
      setSteps((prev) => ({ ...prev, 4: true }));
      await fetchData();
    } catch (e) {
      console.error("Step 4 Failed:", e);
    }
  };

  const handleStep5Finalize = async () => {
    // FIX: Guard clause
    if (!program || !pool || !protocol || !walletKey || !connection) return;
    try {
      const poolKey = new PublicKey(poolAddressStr);
      const [protocolPda] = PublicKey.findProgramAddressSync(
        [SEED_PROTOCOL],
        program.programId,
      );

      // USE: Use spl-token imports to handle the protocol fee account
      const treasuryAta = await getAssociatedTokenAddress(
        pool.tokenMint,
        protocol.treasuryWallet,
      );
      const treasuryInfo = await connection.getAccountInfo(treasuryAta);

      const instructions = [];
      if (!treasuryInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            walletKey,
            treasuryAta,
            protocol.treasuryWallet,
            pool.tokenMint,
          ),
        );
      }

      const ix = await program.methods
        .finalizeWeights() // Fixed: IDL instruction name
        .accountsPartial({
          admin: walletKey,
          protocol: protocolPda,
          pool: poolKey,
          poolVault: PublicKey.findProgramAddressSync(
            [SEED_POOL_VAULT, poolKey.toBuffer()],
            program.programId,
          )[0],
          treasuryTokenAccount: treasuryAta,
          tokenProgram: TOKEN_PROGRAM_ID, // Use imported TOKEN_PROGRAM_ID
        })
        .instruction();

      instructions.push(ix);

      const txid = await sendVersionedTx(instructions, connection);
      setSignatures((prev) => ({ ...prev, 5: txid }));
      setSteps((prev) => ({ ...prev, 5: true }));
      await fetchData();
    } catch (e) {
      console.error("Step 5 Failed:", e);
    }
  };

  const handleAudit = async () => {
    setIsAuditing(true);
    try {
      const tee = await getAuthTeeProgram();
      const logs: string[] = [];
      for (const bet of bets) {
        try {
          const data = await tee.account.userBet.fetch(bet.publicKey);
          logs.push(
            `${bet.account.owner.toBase58().slice(0, 4)}: Pred ${Number(data.prediction.toString()) / 1e6}`,
          );
        } catch {
          logs.push(`${bet.account.owner.toBase58().slice(0, 4)}: 🔒 Secure`);
        }
      }
      setAuditLogs(logs);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAuditing(false);
    }
  };

  // --- RENDER ---

  const groupedParticipants = useMemo(() => {
    const map = new Map<string, GroupedParticipant>();
    const isWeightFinalized = pool?.weightFinalized;
    const vaultBalanceBN = pool?.vaultBalance || new BN(0);
    const feeBps = protocol?.protocolFeeBps || new BN(0);
    const feeAmount = vaultBalanceBN.mul(feeBps).div(new BN(10000));
    const netVaultBN = vaultBalanceBN.sub(feeAmount);

    bets.forEach((b) => {
      const user = b.account.owner.toBase58();
      if (!map.has(user))
        map.set(user, {
          userKey: user,
          totalDeposit: 0,
          betCount: 0,
          predictions: [],
          status: "LIVE",
          hasWon: false,
          totalWeight: new BN(0),
          payout: 0,
          profit: 0,
          displayPayout: "—",
          displayProfit: "—",
          displayStatus: "PENDING",
        });

      const e = map.get(user)!;
      e.totalDeposit += Number(b.account.deposit.toString()) / 1e6;
      e.betCount++;
      const rawPred = Number(b.account.prediction.toString()) / 1e6;

      // If pool is resolved but checking L1, 0 often means "hidden/private shadow"
      // But if we are admin, we see raw values.
      // If owner is Delegation Program, it's inside TEE.
      const isInsideTee = b.account.owner.equals(DELEGATION_PROGRAM_ID);
      let displayPred: string | number = "🔒";

      if (isWeightFinalized) displayPred = rawPred;
      // If we are admin and it's inside TEE, we can't see it without 'Audit' button

      e.predictions.push(displayPred);
      e.totalWeight = e.totalWeight.add(b.account.calculatedWeight);
      if (!b.account.calculatedWeight.isZero()) e.hasWon = true;
      if (isInsideTee) e.displayStatus = "STUCK (TEE)"; // Admin visual aid
    });

    return Array.from(map.values()).map((p) => {
      let payout = 0;
      let profit = 0;
      if (isWeightFinalized && pool && !pool.totalWeight.isZero()) {
        payout =
          Number(
            p.totalWeight.mul(netVaultBN).div(pool.totalWeight).toString(),
          ) / 1e6;
        profit = payout - p.totalDeposit;
      }
      return {
        ...p,
        payout,
        profit,
        displayPayout: isWeightFinalized ? `$${payout.toFixed(2)}` : "—",
        displayProfit: isWeightFinalized
          ? `${profit >= 0 ? "+" : ""}${profit.toFixed(2)}`
          : "—",
        displayStatus:
          p.displayStatus !== "PENDING"
            ? p.displayStatus
            : isWeightFinalized
              ? p.hasWon
                ? "WON"
                : "LOST"
              : "PENDING",
      };
    });
  }, [bets, pool, protocol]);

  if (loading || !pool)
    return (
      <div className="min-h-screen bg-[#0b0f1a] flex justify-center items-center text-white font-bold">
        LOADING DASHBOARD...
      </div>
    );

  const isEnded = Number(pool.endTime.toString()) < Date.now() / 1000;

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-white p-4 md:p-8">
      <div className="max-w-400 mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter">
              Pool: {pool.name}
            </h1>
            <p className="text-gray-500 font-mono text-xs">{poolAddressStr}</p>
            <button
              onClick={() => router.back()}
              className="text-blue-400 text-sm mt-2 hover:underline"
            >
              ← Back to List
            </button>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleAudit}
              disabled={isAuditing}
              className="bg-[#1e243a] border border-gray-700 px-4 py-2 rounded text-xs font-bold hover:bg-gray-800 transition"
            >
              🕵️ Audit
            </button>
            <button
              onClick={syncTeeState}
              disabled={isSyncing}
              className="bg-blue-600/20 border border-blue-500 text-blue-400 px-4 py-2 rounded text-xs font-bold"
            >
              🔄 Sync TEE
            </button>
            <WalletMultiButton />
          </div>
        </header>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* LEFT COLUMN: Config and Controls */}
          <div className="space-y-6">
            <div className="bg-[#161b2c] border border-gray-800 rounded-xl p-6">
              <h3 className="font-bold border-b border-gray-800 pb-3 mb-4 text-sm text-gray-400 uppercase">
                Configuration
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-500 block">Metadata</span>
                  <span className="font-mono">{pool.metadata}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Buffer (Scaled)</span>
                  <span className="font-mono">
                    {pool.maxAccuracyBuffer.toString() / 1_000_000}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">End Time</span>
                  <span className="text-red-500 font-bold">
                    {new Date(
                      Number(pool.endTime.toString()) * 1000,
                    ).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">Protocol Fee</span>
                  <span className="font-mono">
                    {(
                      Number(protocol?.protocolFeeBps.toString() || 0) / 100
                    ).toFixed(2)}
                    %
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">Resolution Price</span>
                  <span
                    className={`font-bold font-mono ${pool.isResolved ? "text-yellow-400" : "text-gray-600"}`}
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

            {isEnded && (
              <div className="bg-[#1c2237] border border-blue-500/30 rounded-xl p-6 shadow-2xl">
                <h3 className="font-black text-blue-400 mb-6 flex items-center gap-2 tracking-tighter uppercase">
                  🛠️ Settlement Console (v0 TX)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      n: 1,
                      lab: "Delegate (L1)",
                      act: handleStep1Delegate,
                      done: steps[1],
                      dis: steps[1],
                    },
                    {
                      n: 2,
                      lab: "Resolve (TEE)",
                      act: handleStep2Resolve,
                      done: steps[2],
                      dis: !steps[1] || steps[2],
                    },
                    {
                      n: 3,
                      lab: "Calculate (TEE)",
                      act: handleStep3Calculate,
                      done: steps[3],
                      dis: !steps[2] || steps[3],
                    },
                    {
                      n: 4,
                      lab: "Flush TEE",
                      act: handleStep4Undelegate,
                      done: steps[4],
                      dis: !steps[3] || steps[4],
                    },
                    {
                      n: 5,
                      lab: "Finalize (L1)",
                      act: handleStep5Finalize,
                      done: steps[5],
                      dis: !steps[4] || steps[5],
                    },
                  ].map((s) => (
                    <button
                      key={s.n}
                      onClick={s.act}
                      disabled={s.dis}
                      className={`w-full py-3 px-4 rounded-lg text-left text-xs font-bold border transition flex justify-between items-center ${
                        s.done
                          ? "bg-green-900/30 border-green-500 text-green-500"
                          : s.dis
                            ? "bg-gray-800 border-gray-700 text-gray-600 opacity-50"
                            : "bg-blue-600/10 border-blue-600/50 text-blue-400 hover:bg-blue-600/20"
                      }`}
                    >
                      <span>
                        {s.n}. {s.lab}
                      </span>
                      <span>{s.done ? "✓" : "→"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {auditLogs.length > 0 && (
              <div className="bg-[#161b2c] border border-gray-800 rounded-xl p-6 max-h-75 overflow-y-auto">
                <h3 className="font-bold mb-4 text-xs text-yellow-500">
                  TEE AUDIT LOGS
                </h3>
                <div className="space-y-1 font-mono text-[10px]">
                  {auditLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-black/20 rounded border border-white/5"
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Participants Table */}
          <div className="bg-[#161b2c] border border-gray-800 rounded-xl overflow-hidden flex flex-col h-full text-white">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center">
              <h3 className="font-bold text-sm uppercase tracking-wider">
                Participants & Outcomes
              </h3>
              <span className="text-[10px] bg-gray-800 px-2 py-1 rounded text-gray-400 font-mono">
                {bets.length} Total Bets
              </span>
            </div>

            <div className="grow flex flex-col w-full overflow-hidden">
              <div className="bg-[#1e243a]/50 text-gray-500 uppercase text-[10px] font-bold grid grid-cols-[1.2fr_1fr_1.5fr_1fr_1fr_1fr] gap-4 px-6 py-4 w-full border-b border-gray-800">
                <div>User & Bets</div>
                <div>Deposit</div>
                <div>Predictions</div>
                <div className="text-center">Status</div>
                <div className="text-right">Payout</div>
                <div className="text-right">P/L</div>
              </div>

              <div className="overflow-y-auto grow divide-y divide-gray-800 w-full">
                {groupedParticipants.map((p, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1.2fr_1fr_1.5fr_1fr_1fr_1fr] gap-4 px-6 py-5 hover:bg-white/2 transition items-center text-xs w-full"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-blue-400 truncate">
                        {p.userKey.slice(0, 4)}...{p.userKey.slice(-4)}
                      </div>
                      <div className="text-[10px] text-gray-500 font-medium uppercase mt-1">
                        {p.betCount} {p.betCount === 1 ? "Bet" : "Bets"}
                      </div>
                    </div>
                    <div className="font-semibold text-gray-200">
                      $
                      {p.totalDeposit.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </div>
                    <div className="min-w-0">
                      <div className="bg-black/20 border border-gray-800 rounded-md p-1.5">
                        <div className="flex flex-nowrap gap-1.5 overflow-x-auto no-scrollbar items-center">
                          {p.predictions.map((pred, idx) => (
                            <span
                              key={idx}
                              className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-mono whitespace-nowrap border ${pred === "🔒" ? "bg-gray-700/30 text-gray-500 border-gray-600" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}`}
                            >
                              {pred}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-bold uppercase text-center w-20 border ${p.displayStatus === "STUCK (TEE)" ? "bg-red-500/10 text-red-500 border-red-500/20 animate-pulse" : !pool?.weightFinalized ? "bg-gray-500/10 text-gray-500 border-gray-500/20" : p.hasWon ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"}`}
                      >
                        {p.displayStatus}
                      </span>
                    </div>
                    <div className="font-bold text-green-500 text-right">
                      {p.displayPayout}
                    </div>
                    <div
                      className={`font-bold text-right ${p.profit >= 0 || !pool?.weightFinalized ? "text-green-500" : "text-red-500"}`}
                    >
                      {p.displayProfit}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
