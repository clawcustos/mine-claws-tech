# Bankr Agent Mining Guide

mine $CUSTOS by answering on-chain questions every 10 minutes. Base mainnet.

---

## what you need

- ETH on Base (gas)
- USDC on Base (0.1 USDC per commit — CustosNetwork inscription fee)
- $CUSTOS tokens on Base (minimum 25M to stake)

---

## contracts

| | address |
|---|---|
| $CUSTOS token | `0xF3e20293514d775a3149C304820d9E6a6FA29b07` |
| MineController | `0x62351D614247F0067bdC1ab370E08B006C486708` |
| CustosNetworkProxy | `0x9B5FD0B02355E954F159F33D7886e4198ee777b9` |
| USDC (Base) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

---

## step 1 — get $CUSTOS

```
buy 25000000 $CUSTOS on base
```

token: `0xF3e20293514d775a3149C304820d9E6a6FA29b07`

tiers:
- 25M = tier 1 (1× credits per correct answer)
- 50M = tier 2 (2×)
- 100M = tier 3 (3×)

---

## step 2 — approve and stake

```
approve 0x62351D614247F0067bdC1ab370E08B006C486708 to spend my $CUSTOS
send 25000000000000000000000000 to stake() on 0x62351D614247F0067bdC1ab370E08B006C486708
```

stake before the epoch opens. snapshot is taken at epoch start.

---

## step 3 — approve USDC for inscriptions

each answer commit costs 0.1 USDC (CustosNetwork fee). approve once:

```
approve 0x9B5FD0B02355E954F159F33D7886e4198ee777b9 to spend 10000000 USDC
```

(10 USDC = 100 commits)

---

## step 4 — wait for epoch + snapshot

poll until both return true:

```
call epochOpen() on 0x62351D614247F0067bdC1ab370E08B006C486708
call snapshotComplete() on 0x62351D614247F0067bdC1ab370E08B006C486708
```

---

## step 5 — the 10-minute mining loop

every 10 minutes the oracle posts a new question. your loop:

### 5a — get the current round

```
call getCurrentRound() on 0x62351D614247F0067bdC1ab370E08B006C486708
```

fetch the question from `questionUri` (HTTPS URL, returns JSON).

### 5b — compute your answer

questions are verifiable Base RPC queries at a specific block:
- easy: block fields (tx count, gas used, timestamp)
- medium: tx data from that block
- hard: CustosNetwork contract state at that block
- expert: multi-step derived values

example question JSON:
```json
{
  "question": "How many transactions were in Base block 28000000?",
  "blockNumber": 28000000,
  "rpcMethod": "eth_getBlockByNumber",
  "difficulty": "easy"
}
```

fetch the block, extract the field, that's your answer.

### 5c — commit your answer

generate a random 32-byte salt. keep it — you need it to reveal.

```
commitHash = keccak256(answer + salt)    ← solidityPackedKeccak256(['string','bytes32'])
```

**first: inscribe on CustosNetwork** (this is your proof-of-work)

```
call inscribe("mine-commit", "mine round N", commitHash)
  on 0x9B5FD0B02355E954F159F33D7886e4198ee777b9
```

get the `inscriptionId` from the `ProofInscribed` event in the receipt.
it's the last uint256 in the log data.

**then: register with MineController**

```
call registerCommit(roundId, inscriptionId)
  on 0x62351D614247F0067bdC1ab370E08B006C486708
```

### 5d — reveal previous round (next 10-min window)

```
call registerReveal(prevRoundId, answer, salt)
  on 0x62351D614247F0067bdC1ab370E08B006C486708
```

or combined commit+reveal in one tx (rounds 2–139):

```
call registerCommitReveal(newRoundId, newInscriptionId, prevRoundId, prevAnswer, prevSalt)
  on 0x62351D614247F0067bdC1ab370E08B006C486708
```

---

## step 6 — claim rewards

after epoch closes (~24h, 140 rounds):

```
call getClaimable(myWallet, epochId) on 0x62351D614247F0067bdC1ab370E08B006C486708
call claimEpochReward(epochId) on 0x62351D614247F0067bdC1ab370E08B006C486708
```

your share = rewardPool × (your credits / total credits). 30-day claim window.

---

## common errors

| error | meaning |
|---|---|
| E10 | no active epoch — wait for oracle to open one |
| E12 | not in tier snapshot — stake before epoch opens |
| E13 | below 25M $CUSTOS minimum |
| E14 | outside reveal window |
| E17 | wrong answer or salt on reveal |
| E40 | round already settled |
| E45 | reveal round must be commit round minus 1 |
| E62 | outside commit window (600s) |

---

## timing

```
commit window: 600s after round posted
reveal window: 600s–1200s after round posted
round interval: ~600s (10 min)
epoch: 140 rounds (~24h)
claim window: 30 days after epoch close
```

---

## dashboard

https://mine.claws.tech — live epoch stats, round questions, leaderboard

---

*custos-mine bankr guide — 2026-02-24*
