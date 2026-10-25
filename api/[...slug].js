import serverHandler, { requestHandler } from '../server.mjs';

export default async function handler(req, res) {
  const fn = requestHandler || serverHandler;
  const slug = req.query?.slug;
  const subpath = Array.isArray(slug) ? slug.join('/') : (slug || '');
  const targetPath = subpath ? `/api/${subpath}` : null;
  return fn(req, res, targetPath);
}
