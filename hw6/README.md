# 🛡️ Homework Assignment: Build a Privacy Preserving Asset Transfer Mechanism with Noir on Ethereum

---

## 📏 Overview

In this assignment, you’ll build a **privacy preserving asset transfer mechanism**, where users can deposit and withdraw ETH anonymously using smart contracts and **zero-knowledge proofs**.

A way to have privacy on-chain is to pool all money in one contract. Instead of party A sending money directly to party B, party A sends the money to a pool where party B can later fetch the money at will.

In this homework we are going to create a simple example of that. When a party A wants to deposit to the contract, it will commit to a secret id together with some random nonce and put it in a Merkle tree as a leaf. Later, party B can prove that it knows a leaf with that secret together with the proper opening path, but it will not disclose which leaf,thus breaking the link between the sender and receiver (if the contract is being used enough).

To prevent double spending, we ask party B to reveal a unique identifier ("nullifier") as part of the proof. This allows the smart contract to keep track of utilized nullifiers. If the same nullifier appears again, the contract will reject the withdrawal, preventing double spending without compromising privacy. This is similar to the Sanders Ta-Shma protocol seen in class, as part of the Zerocash protcol.

For this homework we will restrict all deposits and withdrawals to 0.1 ETH.

---

## 💡 Background

You have already implemented an off-chain Merkle tree in **Lab 2** with noir and solidity to prove that a party has a credit score larger than a threshold amount. In this assignment, we will use the same tools to manage ETH deposits and withdrawals privately.

---

## 🧱 Smart Contract Explanation

We provide you with a smart contract (named `Whirlwind`) that manages the deposit and withdrawal operations on-chain. The key responsibilities of this contract include:

- **State Management:**  
  - Storing the current Merkle tree root.
  - Tracking the number of deposits via an internal index.
  - Maintaining a mapping of used nullifiers to prevent double spending.

- **Verification:**  
  - The contract uses verifier contracts (generated from your Noir circuits) to automatically check the validity of both deposit and withdrawal proofs.
  
- **Fund Handling and Events:**  
  - Deposits are accepted (exactly 0.1 ETH per deposit) and update the Merkle tree root.
  - Withdrawals transfer 0.1 ETH to the caller if the provided proof is valid and the nullifier hasn’t been used.
  - It emits events to help track deposits and withdrawals.

Your job is to create the deposit and withdraw circuits in Noir, compile them to produce their respective verifier contracts (e.g., `DepositVerifier.sol` and `WithdrawVerifier.sol`), and then feed these verifier contract addresses to the constructor of the provided smart contract during deployment.

Below is the provided contract:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

contract Whirlwind {
    address public depositVerifier;
    address public withdrawVerifier;

    // Deposit index to track the number of deposits
    uint256 public depositIndex;
    // Maximum allowed deposits computed from the Merkle tree depth
    uint256 public maxDeposits;

    mapping(bytes32 => bool) public usedNullifiers;
    bytes32 public currentRoot;

    event Deposit(bytes32 newRoot, bytes32 commitment, uint256 index);
    event Withdraw(address indexed recipient, bytes32 nullifier);

    address public owner;

    // Constructor sets verifier addresses, owner, and computes the maximum number of leaves
    constructor(address _depositVerifier, address _withdrawVerifier, uint256 _merkleTreeDepth, bytes32 _initialRoot) {
        owner = msg.sender;
        depositVerifier = _depositVerifier;
        withdrawVerifier = _withdrawVerifier;
        maxDeposits = 2 ** _merkleTreeDepth;
        currentRoot = _initialRoot;
    }

    // Deposit function uses the internal depositIndex and checks against maxDeposits
    function deposit(bytes calldata proof, bytes32 newRoot, bytes32 commitment) external payable {
        require(depositIndex < maxDeposits, "Deposit limit reached");
        // Create a dynamic bytes32 array in memory with 4 elements
        bytes32[] memory publicInputs = new bytes32[](4);

        publicInputs[0] = currentRoot;
        publicInputs[1] = newRoot;
        publicInputs[2] = commitment;
        publicInputs[3] = bytes32(uint256(depositIndex)); // if depositIndex is uint256

        require(msg.value == 0.1 ether, "Must deposit exactly 0.1 ETH");
        require(IVerifier(depositVerifier).verify(proof, publicInputs), "Invalid deposit proof");

        currentRoot = newRoot;
        emit Deposit(newRoot, commitment, depositIndex);
        depositIndex++; // Increment internal deposit index
    }

    function withdraw(bytes calldata proof, bytes32 nullifier) external {
        require(!usedNullifiers[nullifier], "Nullifier already used");
        bytes32[] memory publicInputs = new bytes32[](2);
        publicInputs[0] = currentRoot;
        publicInputs[1] = nullifier;
        require(IVerifier(withdrawVerifier).verify(proof, publicInputs), "Invalid withdraw proof");

        usedNullifiers[nullifier] = true;
        emit Withdraw(msg.sender, nullifier);
        payable(msg.sender).transfer(0.1 ether);
    }
}
```

---

## ✅ High-Level Protocol

This section explains the processes underlying the deposit and withdraw operations, along with a note on verifier generation:


### 🔹 Deposit (0.1 ETH)

- **User Steps:**
  - Choose a random `id` (serves as the nullifier base) and a random blinding factor `r`.
- **Computation:**
  ```js
  commitment = PedersenHash(id, r)
  ```
- **Process:**
  - Insert `commitment` into the off-chain Merkle tree. Note that the state of the offchain Merkle tree must match the one on chain.
  - Generate a zero-knowledge (ZK) proof showing that the Merkle tree has been correctly updated with the new commitment.
- **On-Chain:**
  - The provided smart contract’s deposit function (which utilizes the automatically generated verifier from Noir) checks the proof.
  - Upon verification, the contract updates its state with the new Merkle tree root and emits the event:
    ```solidity
    event Deposit(bytes32 newRoot, bytes32 commitment, uint256 index);
    ```

### 🔹 Withdraw (0.1 ETH)

- **User Steps:**
  - Prepare a proof that you know a valid nullifier `id` satisfying:
    - `commitment = PedersenHash(id, r)` is present in the Merkle tree (verified via a Merkle path).
- **On-Chain:**
  - The withdraw function (leveraging the Noir-generated verifier) checks the proof.
  - If valid and the nullifier `id` is unused, 0.1 ETH is transferred to the caller, the nullifier is marked as used, and an event is emitted:
    ```solidity
    event Withdraw(address indexed recipient, bytes32 nullifier);
    ```

**Note:** The deposit and withdraw verifier contracts are automatically generated by compiling your Noir circuits. These verifier contracts are then plugged into the provided smart contract.

---

## 🧐 Noir Circuit Requirements

The Noir circuit implementations are split into two projects: one for deposit and one for withdraw. Noir currently supports generating only one verifier per project, so you must create two separate projects.

### `deposit.nr`

#### **Private Inputs**

- `id: Field`
- `r: Field`
- The old Merkle tree path to the empty leaf (`oldPath: [Field; depth]`)

#### **Public Inputs**

- `oldRoot: Field`
- `newRoot: Field`
- `commitment: Field` (which must equal `PedersenHash(id, r)`)
- `Leaf index: Field`

#### **Constraints Proven**

- That `commitment == PedersenHash(id, r)`
- A new Merkle tree root is correctly computed by inserting `commitment` at the specified index, updating the old path.
- The provided old Merkle path is valid for `oldRoot`.

---

### `withdraw.nr`

#### **Private Inputs**

- `r: Field`
- Leaf `index: Field`
- Merkle `path: [Field; depth]`

#### **Public Inputs**

- `root: Field`
- `id: Field` (serving as the nullifier)

#### **Constraints Proven**

- The circuit proves that the value `PedersenHash(id, r)` exists within the tree at the given `index` along the provided `path`.
- It confirms that the supplied `root` is the correct Merkle tree root corresponding to this path.
- The nullifier is properly computed.

---

## 📁 Deliverables

Your repository should include the following structure:

```
/whirlwind/
│
├── circuits/
│   ├── deposit-circuit/        # Noir project for deposit
│   │   ├── src/deposit.nr      # You should write this
│   │   ├── Nargo.toml
│   │   └── Prover.toml         # You should write this
│   └── withdraw-circuit/       # Noir project for withdraw
│       ├── src/withdraw.nr     # You should write this
│       ├── Nargo.toml
│       └── Prover.toml         # You should write this
│
├── contracts/
│   ├── whirlwind.sol         # Provided main contract
│   └── (generated) DepositVerifier.sol / WithdrawVerifier.sol # you should generate this
│
│
└── README.md
```

> ⚠️ **Note:** Noir currently supports generating only **one verifier** per project. Therefore, you must create **two separate Noir projects**: one for the deposit circuit and one for the withdraw circuit. Each must be compiled independently using:
>
> ```bash
> bb write_solidity_verifier --scheme ultra_honk -k ./target/vk -o ./target/DepositVerifier.sol
> bb write_solidity_verifier --scheme ultra_honk -k ./target/vk -o ./target/WithdrawVerifier.sol
> ```

---


## 🔸 Generating TOML Files with `demo.ts`

To generate the TOML files needed for your Noir circuits, you can run the provided `demo.ts` script. This demo shows how to initialize the off-chain Merkle tree, perform a deposit (generating the deposit TOML file), and produce the corresponding withdraw TOML file for a recorded deposit.

### How to Use:

1. **Run the Demo Script:**  
   Execute the demo using Node.js (located in hw6/gen_toml/src/):
   ```bash
   npx ts-node demo.ts
   ```

2. **Review the Output:**  
   The script will print out the generated TOML files to the console. These files include:
   - **Deposit TOML File:** Contains the inputs required by the deposit circuit (i.e. `id`, `r`, `hashpath`, `oldRoot`, `newRoot`, `commitment`, and `index` as an Fr element).
   - **Withdraw TOML File:** Contains the inputs required by the withdraw circuit (i.e. `r`, `index`, `hashpath`, `root`, and `id`).

3. **Use the TOML Files:**  
   Copy the TOML output into the respective input files and feed them into your Noir proof generation process.

---
### 🔍 Off-Chain Merkle Tree Details

The provided off-chain Merkle tree (from Lab 2) is being used when generating the .toml files :

- **Creating an Empty Merkle Tree:**  
  ```js
  const tree = new MerkleTree(8);  // for a tree of depth 8
  // Each empty leaf has the default value:
  // 0x2df8b940e5890e4e1377e05373fae69a1d754f6935e6a780b666947431f2cdcd
  ```

- **Inserting a Commitment:**  
  ```js
  tree.insert(commitment);
  ```

- **Retrieving the Current Root:**  
  ```js
  tree.root().toString();
  ```

- **Retrieving a Merkle Authentication Path:**  
  ```js
  console.log('Proof details:');
  console.log('  Leaf:', proof.leaf.toString());
  console.log('  Root:', proof.root.toString());
  console.log('  Path Elements:', proof.pathElements.map(fr => fr.toString()));
  console.log('  Path Indices:', proof.pathIndices);
  ```

---

### 🔸 How `demo.ts` Uses CircuitTomlGenerator.ts and the Off-Chain Merkle Tree

The `demo.ts` script serves as an example of how to integrate the off-chain Merkle tree from Lab 2 (implemented in `MerkleTree.ts`) with the logic provided by `CircuitTomlGenerator.ts`. Here’s a high-level overview of its operation:

- **Initialization:**  
  The demo script creates an instance of the `NoirCircuitTomlGenerator` class. This class instantiates a Merkle tree (with a depth of 8) by calling its constructor, and then calls the `init()` method to initialize the tree—including setting up the BarretenbergSync instance and preparing the zero values for each tree level.

- **Deposit Process:**  
  The demo script simulates a deposit by creating dummy Field elements (for the secret `id` and randomness `r`). It then calls:
  ```typescript
  generator.gentoml('deposit', id, r)
  ```
  This call:
  - Computes the Pedersen hash commitment using the provided Field elements.
  - Retrieves the current Merkle proof and the tree root.
  - Inserts the commitment into the tree and updates the Merkle tree state.
  - Records the deposit details (including the deposit index converted to an Fr element).
  - Generates a TOML string containing all the inputs required by the deposit Noir circuit.

- **Withdraw Process:**  
  To simulate a withdrawal, the script calls:
  ```typescript
  generator.gentoml('withdraw', index)
  ```
  where `index` corresponds to the deposit record you wish to use. This call retrieves the previously recorded deposit details and generates a TOML string formatted for the withdraw circuit inputs.

- **Output:**  
  Finally, the demo script prints the generated TOML strings to the console, showing how the off-chain state (managed by the Merkle tree from Lab 2) is seamlessly integrated with the requirements of your Noir circuits.

### Example Snippet from `demo.ts`:

```typescript
import { NoirCircuitTomlGenerator } from './CircuitTomlGenerator';
import { Fr } from '@aztec/bb.js';

async function runDemo() {
  // Create and initialize the CircuitTomlGenerator instance.
  const generator = new NoirCircuitTomlGenerator();
  await generator.init();

  // Create dummy Field elements for the deposit. Replace these with proper values.
  const id = Fr.random(); 
  const r  = Fr.random();

  // Generate the TOML file for a deposit.
  const depositToml = generator.gentoml('deposit', id, r);
  console.log('Deposit TOML:\n', depositToml);

  // Generate the TOML file for a withdrawal using the deposit at index 0.
  const withdrawToml = generator.gentoml('withdraw', 0);
  console.log('Withdraw TOML:\n', withdrawToml);
}

runDemo().catch(console.error);
```



## 🚀 Running in Codespaces

Same as Lab 1 and 2 — this repo supports zero-setup development via GitHub Codespaces.

1. **Fork** this repo to your own GitHub.
2. Click the **`<> Code`** button → **`Codespaces` → `Create codespace on main`**
3. Wait for it to initialize
4. Use the built-in terminal to run commands

---

## 🧩 What's Preinstalled

Everything is ready to go:

- `noirup` + `nargo`
- `bbup` with Barretenberg backend
- Node.js + npm + npx

---

## ✨ Bonus Points

1. **(+20%) Deploy your contract on-chain:**  

Link your deployed contract to the provided parent contract, and post sample transactions demonstrating both deposits and withdrawals.

*Technical Note:* Noir proofs are bundled with their public inputs. Before submitting the proof to Remix, you must separate the public inputs from the proof. To do this, calculate the size of the public inputs and remove that portion from the beginning of the proof. Refer to the section **"Deploying to Solidity on Sepolia via Remix"** in Lab 1, and update the provided script accordingly to handle the larger public input.

**Deliverables:**
- Deployed contract address on Sepolia.
- Transaction hashes (or screenshots) showing at least one deposit and one withdrawal.
- The modified deployment script used to separate public inputs from the proof.

---

2. **(+20%) Frontend Implementation:**  

Develop either a graphical user interface (GUI) or a command-line interface (CLI) to interact with the deposit and withdraw functions of your contract. The interface should stay in sync with the on-chain Merkle tree state by listening to the `Deposit` event. It must also allow any new user (that hasn't interacted with the contract before) to perform deposits and withdrawals from the contract.

**Deliverables:**
- Source code for the frontend (web or CLI).
- Screenshots showing the interface in action.
- Instructions on how to run the interface locally (or a link to a hosted version, if applicable).

---
## 📤 Submission Instructions

- Zip your entire `/whirlwind/` directory, including all circuits, contracts, scripts, and the `README.md`.
- Upload the resulting `.zip` file to Gradescope under the corresponding assignment.
- Make sure any screenshots, documents or code for the bonus are also included in the ZIP (or linked in the `README.md`).