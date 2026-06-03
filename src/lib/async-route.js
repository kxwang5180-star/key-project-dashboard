export function asyncRoute(handler) {
  return function wrappedAsyncRoute(req, res, next) {
    return Promise.resolve(handler(req, res, next)).catch(next);
  };
}
