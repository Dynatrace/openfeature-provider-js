# Dynatrace OpenFeature – React Example

A minimal Vite + React + TypeScript app that wires up the **local build** of
`@dynatrace/openfeature-provider-web` with the OpenFeature Web SDK.

## Prerequisites

- Node 18+
- The provider has been built at least once (see below)

---

## 1 – Build the provider

From the **repo root**:

```bash
npm install
npm run build
```

This compiles the provider into `dist/` which is what the example references via
the `file:../..` dependency in `package.json`.

> Re-run `npm run build` in the repo root whenever you change provider source so
> the example picks up the latest code.

---

## 2 – Configure your SDK key

```bash
cp .env.example .env
```

Edit `.env` and set `VITE_DT_SDK_KEY` to your Dynatrace web SDK key
(`dt01.web_<region>_…`).

---

## 3 – Install and run

```bash
cd examples/react-app
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## What the example demonstrates

| File                                 | Purpose                                                                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.tsx`                       | Registers `DynatraceProvider` with `OpenFeature.setProvider()` and sets an initial evaluation context                                                          |
| `src/App.tsx`                        | Listens for `ProviderEvents.Ready` / `ProviderEvents.Error` before rendering                                                                                   |
| `src/components/FeatureFlagDemo.tsx` | Evaluates boolean, string, number, and object flags; reacts to `PROVIDER_CONFIGURATION_CHANGED` for live updates; exposes a button to change the targeting key |

---

## Customising flag keys

Open `src/components/FeatureFlagDemo.tsx` and update the `FLAGS` constant at the
top to match flags you have configured in your Dynatrace environment:

```ts
const FLAGS = {
  BOOLEAN: 'my-boolean-flag',
  STRING: 'my-string-flag',
  NUMBER: 'my-number-flag',
  OBJECT: 'my-object-flag',
} as const;
```

---

## Polling

To enable periodic re-evaluation, pass `pollInterval` (milliseconds) to the
provider in `src/main.tsx`:

```ts
new DynatraceProvider({ sdkKey, pollInterval: 60_000 }); // refresh every 60 s
```

The `FeatureFlagDemo` component already subscribes to
`ProviderEvents.ConfigurationChanged`, so it will re-render automatically when
a poll returns updated values.
