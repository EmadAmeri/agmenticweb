# HORNBACH Orchestration MVP

This demo shows a minimal orchestration flow for a customer question:

1. detect the question category
2. split hybrid questions into subtasks
3. hand subtasks to the relevant agents
4. return one unified answer

## Files

- `index.html`: demo UI
- `styles.css`: styling
- `app.js`: client orchestration flow and demo logic
- `server.js`: local server and Groq-backed routing endpoint

## Local run

```bash
node server.js
```

Then open `http://127.0.0.1:8000`.

To enable the Groq-backed router, create a local `.env.local` file with:

```bash
GROQ_API_KEY=your_key_here
```

The `.env.local` file is intentionally ignored and should not be committed.
