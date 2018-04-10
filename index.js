const identity = x => x;
const getUndefined = () => {};
const filter = () => true;
function createRavenMiddleware(Raven, options = {}) {
  // TODO: Validate options.
  const {
    breadcrumbDataFromAction = getUndefined,
    actionTransformer = identity,
    stateTransformer = identity,
    breadcrumbCategory = "redux-action",
    filterBreadcrumbActions = filter,
    getExtra = getUndefined,
    getUserContext,
    getTags
  } = options;

  return store => {
    let lastAction;

    Raven.setDataCallback((data, original) => {
      const state = store.getState();
      const reduxExtra = {
        lastAction: actionTransformer(lastAction),
        state: stateTransformer(state)
      };
      data.extra = Object.assign(reduxExtra, data.extra, getExtra(state));
      if (getUserContext) {
        data.user = getUserContext(state);
      }
      if (getTags) {
        data.tags = getTags(state);
      }
      return original ? original(data) : data;
    });

    return next => action => {
      // Log the action taken to Raven so that we have narrative context in our
      // error report.
      if (filterBreadcrumbActions(action)) {
        Raven.captureBreadcrumb({
          category: breadcrumbCategory,
          message: action.type,
          data: breadcrumbDataFromAction(action)
        });
      }

      lastAction = action;
      return next(action);
    };
  };
}

module.exports = createRavenMiddleware;
