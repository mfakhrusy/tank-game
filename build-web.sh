#!/bin/bash
# Build script for Emscripten/WebAssembly
# Requires emscripten SDK to be installed and activated (source emsdk_env.sh)

set -e

# Check if emcc is available
if ! command -v emcc &> /dev/null; then
    echo "Error: emcc not found. Please install and activate Emscripten SDK:"
    echo "  git clone https://github.com/emscripten-core/emsdk.git"
    echo "  cd emsdk && ./emsdk install latest && ./emsdk activate latest"
    echo "  source emsdk_env.sh"
    exit 1
fi

# Create web output directory
mkdir -p bin/web

# Raylib source directory
RAYLIB_SRC="build/external/raylib-master/src"

# Check if raylib is downloaded
if [ ! -d "$RAYLIB_SRC" ]; then
    echo "Raylib not found. Run 'make' first to download raylib, or manually download it."
    exit 1
fi

echo "Building for Web (Emscripten)..."

# Compile raylib for web (only the needed modules)
emcc -c "$RAYLIB_SRC/rcore.c" -o bin/web/rcore.o \
    -Os -Wall -DPLATFORM_WEB -DGRAPHICS_API_OPENGL_ES2 \
    -I"$RAYLIB_SRC" -I"$RAYLIB_SRC/external/glfw/include"

emcc -c "$RAYLIB_SRC/rshapes.c" -o bin/web/rshapes.o \
    -Os -Wall -DPLATFORM_WEB -DGRAPHICS_API_OPENGL_ES2 \
    -I"$RAYLIB_SRC"

emcc -c "$RAYLIB_SRC/rtextures.c" -o bin/web/rtextures.o \
    -Os -Wall -DPLATFORM_WEB -DGRAPHICS_API_OPENGL_ES2 \
    -I"$RAYLIB_SRC" -I"$RAYLIB_SRC/external"

emcc -c "$RAYLIB_SRC/rtext.c" -o bin/web/rtext.o \
    -Os -Wall -DPLATFORM_WEB -DGRAPHICS_API_OPENGL_ES2 \
    -I"$RAYLIB_SRC" -I"$RAYLIB_SRC/external"

emcc -c "$RAYLIB_SRC/rmodels.c" -o bin/web/rmodels.o \
    -Os -Wall -DPLATFORM_WEB -DGRAPHICS_API_OPENGL_ES2 \
    -I"$RAYLIB_SRC" -I"$RAYLIB_SRC/external"

emcc -c "$RAYLIB_SRC/raudio.c" -o bin/web/raudio.o \
    -Os -Wall -DPLATFORM_WEB -DGRAPHICS_API_OPENGL_ES2 \
    -I"$RAYLIB_SRC" -I"$RAYLIB_SRC/external"

emcc -c "$RAYLIB_SRC/utils.c" -o bin/web/utils.o \
    -Os -Wall -DPLATFORM_WEB -DGRAPHICS_API_OPENGL_ES2 \
    -I"$RAYLIB_SRC"

# Compile game
emcc -c src/main.c -o bin/web/main.o \
    -Os -Wall -DPLATFORM_WEB -DGRAPHICS_API_OPENGL_ES2 \
    -I"$RAYLIB_SRC" -Iinclude

# Link everything together
emcc bin/web/*.o -o bin/web/index.html \
    -Os -Wall -DPLATFORM_WEB \
    -s USE_GLFW=3 \
    -s ASYNCIFY \
    -s TOTAL_MEMORY=67108864 \
    -s ALLOW_MEMORY_GROWTH=1 \
    --shell-file build/shell.html \
    --preload-file resources

echo ""
echo "Build complete! Files are in bin/web/"
echo "To run locally: cd bin/web && python3 -m http.server 8080"
echo "Then open http://localhost:8080 in your browser"
