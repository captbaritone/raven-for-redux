const identity = x => x;
const getUndefined = () => {};
const filter = () => true;

const MAX_BREADCRUMBS = 100;
const attachedRavens = new WeakSet();

// Raven.setDataCallback cannot be reliably "unset".
// chained. Therefore, we need to be very careful never to call this more than
// once per Raven instance, or risk a memory leak of everything implcitly bound into
// the callback. To that end, we track which instances have had their
// dataCallback set. The callback we set is a just a wrapper around
// `_dataCallback` which we can contoll dynamically.
let _dataCallback = null;

function dataCallback(data, original) {
  data = _dataCallback ? _dataCallback(data) : data;
  return original ? original(data) : data;
}

function mergeBreadcrumbs(a, b) {
  const merged = [];
  for (let ai = 0, bi = 0; ai < a.length || bi < b.length; ) {
    if (!b[bi] || (a[ai] && a[ai].timestamp < b[bi].timestamp)) {
      merged.push(a[ai]);
      ai++;
    } else {
      merged.push(b[bi]);
      bi++;
    }
  }
  return merged;
}

function createRavenMiddleware(Raven, options = {}) {
  // TODO: Validate options.
  const {
    breadcrumbDataFromAction = getUndefined,
    actionTransformer = identity,
    stateTransformer = identity,
    breadcrumbCategory = "redux-action",
    filterBreadcrumbActions = filter,
    getUserContext,
    global = true
  } = options;

  /* 
   * `Raven.setDataCallback` has a very elegant API which gives the newly
   * registered callback access to the previously registered callback. This
   * allows us to register a new callback for our own purposes while still
   * preserving any callback(s) that the user may have registered themselves.
   *
   * However, it has a down side. It's not possible to register a _new_
   * callback which both preserves user defiend callbacks _and_ removes our 
   * own previously registered callbacks. Since our callbacks have the
   * entire Redux store implicitly bound into them, blindly calling 
   * `Raven.setDataCallback` on each middleware creation can cause a huge
   * memory leak in a server-side-rendering (SSR) setup. Esentially,
   * no Redux store could would be garbage collected.
   * 
   * https://github.com/captbaritone/raven-for-redux/issues/50
   *
   * To work around this challenge, only ever set one data callback per
   * Raven instance (there will only ever be one), but we set it to a
   * callback whose behavior we can change dynamically.
   */
  if (!attachedRavens.has(Raven)) {
    Raven.setDataCallback(dataCallback);
    attachedRavens.add(Raven);
  }

  const middleware = store => {
    let lastAction;
    const breadcrumbs = [];

    const middlewareDataCallback = (data, original) => {
      const state = store.getState();
      data.extra.lastAction = actionTransformer(lastAction);
      data.extra.state = stateTransformer(state);
      if (getUserContext) {
        data.user = getUserContext(state);
      }
      const originalBreadcrumbs =
        (data.breadcrumbs && data.breadcrumbs.values) || [];

      data.breadcrumbs = {
        values: mergeBreadcrumbs(originalBreadcrumbs, breadcrumbs)
      };
      return original ? original(data) : data;
    };

    _dataCallback = global ? middlewareDataCallback : null;

    if (!global) {
      middleware.captureException = e => {
        const original = _dataCallback;
        _dataCallback = middlewareDataCallback;
        Raven.captureException(e);
        _dataCallback = original;
      };
    }

    return next => action => {
      // Log the action taken so that we have narrative context in our
      // error report.
      if (filterBreadcrumbActions(action)) {
        /* 
         * Usually Raven handles setting the timestamp, and enforcing the max
         * length, but since we are logging breadcrumbs which may not get
         * attached to Raven, we create the entire object outselves and merge
         * them in only if/when an exceptiption for this middleware is actually
         * captured.
         */
        breadcrumbs.push({
          timestamp: +new Date() / 1000,
          category: breadcrumbCategory,
          message: action.type,
          data: breadcrumbDataFromAction(action)
        });

        if (breadcrumbs.length > MAX_BREADCRUMBS) {
          breadcrumbs.shift();
        }
      }

      lastAction = action;
      return next(action);
    };
  };

  if (!global) {
    // Use Raven's `captureException` until the middleware gets initialized.
    middleware.captureException = e => Raven.captureException(e);
  }

  return middleware;
}

module.exports = createRavenMiddleware;
