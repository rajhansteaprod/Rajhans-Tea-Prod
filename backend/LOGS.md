# Application Logs

All application logs are written to persistent files for debugging and monitoring.

## Log Location

- **Main App Log**: `backend/logs/app.log`
- **All logs**: `backend/logs/` directory

## Log Levels

Logs are written at different levels:
- `error` — Critical failures
- `warn` — Warnings (non-fatal issues)
- `info` — Important events (server start, seeds, API calls)
- `debug` — Detailed debugging info

Set the log level via `.env`:
```
LOG_LEVEL=info
```

## View Logs in Real-Time

### On Windows (PowerShell)
```powershell
Get-Content -Path backend/logs/app.log -Wait
```

### On Mac/Linux
```bash
tail -f backend/logs/app.log
```

## Log Example

When the server starts, you'll see:
```
[INFO] 🔄 Starting seed execution
[INFO] 🌱 seedPages() started
[INFO] 📊 Found 0 existing pages in database
[INFO] 📝 Inserting 5 pages into database...
[INFO] ✓ Successfully seeded 5 pages
[INFO] 🎯 Slugs created: privacy-policy, terms-and-conditions, shipping-policy, return-refund, faq
[INFO] ✅ All seeds completed successfully
[INFO] Server running on port 3000 in development mode
```

## Troubleshooting

1. **Pages not seeding?** Check `backend/logs/app.log` for errors
2. **Database connection issues?** Look for connection errors in logs
3. **Silent failures?** Logs show the exact error with full stack trace

If seeding fails, the logs will show:
```
[ERROR] Error seeding pages: {
  "error": "Connection refused",
  "code": "ECONNREFUSED"
}
```
