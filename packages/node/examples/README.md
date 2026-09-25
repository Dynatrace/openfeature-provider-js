# Examples

## `quickstart.mjs`

Evaluates a boolean, string, and number flag twice, once without targeting context and once
with one, then shuts the provider down so buffered evaluation metrics are flushed.

Build the package first so the workspace import resolves to `dist`:

```bash
npm run build --workspace=packages/node
```

Then run it:

```bash
DT_SDK_KEY=dt01.server_... node packages/node/examples/quickstart.mjs
```

| Variable            | Required | Description                                                         |
| ------------------- | -------- | ------------------------------------------------------------------- |
| `DT_SDK_KEY`        | yes      | Server SDK key.                                                     |
| `DT_CONFIG_ORIGIN`  | no       | Override the flag configuration origin.                             |
| `DT_METRICS_ORIGIN` | no       | Override the evaluation metrics ingest origin.                      |
| `DT_TARGETING_KEY`  | no       | Targeting key for the second evaluation. Defaults to `user-456`.    |
| `DT_EMAIL`          | no       | `email` attribute for the second evaluation.                        |
| `DT_DEBUG`          | no       | Set to any value to route `info` and `debug` output to the console. |
