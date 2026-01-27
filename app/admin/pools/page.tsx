"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useProgram } from "../../../hooks/useProgram";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { IdlAccounts } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { SwivPrivacy } from "../../../idl/swiv_privacy";
import { SEED_GLOBAL_CONFIG } from "../../../utils/contants"; // Import Seed

const formatDate = (unixTs: number) => new Date(unixTs * 1000).toLocaleString();

type Pool = IdlAccounts<SwivPrivacy>["pool"];

export default function AdminPoolsList() {
  const { program, connection } = useProgram();
  const { publicKey } = useWallet(); // Get connected wallet

  const [pools, setPools] = useState<{ publicKey: PublicKey; account: Pool }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [poolsNeedingAction, setPoolsNeedingAction] = useState<number>(0);

  // --- NEW: Security State ---
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  useEffect(() => {
    if (!program || !connection || !publicKey) {
      setIsCheckingAuth(false);
      return;
    }

    const fetchData = async () => {
      try {
        // 1. SECURITY CHECK: Am I the Admin?
        const [configPda] = PublicKey.findProgramAddressSync(
          [SEED_GLOBAL_CONFIG],
          program.programId,
        );
        const configAccount =
          await program.account.globalConfig.fetch(configPda);

        const adminKey = configAccount.admin;
        if (adminKey.equals(publicKey)) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          setLoading(false); // Stop loading if not admin
          setIsCheckingAuth(false);
          return; // STOP HERE if not admin
        }
        setIsCheckingAuth(false);

        // 2. Fetch Pools (Only if Admin)
        const discriminator = await program.coder.accounts.memcmp("pool");
        const rawAccounts = await connection.getProgramAccounts(
          program.programId,
          {
            filters: [
              { memcmp: { offset: 0, bytes: discriminator.bytes as string } },
            ],
          },
        );

        const decodedPools: { publicKey: PublicKey; account: Pool }[] = [];

        for (const raw of rawAccounts) {
          try {
            const account = program.coder.accounts.decode(
              "pool",
              raw.account.data,
            );
            decodedPools.push({ publicKey: raw.pubkey, account: account });
          } catch {
            console.warn(`Skipping corrupt pool: ${raw.pubkey.toBase58()}`);
          }
        }

        const sorted = decodedPools.sort(
          (a, b) =>
            b.account.startTime.toNumber() - a.account.startTime.toNumber(),
        );

        setPools(sorted);

        const now = Math.floor(Date.now() / 1000);
        const actionCount = sorted.filter(
          (p) => p.account.endTime.toNumber() < now && !p.account.isResolved,
        ).length;
        setPoolsNeedingAction(actionCount);
      } catch (error: unknown) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [program, connection, publicKey]);

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Verifying Admin Privileges...
      </div>
    );
  }

  // --- NEW: BLOCK ACCESS IF NOT ADMIN ---
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8 flex flex-col items-center justify-center space-y-6">
        <div className="bg-red-900/30 border border-red-500 p-8 rounded-lg max-w-md text-center">
          <h1 className="text-3xl font-bold text-red-500 mb-4">
            ⛔ Access Denied
          </h1>
          <p className="text-gray-300 mb-6">
            You are not authorized to view this page. This area is restricted to
            the Protocol Administrator.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/"
              className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded"
            >
              Go Home
            </Link>
            <WalletMultiButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="flex justify-between items-center mb-10 border-b border-gray-700 pb-4">
        <div>
          <h1 className="text-2xl font-bold">Admin: All Pools</h1>
          <Link
            href="/admin"
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            &larr; Back to Dashboard
          </Link>
        </div>
        <WalletMultiButton />
      </header>

      <main className="max-w-6xl mx-auto space-y-8">
        {poolsNeedingAction > 0 && (
          <div className="bg-yellow-900/40 border border-yellow-600 p-4 rounded-lg flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔔</span>
              <div>
                <h3 className="font-bold text-yellow-100">Action Required</h3>
                <p className="text-yellow-200 text-sm">
                  {poolsNeedingAction} pool(s) have ended and need settlement.
                </p>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-400">Loading...</div>
        ) : pools.length === 0 ? (
          <div className="text-center text-gray-500 py-10 bg-gray-800 rounded">
            No pools found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pools.map((item) => {
              const account = item.account;
              const now = Date.now() / 1000;
              const isEnded = account.endTime.toNumber() < now;
              const isResolved = account.isResolved;

              let statusLabel = "ACTIVE";
              let statusColor = "bg-blue-900 text-blue-300";

              if (isResolved) {
                statusLabel = "RESOLVED";
                statusColor = "bg-green-900 text-green-300";
              } else if (isEnded) {
                statusLabel = "ENDED (Action Needed)";
                statusColor =
                  "bg-yellow-600 text-white shadow-lg shadow-yellow-900/50";
              }

              return (
                <Link
                  key={item.publicKey.toBase58()}
                  href={`/admin/pools/${account.name}`}
                  className="block group"
                >
                  <div
                    className={`bg-gray-800 border ${isEnded && !isResolved ? "border-yellow-500" : "border-gray-700"} p-6 rounded-lg hover:border-blue-500 transition shadow-lg h-full flex flex-col`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-xl font-bold truncate text-white group-hover:text-blue-400">
                        {account.name}
                      </h3>
                      <span
                        className={`px-2 py-1 text-xs rounded font-bold ${statusColor}`}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    <p className="text-gray-400 text-sm mb-4 line-clamp-2 h-10">
                      {account.metadata || "No description provided."}
                    </p>

                    <div className="mt-auto space-y-2 text-sm text-gray-500">
                      <div className="flex justify-between">
                        <span>End:</span>
                        <span
                          className={isEnded ? "text-red-400" : "text-gray-300"}
                        >
                          {formatDate(account.endTime.toNumber())}
                        </span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-gray-700">
                        <span>Volume:</span>
                        <span className="text-white font-mono">
                          {(
                            account.vaultBalance.toNumber() / 1_000_000
                          ).toLocaleString()}{" "}
                          USDC
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
