import { requestHandler } from '../server.mjs';

export default async function handler(req, res) {
  const slug = req.query?.slug;
  const subpath = Array.isArray(slug) ? slug.join('/') : (slug || '');
  const targetPath = subpath ? `/api/${subpath}` : null;
  return requestHandler(req, res, targetPath);
}
