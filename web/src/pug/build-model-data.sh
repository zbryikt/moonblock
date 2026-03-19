#!/bin/bash
# 從 moonblock.glb 生成 moonblock-data.js

echo "Building moonblock-data.js from moonblock.glb..."

if [ ! -f "moonblock.glb" ]; then
  echo "Error: moonblock.glb not found in current directory"
  exit 1
fi

echo "const moonblockGlb = \"data:application/octet-stream;base64,$(base64 < moonblock.glb | tr -d '\n')\";" > moonblock-data.js

echo "Done! moonblock-data.js generated successfully."
echo "File size: $(wc -c < moonblock-data.js) bytes"
