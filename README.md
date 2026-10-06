# HAYSTACK — Phase 1

A 3D mobile haystack searching simulator built with Three.js.

## Run locally
Use any static server (must serve HTTP — ES modules do not work over file://).

Options:
- `npx serve .`  → http://localhost:3000
- `python3 -m http.server 8080`
- VS Code Live Server extension

## Controls
- Left joystick: move
- Right half drag: look
- USE: remove hay / open shop / open sell
- Jump / Sprint / Crouch: right-side buttons
- Top-right: Missions, Inventory, Settings

## Phase 1 features
- 3D FPS world (farm, barn, workshop, shop, sell pad, fences, trees)
- InstancedMesh hay piles (thousands of removable pieces)
- Real hay interaction with tool capacity
- Tools (Hands, Stick, Small Rake, Hay Fork, Large Rake)
- Inventory, Shop, Selling
- XP, Level, Money
- 6 real missions
- IndexedDB save with autosave (LocalStorage fallback)
- Full mobile touch controls (no mouse/keyboard required)
- PWA installable