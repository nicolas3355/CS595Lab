# #!/bin/bash
# set -e

# echo "Initializing a new TypeScript CommonJS project with @aztec/bb.js..."

# # Step 1: Initialize a new npm project
# npm init -y

# # Step 2: Install TypeScript and ts-node as development dependencies
# npm install --save-dev typescript ts-node

# # Step 3: Create a default tsconfig.json
# npx tsc --init

# # Step 4: Modify tsconfig.json for CommonJS support
# echo "Modifying tsconfig.json for CommonJS..."
# node -e "const fs = require('fs'); \
# let raw = fs.readFileSync('./tsconfig.json', 'utf8'); \
# raw = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); \
# let cfg = JSON.parse(raw); \
# cfg.compilerOptions.module = 'commonjs'; \
# cfg.compilerOptions.target = 'es2020'; \
# cfg.compilerOptions.moduleResolution = 'node'; \
# cfg.compilerOptions.strict = true; \
# cfg.compilerOptions.esModuleInterop = true; \
# fs.writeFileSync('./tsconfig.json', JSON.stringify(cfg, null, 2));"

# # Step 5: Install @aztec/bb.js package as a dependency
# npm install @aztec/bb.js

# echo "Project initialization is complete."



#!/bin/bash

npm init -y
npm install -D tsx typescript @types/node
npm install @aztec/bb.js @aztec/aztec.js

echo "Setup complete. To run, call: npx tsx src/demo.ts"