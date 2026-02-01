/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/swiv_privacy.json`.
 */
export type SwivPrivacy = {
  "address": "5e4e9pooJgus8NcgdwZitZx1kF2vWZEA7MCTGi7BuKag",
  "metadata": {
    "name": "swivPrivacy",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "batchCalculateWeights",
      "discriminator": [
        120,
        37,
        151,
        131,
        92,
        2,
        221,
        252
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.admin",
                "account": "pool"
              },
              {
                "kind": "account",
                "path": "pool.pool_id",
                "account": "pool"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "batchUndelegateBets",
      "discriminator": [
        147,
        57,
        30,
        144,
        142,
        241,
        140,
        254
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claimReward",
      "discriminator": [
        149,
        95,
        181,
        242,
        94,
        90,
        158,
        162
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "poolVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "userBet",
          "writable": true
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "createBetPermission",
      "discriminator": [
        49,
        47,
        58,
        136,
        189,
        217,
        159,
        167
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "user"
        },
        {
          "name": "userBet"
        },
        {
          "name": "pool"
        },
        {
          "name": "permission",
          "writable": true
        },
        {
          "name": "permissionProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "reqId",
          "type": "string"
        }
      ]
    },
    {
      "name": "createPool",
      "discriminator": [
        233,
        146,
        209,
        142,
        207,
        104,
        64,
        188
      ],
      "accounts": [
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "poolVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "adminTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "poolId",
          "type": "u64"
        },
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "metadata",
          "type": {
            "option": "string"
          }
        },
        {
          "name": "startTime",
          "type": "i64"
        },
        {
          "name": "endTime",
          "type": "i64"
        },
        {
          "name": "maxAccuracyBuffer",
          "type": "u64"
        },
        {
          "name": "convictionBonusBps",
          "type": "u64"
        }
      ]
    },
    {
      "name": "delegateBet",
      "discriminator": [
        55,
        176,
        95,
        121,
        115,
        103,
        253,
        251
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool"
        },
        {
          "name": "bufferUserBet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "userBet"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                68,
                237,
                90,
                161,
                163,
                164,
                94,
                195,
                121,
                3,
                42,
                107,
                180,
                216,
                83,
                176,
                141,
                109,
                23,
                213,
                169,
                2,
                102,
                215,
                1,
                116,
                15,
                26,
                143,
                157,
                110,
                105
              ]
            }
          }
        },
        {
          "name": "delegationRecordUserBet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "userBet"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataUserBet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "userBet"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "userBet",
          "writable": true
        },
        {
          "name": "validator"
        },
        {
          "name": "ownerProgram",
          "address": "5e4e9pooJgus8NcgdwZitZx1kF2vWZEA7MCTGi7BuKag"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "requestId",
          "type": "string"
        }
      ]
    },
    {
      "name": "delegateBetPermission",
      "discriminator": [
        188,
        237,
        22,
        77,
        177,
        127,
        248,
        107
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool"
        },
        {
          "name": "userBet",
          "writable": true
        },
        {
          "name": "permission",
          "writable": true
        },
        {
          "name": "permissionProgram"
        },
        {
          "name": "delegationProgram"
        },
        {
          "name": "delegationBuffer",
          "writable": true
        },
        {
          "name": "delegationRecord",
          "writable": true
        },
        {
          "name": "delegationMetadata",
          "writable": true
        },
        {
          "name": "validator"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "requestId",
          "type": "string"
        }
      ]
    },
    {
      "name": "delegatePool",
      "discriminator": [
        209,
        44,
        8,
        221,
        183,
        173,
        33,
        244
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "bufferPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                68,
                237,
                90,
                161,
                163,
                164,
                94,
                195,
                121,
                3,
                42,
                107,
                180,
                216,
                83,
                176,
                141,
                109,
                23,
                213,
                169,
                2,
                102,
                215,
                1,
                116,
                15,
                26,
                143,
                157,
                110,
                105
              ]
            }
          }
        },
        {
          "name": "delegationRecordPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "validator"
        },
        {
          "name": "ownerProgram",
          "address": "5e4e9pooJgus8NcgdwZitZx1kF2vWZEA7MCTGi7BuKag"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "poolId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "emergencyRefund",
      "discriminator": [
        188,
        73,
        52,
        195,
        137,
        70,
        180,
        147
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "userBet",
          "writable": true
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "poolVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "finalizeWeights",
      "discriminator": [
        211,
        20,
        140,
        3,
        104,
        45,
        91,
        73
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "poolVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "initBet",
      "discriminator": [
        15,
        172,
        254,
        252,
        114,
        198,
        174,
        255
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "poolVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "userBet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  98,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "arg",
                "path": "requestId"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "requestId",
          "type": "string"
        }
      ]
    },
    {
      "name": "initializeProtocol",
      "discriminator": [
        188,
        233,
        252,
        106,
        134,
        146,
        202,
        91
      ],
      "accounts": [
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasuryWallet"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "protocolFeeBps",
          "type": "u64"
        }
      ]
    },
    {
      "name": "placeBet",
      "discriminator": [
        222,
        62,
        67,
        220,
        63,
        166,
        126,
        33
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool"
        },
        {
          "name": "userBet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  98,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "arg",
                "path": "requestId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "prediction",
          "type": "u64"
        },
        {
          "name": "requestId",
          "type": "string"
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer"
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "resolvePool",
      "discriminator": [
        191,
        164,
        190,
        142,
        178,
        198,
        162,
        249
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "finalOutcome",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setPause",
      "discriminator": [
        63,
        32,
        154,
        2,
        56,
        103,
        79,
        45
      ],
      "accounts": [
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "transferAdmin",
      "discriminator": [
        42,
        242,
        66,
        106,
        228,
        10,
        111,
        156
      ],
      "accounts": [
        {
          "name": "currentAdmin",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "undelegatePool",
      "discriminator": [
        75,
        22,
        17,
        43,
        47,
        201,
        22,
        246
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "updateBet",
      "discriminator": [
        198,
        86,
        110,
        99,
        122,
        242,
        136,
        221
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "userBet",
          "writable": true
        },
        {
          "name": "pool"
        }
      ],
      "args": [
        {
          "name": "newPrediction",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateConfig",
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "newTreasury",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "newProtocolFeeBps",
          "type": {
            "option": "u64"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    },
    {
      "name": "protocol",
      "discriminator": [
        45,
        39,
        101,
        43,
        115,
        72,
        131,
        40
      ]
    },
    {
      "name": "userBet",
      "discriminator": [
        180,
        131,
        8,
        241,
        60,
        243,
        46,
        63
      ]
    }
  ],
  "events": [
    {
      "name": "adminTransferred",
      "discriminator": [
        255,
        147,
        182,
        5,
        199,
        217,
        38,
        179
      ]
    },
    {
      "name": "assetConfigUpdated",
      "discriminator": [
        12,
        97,
        64,
        94,
        123,
        177,
        111,
        10
      ]
    },
    {
      "name": "betDelegated",
      "discriminator": [
        223,
        39,
        83,
        220,
        92,
        59,
        154,
        11
      ]
    },
    {
      "name": "betPlaced",
      "discriminator": [
        88,
        88,
        145,
        226,
        126,
        206,
        32,
        0
      ]
    },
    {
      "name": "betRefunded",
      "discriminator": [
        32,
        234,
        173,
        102,
        106,
        4,
        2,
        203
      ]
    },
    {
      "name": "betUndelegated",
      "discriminator": [
        249,
        154,
        196,
        190,
        74,
        153,
        244,
        122
      ]
    },
    {
      "name": "betUpdated",
      "discriminator": [
        184,
        177,
        75,
        30,
        151,
        135,
        38,
        237
      ]
    },
    {
      "name": "configUpdated",
      "discriminator": [
        40,
        241,
        230,
        122,
        11,
        19,
        198,
        194
      ]
    },
    {
      "name": "outcomeCalculated",
      "discriminator": [
        35,
        255,
        97,
        66,
        13,
        30,
        213,
        96
      ]
    },
    {
      "name": "pauseChanged",
      "discriminator": [
        238,
        188,
        213,
        78,
        134,
        209,
        178,
        218
      ]
    },
    {
      "name": "poolCreated",
      "discriminator": [
        202,
        44,
        41,
        88,
        104,
        220,
        157,
        82
      ]
    },
    {
      "name": "poolDelegated",
      "discriminator": [
        151,
        191,
        195,
        52,
        248,
        173,
        72,
        116
      ]
    },
    {
      "name": "poolResolved",
      "discriminator": [
        37,
        148,
        82,
        156,
        128,
        131,
        201,
        171
      ]
    },
    {
      "name": "poolUndelegated",
      "discriminator": [
        223,
        51,
        251,
        176,
        89,
        9,
        173,
        114
      ]
    },
    {
      "name": "protocolInitialized",
      "discriminator": [
        173,
        122,
        168,
        254,
        9,
        118,
        76,
        132
      ]
    },
    {
      "name": "rewardClaimed",
      "discriminator": [
        49,
        28,
        87,
        84,
        158,
        48,
        229,
        175
      ]
    },
    {
      "name": "weightsFinalized",
      "discriminator": [
        104,
        182,
        174,
        242,
        15,
        117,
        69,
        47
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "paused",
      "msg": "Global protocol is paused."
    },
    {
      "code": 6001,
      "name": "unauthorized",
      "msg": "Unauthorized admin action."
    },
    {
      "code": 6002,
      "name": "mathOverflow",
      "msg": "Math operation overflow."
    },
    {
      "code": 6003,
      "name": "insufficientLiquidity",
      "msg": "Insufficient liquidity in pool."
    },
    {
      "code": 6004,
      "name": "alreadyClaimed",
      "msg": "Bet is already claimed."
    },
    {
      "code": 6005,
      "name": "weightsAlreadyFinalized",
      "msg": "Weights have already been finalized."
    },
    {
      "code": 6006,
      "name": "betAlreadyInitialized",
      "msg": "Bet is already initialized."
    },
    {
      "code": 6007,
      "name": "durationTooShort",
      "msg": "Bet duration is too short."
    },
    {
      "code": 6008,
      "name": "invalidAsset",
      "msg": "Invalid asset symbol."
    },
    {
      "code": 6009,
      "name": "assetNotWhitelisted",
      "msg": "Asset is not whitelisted."
    },
    {
      "code": 6010,
      "name": "seedMismatch",
      "msg": "Seeds do not result in a valid address."
    },
    {
      "code": 6011,
      "name": "poolMismatch",
      "msg": "Bet does not match the current pool/asset config"
    },
    {
      "code": 6012,
      "name": "settlementTooEarly",
      "msg": "Admin force-settlement is not yet allowed for this bet."
    },
    {
      "code": 6013,
      "name": "timeoutNotMet",
      "msg": "Emergency refund timeout has not been met."
    },
    {
      "code": 6014,
      "name": "notCalculatedYet",
      "msg": "Bet has not been calculated by the TEE yet."
    },
    {
      "code": 6015,
      "name": "undelegationTooEarly",
      "msg": "You must wait for the pool to end before undelegating to preserve privacy."
    }
  ],
  "types": [
    {
      "name": "adminTransferred",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oldAdmin",
            "type": "pubkey"
          },
          {
            "name": "newAdmin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "assetConfigUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "pythFeed",
            "type": "pubkey"
          },
          {
            "name": "volatilityFactor",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "betDelegated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "betAddress",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "requestId",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "betPlaced",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "betAddress",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "poolIdentifier",
            "type": "string"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "endTimestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "betRefunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "betAddress",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "isEmergency",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "betStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "initialized"
          },
          {
            "name": "active"
          },
          {
            "name": "calculated"
          },
          {
            "name": "claimed"
          }
        ]
      }
    },
    {
      "name": "betUndelegated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "betAddress",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "isBatch",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "betUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "betAddress",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "poolIdentifier",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "configUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "protocolFeeBps",
            "type": {
              "option": "u64"
            }
          }
        ]
      }
    },
    {
      "name": "outcomeCalculated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "betAddress",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "weight",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "pauseChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "isPaused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "pool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "poolId",
            "type": "u64"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": "i64"
          },
          {
            "name": "vaultBalance",
            "type": "u64"
          },
          {
            "name": "maxAccuracyBuffer",
            "type": "u64"
          },
          {
            "name": "convictionBonusBps",
            "type": "u64"
          },
          {
            "name": "metadata",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "resolutionTarget",
            "type": "u64"
          },
          {
            "name": "isResolved",
            "type": "bool"
          },
          {
            "name": "resolutionTs",
            "type": "i64"
          },
          {
            "name": "totalWeight",
            "type": "u128"
          },
          {
            "name": "weightFinalized",
            "type": "bool"
          },
          {
            "name": "totalParticipants",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "poolCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolName",
            "type": "string"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "poolDelegated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolAddress",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "poolResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolName",
            "type": "string"
          },
          {
            "name": "finalOutcome",
            "type": "u64"
          },
          {
            "name": "resolutionTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "poolUndelegated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolAddress",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "protocol",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasuryWallet",
            "type": "pubkey"
          },
          {
            "name": "protocolFeeBps",
            "type": "u64"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "totalUsers",
            "type": "u64"
          },
          {
            "name": "batchSettleWaitDuration",
            "type": "i64"
          },
          {
            "name": "totalPools",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "protocolInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "feeWallet",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "rewardClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "betAddress",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "userBet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "deposit",
            "type": "u64"
          },
          {
            "name": "endTimestamp",
            "type": "i64"
          },
          {
            "name": "creationTs",
            "type": "i64"
          },
          {
            "name": "updateCount",
            "type": "u32"
          },
          {
            "name": "calculatedWeight",
            "type": "u128"
          },
          {
            "name": "isWeightAdded",
            "type": "bool"
          },
          {
            "name": "prediction",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "betStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "weightsFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolName",
            "type": "string"
          },
          {
            "name": "totalWeight",
            "type": "u128"
          },
          {
            "name": "feeDeducted",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
