# Trimmed Microsoft Graph OpenAPI spec

A filtered JSON copy of the Microsoft Graph v1.0 OpenAPI description, for app-only tenant administration. It is not an official Microsoft file.

| | Source | This copy |
| --- | ---: | ---: |
| Operations | 18,004 | 8,549 |
| Format | YAML, 44.8 MB | JSON, 15.7 MB |

- `v1.0/openapi.json` is the spec. Pin to a commit, not `main`.
- `exclusions.json` lists every removed path pattern with its reason, plus the paths that must survive.
- `scripts/trim-spec.mjs` rebuilds the file from Microsoft's source at the pinned commit. It needs `js-yaml`.

Removed paths need a signed-in user, are out of scope for administration, are retired, or duplicate a path that remains.

Microsoft marks `@odata.type` required on every entity schema. Graph needs it only to choose a derived type, so this copy drops that one requirement and request bodies validate without it.

`exclusions.json` also lists single operations removed because their response hands a fresh credential to the caller, such as creating a Temporary Access Pass, resetting a password, adding an app secret, or reading an Intune secret in plain text.

## Rebuild

```sh
npm install --no-save js-yaml@4.1.0
node scripts/trim-spec.mjs v1.0/openapi.json
```

## Source and license

Derived from [`microsoftgraph/msgraph-metadata`](https://github.com/microsoftgraph/msgraph-metadata) at commit `19426105dd741181fffcd4972c8800b569360bed`, `openapi/v1.0/openapi.yaml`, under the MIT license in `LICENSE.microsoft`.
