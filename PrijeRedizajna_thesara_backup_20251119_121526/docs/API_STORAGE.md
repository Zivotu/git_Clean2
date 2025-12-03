# Storage API

The Storage API provides a simple key-value storage solution on a per-namespace basis, featuring optimistic version control via ETags.

## Endpoints

### `GET /api/storage?ns={namespace}`

Retrieves a JSON snapshot of the storage for a given namespace.

-   **Auth**: Recommended (Bearer token), but anonymous access may be allowed depending on the environment configuration (note that the environment may return a 401).
-   **Response**: `200 OK` with a JSON snapshot (object) and an `ETag: "<n>"` header. If the storage is empty, it returns `{}` and `ETag: "0"`.
-   **Headers**:
    -   `ETag`: The current version of the snapshot.
    -   `X-Storage-Backend`: `local` or `gcs` (for informational purposes).
    -   `Access-Control-Expose-Headers`: `ETag, X-Storage-Backend`.

### `PATCH /api/storage?ns={namespace}`

Atomically applies a set of operations to the storage.

-   **Auth**: Bearer token is expected.
-   **Required Headers**:
    -   `If-Match`: The ETag of the snapshot you are updating. Use `"0"` to create a new one.
    -   `Content-Type`: `application/json`.
    -   `X-Thesara-App-Id`: An identifier for the application making the change.
-   **Body**: A JSON array of operations.
-   **Status Codes**:
    -   `201 Created`: When creating from an empty state (`If-Match: "0"`).
    -   `200 OK`: On a successful update when `If-Match` matches the current ETag.
    -   `412 Precondition Failed`: Conflict detected. The response will include the current `ETag` in the header.
    -   `400 Bad Request`: Invalid payload or operations.
    -   `401 Unauthorized`: Missing or invalid JWT.
    -   `413 Payload Too Large`: The request body exceeds the API's configured limit.
-   **Response Headers**: A new `ETag` and `X-Storage-Backend`.

## Operations (Payload)

The payload is an array of operations.

-   **`set`**: Sets or updates a key.
    ```json
    {"op":"set","key":"<string>","value":<JSON>}
    ```
-   **`del`**: Deletes a key.
    ```json
    {"op":"del","key":"<string>"}
    ```

### Example: Creation (`If-Match: "0"`)

```json
[
  {"op":"set","key":"foo","value":"bar"}
]
```

### Example: Update (`If-Match: "<current ETag>"`)

```json
[
  {"op":"set","key":"foo","value":"baz"}
]
```

## Notes

### PowerShell and here-strings

When using PowerShell here-strings, the closing marker (`'@`) must be on a new line by itself.

**Correct:**
```powershell
@' 
[
  {"op":"set","key":"foo","value":"bar"}
]
'@ | Set-Content ops.json
```

### Windows Paths

On Windows, it's recommended to use absolute paths for `.env` variables.
Example: `KV_STORAGE_PATH=C:\thesara_RollBack\storage\kv`

## cURL Examples

### Preflight (204)

```bash
curl -i -X OPTIONS "http://127.0.0.1:8788/api/storage?ns=smoke" \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: PATCH" \
  -H "Access-Control-Request-Headers: authorization, if-match, content-type, x-thesara-app-id"
```

### GET (anonymous or with Bearer)

```bash
curl -i "http://127.0.0.1:8788/api/storage?ns=smoke"
```

### PATCH Create

```bash
curl -i -X PATCH "http://127.0.0.1:8788/api/storage?ns=smoke" \
  -H "Authorization: Bearer $JWT" \
  -H "If-Match: 0" \
  -H "X-Thesara-App-Id: smoke" \
  -H "Content-Type: application/json" \
  --data-binary @ops.json
```

### PATCH Conflict (expect 412)

```bash
curl -i -X PATCH "http://127.0.0.1:8788/api/storage?ns=smoke" \
  -H "Authorization: Bearer $JWT" \
  -H "If-Match: 0" \
  -H "X-Thesara-App-Id: smoke" \
  -H "Content-Type: application/json" \
  --data-binary @ops.json
```

## Debug Endpoint

-   `GET /_debug/storage-info`: Returns the backend type (`local|gcs`) and key paths. This endpoint is only available in development environments.

## Example Client (TypeScript)

This is a minimal TypeScript function demonstrating an optimistic update flow with conflict detection.

```ts
export async function patchStorage(ns: string, ops: any[], jwt: string, appId = 'app') {
  const base = `/api/storage?ns=${encodeURIComponent(ns)}`;
  const g = await fetch(base, { headers: { Authorization: `Bearer ${jwt}` } });
  const etag = g.headers.get('ETag') ?? '"0"';
  const r = await fetch(base, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'If-Match': etag,
      'X-Thesara-App-Id': appId,
    },
    body: JSON.stringify(ops),
  });
  if (r.status === 412) {
    const current = r.headers.get('ETag');
    throw new Error(`Conflict; current ETag=${current}`);
  }
  if (!r.ok) throw new Error(`PATCH failed: ${r.status}`);
  return { etag: r.headers.get('ETag'), body: await r.json() };
}
```