import serverHandler, { requestHandler } from '../server.mjs';

export default async function handler(req, res) {
  const fn = requestHandler || serverHandler;
  return fn(req, res, '/api/heartbeat');
}
