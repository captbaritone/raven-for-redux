const identity = x => x;
const getUndefined = () => {};
const filter = () => true;
const createRavenMiddleware = (function() {
  let called = false;
  return (Raven, options = {}) => {
    // TODO: Validate options.
    const {
      breadcrumbDataFromAction = getUndefined,
      actionTransformer = identity,
      stateTransformer = identity,
      breadcrumbCategory = "redux-action",
      filterBreadcrumbActions = filter,
      getUserContext
    } = options;

    if (!called) called = true;
    else {
      if (Raven._globalOptions.dataCallback instanceof Function) {
        // eslint-disable-next-line no-console
        console.warn(
          "Possible memory leak detected! Refer to https://github.com/captbaritone/raven-for-redux."
        );
      }
    }

    return store => {
      let lastAction;

      Raven.setDataCallback((data, original) => {
        const state = store.getState();
        data.extra.lastAction = actionTransformer(lastAction);
        data.extra.state = stateTransformer(state);
        if (getUserContext) {
          data.user = getUserContext(state);
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
  };
})();

module.exports = createRavenMiddleware;
