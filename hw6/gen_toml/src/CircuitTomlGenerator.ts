// CircuitTomlGenerator.ts

import { MerkleTree } from './MerkleTree';
import { BarretenbergSync } from '@aztec/bb.js';
import { Fr } from '@aztec/aztec.js/fields';

export class NoirCircuitTomlGenerator {
  private tree: MerkleTree;
  private depositMap: Map<number, { id: Fr; r: Fr }>;

  constructor() {
    this.tree = new MerkleTree(8);
    this.depositMap = new Map();
  }

  async init() {
    await this.tree.initialize([]);
  }

  /** Pads a number to 32-byte hex and wraps in an Fr. */
  private numToFr(num: number): Fr {
    const hex = num.toString(16).padStart(64, '0');
    return Fr.fromString('0x' + hex);
  }

  /**
   * Perform the off-chain deposit:
   * 1) compute commitment = PedersenHash(id, r)
   * 2) record oldRoot + proof path
   * 3) insert commitment into tree
   * 4) record `{id,r}` in the map under this index
   * 5) return all fields needed for the deposit.toml
   */
  gentoml(circuitType: 'deposit', id: Fr, r: Fr): string;
  /**
   * Generate a withdraw.toml by:
   * 1) looking up `{id,r}` from the map by index
   * 2) querying `this.tree.proof(index)` for the current path + root
   */
  gentoml(circuitType: 'withdraw', index: number): string;
  gentoml(
    circuitType: 'deposit' | 'withdraw',
    param1: any,
    param2?: any
  ): string {
    if (circuitType === 'deposit') {
      const id: Fr = param1;
      const r: Fr = param2!;
      const idx = this.tree.totalLeaves;
      const idxFr = this.numToFr(idx);

      // 1) get pre-deposit state
      const oldRoot = this.tree.root();
      const proof = this.tree.proof(idx);
      const hashPath = proof.pathElements;

      // 2) compute & insert commitment
      const commitmentResult = this.tree.bb.pedersenHash({ inputs: [id.toBuffer(), r.toBuffer()], hashIndex: 0 });
      const commitment = Fr.fromBuffer(Buffer.from(commitmentResult.hash));
      this.tree.insert(commitment);
      const newRoot = this.tree.root();

      // 3) record just {id,r}
      this.depositMap.set(idx, { id, r });

      // 4) emit deposit.toml
      return `
id = "${id.toString()}"
r = "${r.toString()}"
oldPath = [${hashPath.map((fr) => `"${fr.toString()}"`).join(', ')}]
oldRoot = "${oldRoot.toString()}"
newRoot = "${newRoot.toString()}"
commitment = "${commitment.toString()}"
index = "${idxFr.toString()}"
      `.trim();
    } else {
      const idx: number = param1;
      const entry = this.depositMap.get(idx);
      if (!entry) {
        throw new Error(`No deposit found at index ${idx}`);
      }
      const { id, r } = entry;
      const idxFr = this.numToFr(idx);

      // re-compute proof against current tree state
      const proof = this.tree.proof(idx);
      const hashPath = proof.pathElements;
      const root = proof.root;

      return `
r = "${r.toString()}"
index = "${idxFr.toString()}"
hashpath = [${hashPath.map((fr) => `"${fr.toString()}"`).join(', ')}]
root = "${root.toString()}"
id = "${id.toString()}"
      `.trim();
    }
  }
}
