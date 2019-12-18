const identity = x => x;
const getType = action => action.type;
const filter = () => true;

function createSentryMiddleware(sentry, options = {}) {
  const {
    breadcrumbDataFromAction,
    breadcrumbMessageFromAction = getType,
    actionTransformer = identity,
    stateTransformer = identity,
    breadcrumbCategory = "redux-action",
    filterBreadcrumbActions = filter,
    getUserContext,
    getTags
  } = options;
  return store => {
    let lastAction;
    sentry.configureScope(scope => {
      // TODO: We could try to warn if another middleware is already connected
      // to this scope.
      scope.addEventProcessor(event => {
        const state = store.getState();
        const reduxExtra = {
          lastAction: actionTransformer(lastAction),
          state: stateTransformer(state)
        };
        event.extra = Object.assign(reduxExtra, event.extra || {});
        if (getUserContext) {
          event.user = getUserContext(state);
        }
        if (getTags) {
          event.tags = getTags(state);
        }
        return event;
      });
    });
    return next => action => {
      if (filterBreadcrumbActions(action)) {
        const breadcrumb = {
          category: breadcrumbCategory,
          message: breadcrumbMessageFromAction(action)
        };
        // When Sentry gets an object with a value of
        // `undefined`, rather than omit it in the JSON payload,
        // it strigifies it as "[undefined]". So, we only set this value if we have a
        // callback.
        if (breadcrumbDataFromAction !== undefined) {
          breadcrumb.data = breadcrumbDataFromAction(action);
        }
        sentry.addBreadcrumb(breadcrumb);
      }
      lastAction = action;
      return next(action);
    };
  };
}

module.exports = createSentryMiddleware;
