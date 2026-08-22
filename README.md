# FastCards

AI-native family crypto neobank — Expo (React Native) app + Fastify gateway
over SpacetimeDB. Package manager is **Bun** throughout (app, gateway,
SpacetimeDB module). No npm/yarn.

## Prerequisites

- Bun ≥ 1.2
- Android: JDK 17+, Android SDK (`ANDROID_HOME` set)
- iOS: macOS with Xcode + CocoaPods
- A running local SpacetimeDB for the gateway (see below)

## Install

```bash
bun install              # app
bun install --cwd server # gateway
```

## Run the backend

The app talks to the gateway on port `8787` (repo-root `.env` /
`server/.env`). Start the database first:

```bash
spacetime start          # local SpacetimeDB, listens on ws://127.0.0.1:3000
```

Publish the module once per database:

```bash
bun run --cwd server stdb:publish:local   # database: fastcards
```

Then run the gateway:

```bash
bun run server           # = bun run --cwd server dev, port 8787
```

(Or `bun run server:maincloud` against the hosted SpacetimeDB.)

## Build & run the app

```bash
bun run prebuild         # = expo prebuild --clean (regenerates android/ + ios/)
bun run android          # builds, installs on device/emulator, starts Metro
bun run ios              # macOS only: pod install + xcodebuild + simulator
```

### Finding the gateway

The app discovers the gateway itself — no tunnel setup required. On first
request it probes `/health` in parallel across the Metro host, this machine's
LAN IPs (baked into the manifest by `app.config.ts`), `localhost`, and the
`10.0.2.2` emulator loopback, then caches whichever answers first. USB, Wi-Fi,
and emulator all work unchanged, and Retry on the error screen re-runs
discovery so a network change recovers without a restart.

To pin an address instead, set `EXPO_PUBLIC_API_URL` in the root `.env`
(e.g. `http://192.168.1.18:8787`); it is used verbatim and skips probing.
Release builds do no discovery, so they **must** set it.

`bun run android` still runs `adb reverse tcp:8787 tcp:8787` as a convenience —
the `localhost` candidate picks the tunnel up when it's there — but nothing
depends on it any more.

Two terminals, in order:

```bash
# terminal 1 — backend
spacetime start
bun run server

# terminal 2 — app
bun install && bun run prebuild && bun run android
```

## Other scripts

- `bun run android:reverse` — optional: tunnel the API port over USB
- `bun run lint` — `expo lint`
- `bun run web` — `expo start --web`
- Server tests: `bun test --cwd server`