# Tank Game

A 2D tank game built with raylib, inspired by arras.io and diep.io.

## Supported Platforms

- Windows
- Linux
- MacOS
- Web (via Emscripten/WebAssembly)

## Controls

- Arrow Keys or WASD: Move tank
- Mouse: Aim cannon

---

## Desktop Build

### Linux / MacOS

```bash
cd build
./premake5 gmake      # Linux
./premake5.osx gmake  # MacOS
cd ..
make
./bin/Debug/tank-game
```

### Windows (MinGW-W64)

```batch
build-MinGW-W64.bat
make
bin\Debug\tank-game.exe
```

### Windows (Visual Studio)

```batch
build-VisualStudio2022.bat
```
Then open the generated `.sln` file.

---

## Web Build (Emscripten)

### 1. Install Emscripten SDK

```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source emsdk_env.sh
cd ..
```

### 2. Build raylib (required first time)

```bash
make
```

### 3. Build for Web

```bash
./build-web.sh
```

### 4. Run Locally

```bash
cd bin/web
python3 -m http.server 8080
```

Open http://localhost:8080 in your browser.

---

## Project Structure

```
tank-game/
  src/           - Game source code
  include/       - Header files
  resources/     - Game assets
  build/         - Build system files
  bin/           - Compiled output
```

## License

Based on raylib-quickstart by Jeffery Myers.

This software is provided "as-is", without any express or implied warranty.
