# Storage API

The Storage API provides a generic way to store and retrieve JSON data on a per-user and per-namespace basis.

It includes rate limiting to prevent abuse (default: 120 requests/minute per user) and enforces several constraints:
- The namespace (`ns`) must match the regex `^[a-zA-Z0-9._-]{1,64}$`.
- The total size of the stored JSON snapshot cannot exceed 1 MB.
- The body of a `PATCH` request cannot exceed 256 KB.

## Migration Note (Faza 6)

All `/rooms/*/bridge` endpoints are deprecated and will return a `410 Gone` status. Please migrate to the Storage API.

## Endpoints

## Curl Examples

### Get a snapshot

```bash
curl -H "Authorization: Bearer <jwt>" http://localhost:8788/api/storage?ns=my-app
```

### Update a snapshot

First, get the current version from the ETag header of a GET request. Then:

```bash
curl -X PATCH -H "Authorization: Bearer <jwt>" -H "If-Match: <version>" -H "Content-Type: application/json" -d '[{"op":"set","key":"foo","value":"bar"}]' http://localhost:8788/api/storage?ns=my-app
```

### Handle a version conflict

If you try to update with an outdated version, you will get a 412 Precondition Failed error:

```bash
curl -X PATCH -H "Authorization: Bearer <jwt>" -H "If-Match: <old-version>" -H "Content-Type: application/json" -d '[{"op":"set","key":"foo","value":"baz"}]' http://localhost:8788/api/storage?ns=my-app
```


### GET /api/storage

Retrieves a JSON snapshot for a given namespace.

- **Query Parameters**:
  - `ns` (string, required): The namespace for the data.
- **Headers**:
  - `Authorization`: `Bearer <jwt>`
- **Response**:
  - `200 OK`: Returns the JSON snapshot.
  - `ETag`: The current version of the snapshot.
  - `400 Bad Request`: If `ns` is invalid.

### PATCH /api/storage

Applies a batch of updates to a snapshot.

- **Query Parameters**:
  - `ns` (string, required): The namespace for the data.
- **Headers**:
  - `Authorization`: `Bearer <jwt>`
  - `If-Match`: The current version of the snapshot.
  - `Content-Type`: `application/json`
- **Body**: A JSON array of operations:
  ```json
  [
    { "op": "set", "key": "myKey", "value": "myValue" },
    { "op": "del", "key": "anotherKey" },
    { "op": "clear" }
  ]
  ```
- **Response**:
  - `200 OK`: Returns the new version and the updated snapshot.
  - `ETag`: The new version of the snapshot.
  - `400 Bad Request`: If the `If-Match` header is missing.
  - `413 Payload Too Large`: If the resulting snapshot would exceed 1 MB.
  - `412 Precondition Failed`: If the `If-Match` header does not match the current version.

## Validation & Limits (Faza 8)

The `PATCH /api/storage` endpoint enforces strict validation rules:

- **Request Body Size**: The total size of the request body must not exceed **256 KB**. Exceeding this returns `413 Payload Too Large`.
- **Batch Operations**: A batch can contain a maximum of **100** operations. Exceeding this returns `400 Bad Request`.
- **Operation Schema**: Each operation in the batch must conform to one of the following schemas:
  - `set`: `{ "op": "set", "key": string, "value": any }`
    - `key` must be a string between 1 and 256 characters.
    - `value` can be any JSON-serializable data, but its serialized size cannot exceed **16 KB**.
  - `del`: `{ "op": "del", "key": string }`
    - `key` must be a string between 1 and 256 characters.
  - `clear`: `{ "op": "clear" }`
    - No other properties are allowed.

An invalid batch will result in a `400 Bad Request` with details about the validation error.

**Example `400` Response (Invalid Key):**
```json
{
  "error": "Invalid batch format",
  "details": [
    {
      "validation": "string",
      "code": "too_small",
      "message": "String must contain at least 1 character(s)",
      "path": [ 0, "key" ]
    }
  ]
}
```

## Rate Limiting (Faza 8)

To ensure fair use and system stability, the `PATCH /api/storage` endpoint is rate-limited.

- **Limit**: **6 requests per 10 seconds** per user, per namespace.
- **Response**: If the limit is exceeded, the API will respond with `429 Too Many Requests`.
- **Headers**: The response will include a `Retry-After` header indicating how many seconds to wait before trying again.

**Example `429` Response:**
```
HTTP/1.1 429 Too Many Requests
Content-Type: application/json; charset=utf-8
Retry-After: 10
x-ratelimit-limit: 6
x-ratelimit-remaining: 0
x-ratelimit-reset: 1666526410

{"statusCode":429,"error":"Too Many Requests","message":"Rate limit exceeded"}
```
