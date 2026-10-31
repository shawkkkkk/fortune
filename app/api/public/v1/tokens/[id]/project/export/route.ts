import { GET as readProject } from '../route';
import { projectDataExport } from '@/lib/project-data-export';
import { projectToken } from '@/lib/project-canon';
import { apiError } from '@/lib/public-api';

export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  let token: string;
  try { token = projectToken((await context.params).id); }
  catch { return apiError('invalid_request', 'Provide a nonzero token address.', 400); }
  // Reuse the actual same-block reader and all its existing error/status gates.
  const response = await readProject(request, { params: Promise.resolve({ id: token }) });
  if (response.status !== 200) return response;
  try {
    const exported = projectDataExport(await response.json(), token);
    return new Response(JSON.stringify(exported) + '\n', { headers: {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="fortune-project-${token}.json"`,
      'X-Content-Type-Options': 'nosniff', 'X-Fortune-API-Version': 'v1',
    } });
  } catch { return apiError('dependency_unavailable', 'A consistent project export is unavailable. No substitute data was returned.', 503); }
}
