# StockFlow Tests

This folder contains simple test scripts for the StockFlow backend.

## Available tests

- `test_db.js` - checks database connectivity and basic damage-report queries.
- `test_report.js` - hits the `/api/reports/damages` endpoint on the backend.
- `test_5001.js` - hits the same report route on port `5001` for a secondary API instance.
- `test_full_report.js` - logs in and validates the `/api/reports/damages` endpoint with a bearer token.

## Run tests

From the project root:

```bash
npm run test:db
npm run test:report
npm run test:health
npm run test:integration
```
