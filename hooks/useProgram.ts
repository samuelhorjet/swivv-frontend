import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { useMemo } from "react";
import { IDL, SwivPrivacy } from "../utils/contants";

export const useProgram = () => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const program = useMemo(() => {
    if (!wallet) return null;

    const provider = new AnchorProvider(connection, wallet, {
      preflightCommitment: "processed",
    });

    return new Program<SwivPrivacy>(IDL, provider);
    
  }, [connection, wallet]);

  return { program, wallet, connection };
};