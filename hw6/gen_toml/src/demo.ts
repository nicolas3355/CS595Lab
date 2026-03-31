import { NoirCircuitTomlGenerator } from './CircuitTomlGenerator';
import { Fr } from '@aztec/aztec.js/fields';


async function runExample() {
  // Create an instance and initialize the tree.
  const tomlGenerator = new NoirCircuitTomlGenerator();
  await tomlGenerator.init();

  // Create example Field elements (assuming Fr.fromString is available).
  const id = Fr.random(); // Replace with proper field element initialization.
  const r = Fr.random();    // Replace with proper field element initialization.

  // Generate a deposit TOML file:
  const depositToml = tomlGenerator.gentoml('deposit', id, r);
  console.log('Deposit TOML:\n', depositToml);

  // Later, you can generate a withdraw TOML file for the same deposit (index 0):
  const withdrawToml = tomlGenerator.gentoml('withdraw', 0);
  console.log('Withdraw TOML:\n', withdrawToml);
}

runExample().catch(console.error);

