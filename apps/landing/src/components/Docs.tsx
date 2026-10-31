import { useEffect } from 'react';

export default function Docs() {
  useEffect(() => { document.title = 'Exam Studio API Docs'; }, []);
  return (
    <main className="container-x section">
      <h1 className="heading mb-3">API documentation</h1>
      <p className="sub mb-8">OpenAPI 3.1 spec available at <a className="underline" href="https://examstudio.duckdns.org/api/v1/openapi.json">/api/v1/openapi.json</a>.</p>
      <section className="card mb-6"><h2 className="text-xl font-semibold mb-2">Authentication</h2><p className="text-sm">Use <code>Authorization: Bearer es_live_...</code>. Tokens are hashed, never logged. Revoke from account settings.</p></section>
      <section className="card mb-6"><h2 className="text-xl font-semibold mb-2">Endpoints</h2><ul className="text-sm space-y-2 font-mono"><li>GET /api/v1/me</li><li>POST /api/v1/generate/study-notes</li><li>POST /api/v1/generate/handout</li><li>POST /api/v1/generate/exam</li><li>POST /api/v1/generate/flashcards</li><li>GET /api/v1/library</li><li>GET /api/v1/library/:id</li><li>POST /api/v1/library</li><li>DELETE /api/v1/library/:id</li><li>GET /api/v1/library/:id/export?format=docx|pdf|csv</li></ul></section>
      <section className="card mb-6"><h2 className="text-xl font-semibold mb-2">Errors</h2><p className="text-sm">401 invalid_token, 403 insufficient_scope, 402 plan_limit_reached, 429 rate_limited; all include request_id.</p></section>
      <section className="card mb-6"><h2 className="text-xl font-semibold mb-2">MCP setup</h2><p className="text-sm">Run the packaged <code>exam-studio-mcp</code> server with <code>EXAM_STUDIO_TOKEN</code> and <code>EXAM_STUDIO_URL</code>.</p></section>
    </main>
  );
}
