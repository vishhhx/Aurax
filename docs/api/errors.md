# Error Responses

All APIs follow a consistent error format.

```json
{
  "success": false,
  "message": "Unauthorized",
  "errors": []
}
```

---

## Status Codes

| HTTP Status | Meaning               |
| ----------- | --------------------- |
| 200         | Success               |
| 201         | Created               |
| 400         | Bad Request           |
| 401         | Unauthorized          |
| 403         | Forbidden             |
| 404         | Resource Not Found    |
| 409         | Conflict              |
| 422         | Validation Failed     |
| 429         | Rate Limit Exceeded   |
| 500         | Internal Server Error |

---

## Common Errors

### Unauthorized

```json
{
  "success": false,
  "message": "Invalid access token"
}
```

### Validation Error

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "amount",
      "message": "Amount must be greater than zero"
    }
  ]
}
```
