"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useProgram } from "../../../hooks/useProgram";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { SEED_PROTOCOL } from "../../../utils/contants";
import { PoolWithAddress } from "../../../types/swiv";
import { BN } from "@coral-xyz/anchor";

const formatDate = (unixTs: number) => new Date(unixTs * 1000).toLocaleString();

export default function AdminPoolsList() {
  const { program, connection } = useProgram();
  const { publicKey } = useWallet();

  const [pools, setPools] = useState<PoolWithAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [poolsNeedingAction, setPoolsNeedingAction] = useState<number>(0);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  useEffect(() => {
    if (!program || !connection || !publicKey) {
      setIsCheckingAuth(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [protocolPda] = PublicKey.findProgramAddressSync(
          [SEED_PROTOCOL],
          program.programId,
        );
        const protocolAccount =
          await program.account.protocol.fetch(protocolPda);

        if (protocolAccount.admin.equals(publicKey)) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          setLoading(false);
          setIsCheckingAuth(false);
          return;
        }
        setIsCheckingAuth(false);

        const discriminator = await program.coder.accounts.memcmp("pool");
        const rawAccounts = await connection.getProgramAccounts(
          program.programId,
          {
            filters: [
              { memcmp: { offset: 0, bytes: discriminator.bytes as string } },
            ],
          },
        );

        const decodedPools: PoolWithAddress[] = [];
        for (const raw of rawAccounts) {
          try {
            const account = program.coder.accounts.decode(
              "pool",
              raw.account.data,
            );
            decodedPools.push({ publicKey: raw.pubkey, account: account });
          } catch {
            /* skip */
          }
        }

        // --- SAFE SORTING ---
        const sorted = decodedPools.sort((a, b) => {
          if (b.account.startTime.gt(a.account.startTime)) return 1;
          if (a.account.startTime.gt(b.account.startTime)) return -1;
          return 0;
        });

        setPools(sorted);

        const nowBN = new BN(Math.floor(Date.now() / 1000));
        const actionCount = sorted.filter(
          (p) => p.account.endTime.lt(nowBN) && !p.account.weightFinalized,
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

  if (isCheckingAuth)
    return (
      <div className="min-h-screen bg-gray-900 text-white flex justify-center items-center">
        Verifying Admin...
      </div>
    );

  if (!isAdmin)
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8 flex flex-col items-center justify-center">
        <h1 className="text-3xl text-red-500 mb-4">Access Denied</h1>
        <Link href="/" className="bg-gray-700 px-4 py-2 rounded">
          Go Home
        </Link>
      </div>
    );

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
          <div className="bg-yellow-900/40 border border-yellow-600 p-4 rounded-lg flex items-center justify-between">
            <div>
              <span className="text-2xl mr-2">🔔</span>
              {poolsNeedingAction} pool(s) need settlement.
            </div>
          </div>
        )}

        {loading ? (
          <div>Loading...</div>
        ) : pools.length === 0 ? (
          <div>No pools found.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pools.map((item) => {
              const account = item.account;

              // SAFE DISPLAY CONVERSION
              const now = Date.now() / 1000;
              // Use safe conversion for endTime (seconds usually fit, but good practice)
              const endTimeNum = Number(account.endTime.toString());
              const isEnded = endTimeNum < now;

              const isResolved = account.isResolved;
              const isFinalized = account.weightFinalized;

              const statusLabel = isFinalized
                ? "SETTLED"
                : isResolved
                  ? "RESOLVED (TEE)"
                  : isEnded
                    ? "ENDED"
                    : "ACTIVE";
              const statusColor = isFinalized
                ? "bg-green-900 text-green-300"
                : isResolved
                  ? "bg-purple-900 text-purple-300"
                  : isEnded
                    ? "bg-yellow-600 text-white"
                    : "bg-blue-900 text-blue-300";

              return (
                <Link
                  key={item.publicKey.toBase58()}
                  href={`/admin/pools/${item.publicKey.toBase58()}`}
                  className="block group"
                >
                  <div
                    className={`bg-gray-800 border p-6 rounded-lg hover:border-blue-500 transition shadow-lg h-full flex flex-col ${isEnded && !isFinalized ? "border-yellow-500" : "border-gray-700"}`}
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
                    <div className="mt-auto space-y-2 text-sm text-gray-500">
                      <div className="flex justify-between">
                        <span>End:</span>
                        <span
                          className={isEnded ? "text-red-400" : "text-gray-300"}
                        >
                          {endTimeNum > 0 ? formatDate(endTimeNum) : "Invalid"}
                        </span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-gray-700">
                        <span>Volume:</span>
                        {/* FIX: Safe Number Conversion */}
                        <span className="text-white font-mono">
                          {(
                            Number(account.vaultBalance.toString()) / 1e6
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
