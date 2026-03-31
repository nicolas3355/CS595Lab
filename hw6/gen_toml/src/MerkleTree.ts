/**
 * @file MerkleTree.ts
 * @author Nicolas Alhaddad
 *
 * @remarks
 * This version of the Merkle Tree was updated to be compatible with the new version of @aztec/bb.js.
 * It uses BarretenbergSync instead of the older newBarretenbergApiSync() call, and passes two Fr elements
 * into pedersenHash([left, right], 0) to replicate the previous pedersenHashPair() logic.
 */

import { BarretenbergSync } from '@aztec/bb.js';
import { Fr } from '@aztec/aztec.js/fields';


/**
 * IMerkleTree defines a simple interface for a Merkle tree, including basic
 * functionality to insert leaves, generate proofs, and retrieve the root.
 */
export interface IMerkleTree {
  /**
   * Returns the current root of the Merkle tree.
   */
  root: () => Fr;

  /**
   * Generates a Merkle proof for a leaf at the given index.
   */
  proof: (index: number) => {
    root: Fr;
    pathElements: Fr[];
    pathIndices: number[];
    leaf: Fr;
  };

  /**
   * Inserts a new leaf into the Merkle tree.
   */
  insert: (leaf: Fr) => void;
}

/**
 * MerkleTree implements a basic Merkle tree using Pedersen hashing
 * via BarretenbergSync from @aztec/bb.js.
 *
 * Levels are zero-based (0 is the leaf layer). The root is stored at index = 0
 * on the top level (this.levels).
 *
 * @remarks
 * - Updated to use BarretenbergSync.initSingleton() for initialization.
 * - Replaces pedersenHashPair(left, right) with pedersenHash([left, right], 0).
 */
export class MerkleTree implements IMerkleTree {
  /**
   * The base zero value used for empty leaves.
   * Must be 32 bytes (0x-prefixed 64 hex characters) to avoid buffer issues in Fr.
   * Initialized inside initialize() after BarretenbergSync.initSingleton() is called,
   * because Fr requires the WASM to be loaded before it can be constructed.
   */
  zeroValue!: Fr;

  /**
   * The total number of levels in the Merkle tree (excluding the root level).
   */
  levels: number;

  /**
   * Internal storage mapping "level-index" -> Fr value for each filled node.
   */
  storage: Map<string, Fr>;

  /**
   * An array of "zero" values, where zeros[i] is the zero node value at level i.
   */
  zeros: Fr[];

  /**
   * The total number of inserted leaves in this tree.
   */
  totalLeaves: number;

  /**
   * The BarretenbergSync instance used to perform Pedersen hashes.
   * This is set during initialization.
   */
  bb!: BarretenbergSync;

  /**
   * Constructs the MerkleTree with a specified number of levels.
   * @param levels - number of levels, where level 0 is leaves and level `levels` is the root.
   */
  constructor(levels: number) {
    this.levels = levels;
    this.storage = new Map();
    this.zeros = [];
    this.totalLeaves = 0;
  }

  /**
   * Asynchronously initializes BarretenbergSync and builds zero values for each level.
   * Optionally inserts default leaves into the tree.
   *
   * @param defaultLeaves - Optional leaves to prepopulate the tree.
   */
  async initialize(defaultLeaves: Fr[]) {
    // 1) Initialize the BarretenbergSync singleton once.
    await BarretenbergSync.initSingleton();
    this.bb = BarretenbergSync.getSingleton();

    // 2) Set zeroValue here, after WASM is loaded (Fr requires WASM to be initialized).
    this.zeroValue = Fr.fromString(
      '0x2df8b940e5890e4e1377e05373fae69a1d754f6935e6a780b666947431f2cdcd',
    );

    // 3) Build zero array for each level.
    let currentZero = this.zeroValue;
    this.zeros.push(currentZero);

    for (let i = 0; i < this.levels; i++) {
      currentZero = this.pedersenHash(currentZero, currentZero);
      this.zeros.push(currentZero);
    }

    // 3) Insert the provided default leaves (if any).
    for (const leaf of defaultLeaves) {
      this.insert(leaf);
    }
  }

  /**
   * Pedersen-hash two Fr elements using the new pedersenHash function.
   *
   * @param left - The left input to hash.
   * @param right - The right input to hash.
   * @returns The Pedersen hash of [left, right].
   */
  pedersenHash(left: Fr, right: Fr): Fr {
    const result = this.bb.pedersenHash({ inputs: [left.toBuffer(), right.toBuffer()], hashIndex: 0 });
    return Fr.fromBuffer(Buffer.from(result.hash));
  }

  /**
   * Converts a (level, index) pair to a string key for use in storage.
   */
  static indexToKey(level: number, index: number): string {
    return `${level}-${index}`;
  }

  /**
   * Returns the storage index of a given leaf, or -1 if the leaf is not found.
   *
   * @param leaf - The Fr leaf value to find.
   */
  getIndex(leaf: Fr): number {
    for (const [key, value] of this.storage) {
      if (value.toString() === leaf.toString()) {
        return Number(key.split('-')[1]);
      }
    }
    return -1;
  }

  /**
   * Returns the current Merkle root of the tree.
   * If the top-level node isn't in storage, returns the "zero" root.
   */
  root(): Fr {
    return (
      this.storage.get(MerkleTree.indexToKey(this.levels, 0)) ||
      this.zeros[this.levels]
    );
  }

  /**
   * Generates a Merkle proof for the leaf at the specified index.
   * Includes:
   * - The current root.
   * - The path elements (siblings at each level).
   * - The path indices (0 if the node is left, 1 if right).
   * - The leaf itself.
   *
   * @param indexOfLeaf - The zero-based index of the leaf.
   * @throws If the leaf is not found.
   */
  proof(indexOfLeaf: number) {
    const pathElements: Fr[] = [];
    const pathIndices: number[] = [];

    // Instead of throwing an error when a leaf is not found,
    // we now default to the zero value for leaves (this.zeros[0]).
    let leaf = this.storage.get(MerkleTree.indexToKey(0, indexOfLeaf));
    if (!leaf) {
      leaf = this.zeros[0];
    }

    // Collect sibling info at each level.
    const handleIndex = (
      level: number,
      currentIndex: number,
      siblingIndex: number,
    ) => {
      const siblingValue =
        this.storage.get(MerkleTree.indexToKey(level, siblingIndex)) ||
        this.zeros[level];
      pathElements.push(siblingValue);
      pathIndices.push(currentIndex % 2);
    };

    this.traverse(indexOfLeaf, handleIndex);

    return {
      root: this.root(),
      pathElements,
      pathIndices,
      leaf,
    };
  }

  /**
   * Inserts a new leaf at the next available index (this.totalLeaves).
   *
   * @param leaf - The Fr leaf value to insert.
   */
  insert(leaf: Fr) {
    const index = this.totalLeaves;
    this.update(index, leaf, true);
    this.totalLeaves++;
  }

  /**
   * Updates or inserts a leaf at a specific index, and recalculates parent hashes up to the root.
   *
   * @param index - Where to insert or update.
   * @param newLeaf - The new Fr value for that position.
   * @param isInsert - True if inserting a brand-new leaf; false if updating an existing leaf.
   * @throws If you're trying to insert at an index >= totalLeaves, or update an index < totalLeaves.
   */
  update(index: number, newLeaf: Fr, isInsert: boolean = false) {
    if (!isInsert && index >= this.totalLeaves) {
      throw Error('Use insert method for new elements.');
    } else if (isInsert && index < this.totalLeaves) {
      throw Error('Use update method for existing elements.');
    }

    const keyValueToStore: { key: string; value: Fr }[] = [];
    let currentElement: Fr = newLeaf;

    // Called at each level from leaf to root.
    const handleIndex = (
      level: number,
      currentIndex: number,
      siblingIndex: number,
    ) => {
      const siblingElement =
        this.storage.get(MerkleTree.indexToKey(level, siblingIndex)) ||
        this.zeros[level];

      let left: Fr;
      let right: Fr;
      if (currentIndex % 2 === 0) {
        left = currentElement;
        right = siblingElement;
      } else {
        left = siblingElement;
        right = currentElement;
      }

      // Store the current (leaf or parent) node
      keyValueToStore.push({
        key: MerkleTree.indexToKey(level, currentIndex),
        value: currentElement,
      });

      // Compute the parent node
      currentElement = this.pedersenHash(left, right);
    };

    this.traverse(index, handleIndex);

    // Finally, store the new root
    keyValueToStore.push({
      key: MerkleTree.indexToKey(this.levels, 0),
      value: currentElement,
    });

    // Commit changes to storage
    keyValueToStore.forEach(o => {
      this.storage.set(o.key, o.value);
    });
  }

  /**
   * Traverses from the given leaf index up to the root (level by level),
   * calling the provided handler with (level, currentIndex, siblingIndex).
   *
   * @param indexOfLeaf - Zero-based index of the leaf.
   * @param handler - A function that consumes (level, currentIndex, siblingIndex).
   */
  private traverse(
    indexOfLeaf: number,
    handler: (
      level: number,
      currentIndex: number,
      siblingIndex: number,
    ) => void,
  ) {
    let currentIndex = indexOfLeaf;
    for (let i = 0; i < this.levels; i++) {
      let siblingIndex: number;
      if (currentIndex % 2 === 0) {
        siblingIndex = currentIndex + 1;
      } else {
        siblingIndex = currentIndex - 1;
      }

      handler(i, currentIndex, siblingIndex);
      currentIndex = Math.floor(currentIndex / 2);
    }
  }
}

