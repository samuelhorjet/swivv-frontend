"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  unpackAccount,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { useProgram } from "../../hooks/useProgram";
import {
  SEED_PROTOCOL,
  SEED_POOL,
  SEED_POOL_VAULT,
} from "../../utils/contants";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { ProtocolAccount } from "../../types/swiv";

type TabType = "Create" | "Config" | "Management" | "Treasury";

export default function AdminPage() {
  const { program, wallet, connection } = useProgram();

  // UI State
  const [activeTab, setActiveTab] = useState<TabType>("Create");
  const [loading, setLoading] = useState(false);
  const [protocolData, setProtocolData] = useState<ProtocolAccount | null>(
    null,
  );
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [treasuryBalances, setTreasuryBalances] = useState<
    { mint: string; balance: number }[]
  >([]);

  // Form States
  const [poolName, setPoolName] = useState("");
  const [mintAddress, setMintAddress] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(300);
  const [startDelay, setStartDelay] = useState(0);
  const [accuracyBuffer, setAccuracyBuffer] = useState(500);
  const [metadata, setMetadata] = useState("BTC/USDC");
  const [newFee, setNewFee] = useState("");
  const [newTreasury, setNewTreasury] = useState("");
  const [newAdmin, setNewAdmin] = useState("");

  // --- VERSIONED TX HELPER ---
  const sendV0Tx = async (instructions: TransactionInstruction[]) => {
    if (!wallet || !connection) return;
    try {
      setLoading(true);
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      const signed = await wallet.signTransaction(transaction);
      const txid = await connection.sendRawTransaction(signed.serialize());

      await connection.confirmTransaction({
        signature: txid,
        blockhash,
        lastValidBlockHeight,
      });
      alert("Transaction Successful!");
      window.location.reload();
    } catch (e: unknown) {
      console.error(e);
      alert("Error: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!program || !wallet || !connection) return;
    const loadData = async () => {
      try {
        const [protocolPda] = PublicKey.findProgramAddressSync(
          [SEED_PROTOCOL],
          program.programId,
        );
        
        // --- CHECK IF PROTOCOL EXISTS ---
        const protocolInfo = await connection.getAccountInfo(protocolPda);
        
        if (!protocolInfo) {
          // Protocol not found: Let them in so they can click "Initialize"
          setIsInitialized(false);
          setIsAdmin(true); 
          return;
        }

        const account = (await program.account.protocol.fetch(protocolPda)) as ProtocolAccount;
        setProtocolData(account);
        setIsInitialized(true);
        
        // Access Check: Compare connected wallet to protocol admin
        const connectedWalletStr = wallet.publicKey.toBase58();
        const adminWalletStr = account.admin.toBase58();
        setIsAdmin(connectedWalletStr === adminWalletStr);

        // Fetch Treasury Balances
        const tokenAccounts = await connection.getTokenAccountsByOwner(
          account.treasuryWallet,
          { programId: TOKEN_PROGRAM_ID },
        );
        const balances = tokenAccounts.value.map((ta) => {
          const data = unpackAccount(ta.pubkey, ta.account);
          return { mint: data.mint.toBase58(), balance: Number(data.amount) / 1e6 };
        });
        setTreasuryBalances(balances);
      } catch (error: unknown) {
        console.error("Fetch error:", error);
        setIsInitialized(false);
        setIsAdmin(false);
      }
    };
    loadData();
  }, [program, wallet, connection]);

  // --- RENDERING ACCESS STATES ---

  if (!wallet)
    return (
      <div className="min-h-screen bg-[#0b0f1a] flex flex-col justify-center items-center text-white">
        <p className="mb-4 text-gray-400">Please connect your wallet to access Admin</p>
        <WalletMultiButton />
      </div>
    );

  // Allow access if protocol isn't initialized yet
  if (isAdmin === false && isInitialized === true) {
    return (
      <div className="min-h-screen bg-[#0b0f1a] flex flex-col justify-center items-center text-white p-4">
        <div className="bg-[#161b2c] p-10 rounded-xl border border-red-900/50 text-center shadow-2xl max-w-lg">
            <h1 className="text-4xl font-black text-red-600 mb-2 uppercase">Access Denied</h1>
            <p className="text-gray-400 mb-6">This wallet is not authorized to manage this protocol.</p>
            <WalletMultiButton />
        </div>
      </div>
    );
  }

  // --- SHOW INITIALIZE SETUP FORM IF EMPTY ---
  if (isInitialized === false) {
    return (
      <div className="min-h-screen bg-[#0b0f1a] flex flex-col justify-center items-center text-white p-6">
        <div className="bg-[#161b2c] p-8 md:p-12 rounded-2xl border border-blue-900/30 shadow-2xl max-w-lg w-full">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-black mb-2 uppercase tracking-tighter text-blue-400">Protocol Setup</h2>
            <p className="text-gray-500 text-sm">No protocol state found for this Program ID. Initialize it now.</p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="text-[10px] text-gray-500 uppercase font-bold mb-2 block">Initial Admin & Payer</label>
              <div className="bg-[#0b0f1a] p-3 rounded border border-gray-800 text-xs font-mono text-blue-300">
                {wallet.publicKey.toBase58()}
              </div>
            </div>

            <div>
              <label className="text-[10px] text-gray-500 uppercase font-bold mb-2 block">Treasury Wallet Address</label>
              <input 
                type="text" 
                className="w-full bg-[#1e243a] p-3 rounded border border-gray-700 text-sm font-mono placeholder:text-gray-600 focus:border-blue-500 outline-none transition"
                placeholder="Paste Treasury Pubkey"
                value={newTreasury || wallet.publicKey.toBase58()} 
                onChange={(e) => setNewTreasury(e.target.value)}
              />
            </div>

            <div>
              <label className="text-[10px] text-gray-500 uppercase font-bold mb-2 block">Protocol Fee (in Basis Points)</label>
              <input 
                type="number" 
                className="w-full bg-[#1e243a] p-3 rounded border border-gray-700 text-sm placeholder:text-gray-600 focus:border-blue-500 outline-none transition"
                placeholder="e.g. 500 for 5%"
                value={newFee || "500"} 
                onChange={(e) => setNewFee(e.target.value)}
              />
              <p className="text-[10px] text-gray-600 mt-1 italic">100 bps = 1%</p>
            </div>

            <button 
              onClick={async () => {
                if (!program || !wallet) return;
                try {
                  setLoading(true);
                  const [protocolPda] = PublicKey.findProgramAddressSync([SEED_PROTOCOL], program.programId);
                  
                  // Use inputs from the form instead of hardcoded values
                  const treasuryPubkey = newTreasury ? new PublicKey(newTreasury) : wallet.publicKey;
                  const feeBps = new anchor.BN(newFee || 500);

                  const ix = await program.methods
                    .initializeProtocol(feeBps) 
                    .accountsPartial({
                      protocol: protocolPda,
                      admin: wallet.publicKey,
                      treasuryWallet: treasuryPubkey,
                      systemProgram: SystemProgram.programId,
                    })
                    .instruction();

                  await sendV0Tx([ix]);
                } catch (e: unknown) {
                  alert("Init Failed: " + (e instanceof Error ? e.message : "Check console"));
                } finally {
                  setLoading(false);
                }
              }} 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 text-white py-4 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-900/20"
            >
              {loading ? "Initializing..." : "🚀 Launch Protocol"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isAdmin === null) return <div className="min-h-screen bg-[#0b0f1a] flex justify-center items-center text-white font-mono uppercase tracking-widest animate-pulse">Checking Permissions...</div>;

  // --- ACTIONS ---

  const handleCreatePool = async () => {
    if (!program || !wallet || !protocolData || !connection) return;

    try {
      setLoading(true);
      const startTime = Math.floor(Date.now() / 1000) + Number(startDelay);
      const endTime = startTime + Number(durationSeconds);
      const poolIdBuffer = protocolData.totalPools.toArrayLike(Buffer, "le", 8);
      const [poolPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL, wallet.publicKey.toBuffer(), poolIdBuffer],
        program.programId,
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL_VAULT, poolPda.toBuffer()],
        program.programId,
      );
      const [protocolPda] = PublicKey.findProgramAddressSync(
        [SEED_PROTOCOL],
        program.programId,
      );

      const mintPubkey = new PublicKey(mintAddress);
      const adminTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        wallet.publicKey,
      );

      const ixs: TransactionInstruction[] = [];

      // --- CHECK AND ADD ATA INITIALIZATION IF NEEDED ---
      const ataInfo = await connection.getAccountInfo(adminTokenAccount);
      if (!ataInfo) {
        // Import createAssociatedTokenAccountInstruction from @solana/spl-token
        const { createAssociatedTokenAccountInstruction } =
          await import("@solana/spl-token");
        ixs.push(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey, // payer
            adminTokenAccount, // ata address
            wallet.publicKey, // owner
            mintPubkey, // mint
          ),
        );
      }

      // FIX: SCALE ACCURACY BUFFER
      // The contract does math in base units (decimals). 
      // If result is 150*1e6 and bet is 50*1e6, diff is 100*1e6.
      // We need buffer to be 500*1e6 to cover it.
      const scaledBuffer = new anchor.BN(accuracyBuffer).mul(new anchor.BN(1_000_000));

      const createPoolIx = await program.methods
        .createPool(
          protocolData.totalPools,
          poolName,
          metadata,
          new anchor.BN(startTime),
          new anchor.BN(endTime),
          scaledBuffer, // <--- CHANGED HERE
          new anchor.BN(1000),
        )
        .accountsPartial({
          protocol: protocolPda,
          pool: poolPda,
          poolVault: vaultPda,
          tokenMint: mintPubkey,
          admin: wallet.publicKey,
          adminTokenAccount: adminTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      ixs.push(createPoolIx);

      // Send as a single Versioned Transaction
      await sendV0Tx(ixs);
    } catch (e: unknown) {
      console.error(e);
      alert("Error: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateConfig = async () => {
    if (!program || !wallet) return;
    const [protocolPda] = PublicKey.findProgramAddressSync(
      [SEED_PROTOCOL],
      program.programId,
    );
    const ix = await program.methods
      .updateConfig(
        newTreasury ? new PublicKey(newTreasury) : null,
        newFee ? new anchor.BN(newFee) : null,
      )
      .accountsPartial({
        admin: wallet.publicKey,
        protocol: protocolPda,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await sendV0Tx([ix]);
  };

  const handleTogglePause = async () => {
    if (!program || !wallet || !protocolData) return;
    const [protocolPda] = PublicKey.findProgramAddressSync(
      [SEED_PROTOCOL],
      program.programId,
    );

    // Toggle logic: If currently paused (true), send false. If not paused (false), send true.
    const newPauseState = !protocolData.paused;

    const ix = await program.methods
      .setPause(newPauseState)
      .accountsPartial({ admin: wallet.publicKey, protocol: protocolPda })
      .instruction();
    await sendV0Tx([ix]);
  };

  const handleTransfer = async () => {
    if (!program || !wallet || !newAdmin) return;
    const [protocolPda] = PublicKey.findProgramAddressSync(
      [SEED_PROTOCOL],
      program.programId,
    );
    const ix = await program.methods
      .transferAdmin(new PublicKey(newAdmin))
      .accountsPartial({
        currentAdmin: wallet.publicKey,
        protocol: protocolPda,
      })
      .instruction();
    await sendV0Tx([ix]);
  };

  // --- RENDERING ACCESS STATES ---

  if (!wallet)
    return (
      <div className="min-h-screen bg-[#0b0f1a] flex flex-col justify-center items-center text-white">
        <p className="mb-4 text-gray-400">
          Please connect your wallet to access Admin
        </p>
        <WalletMultiButton />
      </div>
    );

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-[#0b0f1a] flex flex-col justify-center items-center text-white">
        <div className="bg-[#161b2c] p-10 rounded-xl border border-red-900/50 text-center shadow-2xl">
          <h1 className="text-4xl font-black text-red-600 mb-2">
            ACCESS DENIED
          </h1>
          <p className="text-gray-400 max-w-sm mx-auto">
            This wallet ({wallet.publicKey.toBase58().slice(0, 6)}...) is not
            authorized to access the protocol management console.
          </p>
          <div className="mt-8">
            <WalletMultiButton />
          </div>
        </div>
      </div>
    );
  }

  if (isAdmin === null)
    return (
      <div className="min-h-screen bg-[#0b0f1a] flex justify-center items-center text-white font-mono uppercase tracking-widest animate-pulse">
        Checking Permissions...
      </div>
    );

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-white p-8 font-sans">
      <header className="max-w-5xl mx-auto flex justify-between items-center mb-12">
        <h1 className="text-2xl font-black tracking-tight">
          Swiv Privacy: Admin
        </h1>
        <div className="flex gap-4">
          <Link
            href="/admin/pools"
            className="bg-[#1e243a] hover:bg-gray-800 px-4 py-2 rounded text-xs font-bold transition"
          >
            View All Pools
          </Link>
          <WalletMultiButton />
        </div>
      </header>

      <main className="max-w-4xl mx-auto">
        {/* TAB NAVIGATION */}
        <div className="flex border-b border-gray-800 mb-8 gap-8">
          {["Create", "Config", "Management", "Treasury"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as TabType)}
              className={`pb-4 text-sm font-bold transition-all ${activeTab === tab ? "border-b-2 border-blue-500 text-blue-400" : "text-gray-500 hover:text-white"}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="bg-[#161b2c] border border-gray-800 rounded-xl p-8 shadow-2xl">
          {/* CREATE TAB */}
          {activeTab === "Create" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold mb-6">Create Pool</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <label className="text-[10px] text-gray-500 uppercase font-bold">
                    Pool Name
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[#1e243a] p-3 rounded border border-gray-700 text-sm"
                    placeholder="BTC Moonshot"
                    value={poolName}
                    onChange={(e) => setPoolName(e.target.value)}
                  />
                  <label className="text-[10px] text-gray-500 uppercase font-bold">
                    Metadata
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[#1e243a] p-3 rounded border border-gray-700 text-sm"
                    value={metadata}
                    onChange={(e) => setMetadata(e.target.value)}
                  />
                  <label className="text-[10px] text-gray-500 uppercase font-bold">
                    Mint Address
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[#1e243a] p-3 rounded border border-gray-700 text-sm font-mono"
                    placeholder="USDC Mint"
                    value={mintAddress}
                    onChange={(e) => setMintAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-500 uppercase font-bold">
                        Delay (s)
                      </label>
                      <input
                        type="number"
                        className="w-full bg-[#1e243a] p-3 rounded border border-gray-700 text-sm"
                        value={startDelay}
                        onChange={(e) => setStartDelay(Number(e.target.value))}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-500 uppercase font-bold">
                        Duration (s)
                      </label>
                      <input
                        type="number"
                        className="w-full bg-[#1e243a] p-3 rounded border border-gray-700 text-sm"
                        value={durationSeconds}
                        onChange={(e) =>
                          setDurationSeconds(Number(e.target.value))
                        }
                      />
                    </div>
                  </div>
                  <label className="text-[10px] text-gray-500 uppercase font-bold">
                    Accuracy Buffer (Absolute Value)
                  </label>
                  <input
                    type="number"
                    className="w-full bg-[#1e243a] p-3 rounded border border-gray-700 text-sm"
                    value={accuracyBuffer}
                    onChange={(e) => setAccuracyBuffer(Number(e.target.value))}
                  />
                  <p className="text-[9px] text-gray-500">
                    Example: If target is 150 and you want 50-250 to win, set buffer to 100. (It will be scaled automatically).
                  </p>
                  <button
                    onClick={handleCreatePool}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-lg font-black text-sm uppercase transition-all mt-4"
                  >
                    Create Pool
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CONFIG TAB */}
          {activeTab === "Config" && (
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-[#0b0f1a] p-4 rounded border border-gray-800">
                  <span className="text-[10px] text-gray-500 uppercase font-bold">
                    Current Fee:
                  </span>
                  <p className="text-white font-bold">
                    {protocolData?.protocolFeeBps.toString()} bps (
                    {(Number(protocolData?.protocolFeeBps || 0) / 100).toFixed(
                      1,
                    )}
                    %)
                  </p>
                </div>
                <div className="bg-[#0b0f1a] p-4 rounded border border-gray-800">
                  <span className="text-[10px] text-gray-500 uppercase font-bold">
                    Current Treasury:
                  </span>
                  <p className="text-white font-mono text-[10px] truncate">
                    {protocolData?.treasuryWallet.toBase58()}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold">
                    New Protocol Fee (bps)
                  </label>
                  <input
                    type="number"
                    className="w-full bg-[#1e243a] p-3 rounded border border-gray-700 text-sm"
                    placeholder="e.g. 500"
                    value={newFee}
                    onChange={(e) => setNewFee(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold">
                    New Treasury Address
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[#1e243a] p-3 rounded border border-gray-700 text-sm font-mono"
                    placeholder="Pubkey"
                    value={newTreasury}
                    onChange={(e) => setNewTreasury(e.target.value)}
                  />
                </div>
              </div>
              <button
                onClick={handleUpdateConfig}
                className="bg-green-600 hover:bg-green-500 px-6 py-3 rounded font-bold text-sm"
              >
                Update Config
              </button>
            </div>
          )}

          {/* MANAGEMENT TAB */}
          {activeTab === "Management" && (
            <div className="space-y-12">
              <div>
                <h3 className="text-sm font-bold mb-4 uppercase tracking-widest text-gray-500">
                  Emergency Controls
                </h3>
                <div className="bg-[#0b0f1a] p-6 rounded border border-gray-800 flex justify-between items-center">
                  <div>
                    <p className="font-bold flex items-center gap-2">
                      Protocol State:{" "}
                      {protocolData?.paused ? (
                        <span className="text-red-500 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>{" "}
                          PAUSED
                        </span>
                      ) : (
                        <span className="text-green-500 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span>{" "}
                          ACTIVE
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {protocolData?.paused
                        ? "Protocol is currently locked. Unpause to resume bets."
                        : "Pausing stops all new bets."}
                    </p>
                  </div>
                  <button
                    onClick={handleTogglePause}
                    disabled={loading}
                    className={`px-6 py-2 rounded font-bold text-sm transition-all ${protocolData?.paused ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"}`}
                  >
                    {protocolData?.paused
                      ? "Unpause Protocol"
                      : "Pause Protocol"}
                  </button>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold mb-4 text-red-500 uppercase tracking-widest">
                  Danger Zone: Transfer Ownership
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 bg-[#1e243a] p-3 rounded border border-gray-700 text-sm font-mono"
                    placeholder="New Admin Pubkey"
                    value={newAdmin}
                    onChange={(e) => setNewAdmin(e.target.value)}
                  />
                  <button
                    onClick={handleTransfer}
                    className="bg-red-600 px-6 py-2 rounded font-bold text-sm"
                  >
                    Transfer
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TREASURY TAB */}
          {activeTab === "Treasury" && (
            <div className="space-y-6 text-center">
              <h2 className="text-xl font-bold mb-8">Treasury Vault Assets</h2>
              <div className="grid grid-cols-2 gap-4">
                {treasuryBalances.map((b, idx) => (
                  <div
                    key={idx}
                    className="bg-[#0b0f1a] p-8 rounded-xl border border-gray-800 transition hover:border-gray-600"
                  >
                    <p className="text-[10px] text-gray-500 font-mono mb-2">
                      Balance (Mint: {b.mint.slice(0, 4)}...{b.mint.slice(-4)})
                    </p>
                    <p className="text-3xl font-black text-green-500 mb-1">
                      {b.balance.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                      Tokens
                    </p>
                  </div>
                ))}
                {treasuryBalances.length === 0 && (
                  <div className="col-span-2 text-gray-600 py-10">
                    No assets found in treasury
                  </div>
                )}
              </div>
              <p className="text-[10px] text-gray-600 mt-8 italic text-center">
                These are all tokens currently held by the Treasury Wallet.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}