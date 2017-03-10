const identity = x => x;
function createRavenMiddleware(Raven, options = {}) {
  const {
    actionTransformer = identity,
    stateTransformer = identity,
    breadcrumbCategory = "redux-action"
  } = options;
  return store => {
    // Record the initial state in case we crash before the first action
    // succeeds.
    Raven.setExtraContext({ state: stateTransformer(store.getState()) });

    return next => action => {
      // Log the action taken to Raven so that we have narrative context in our
      // error report.
      Raven.captureBreadcrumb({
        category: breadcrumbCategory,
        message: action.type
      });

      // Set the action as context in case we crash in the reducer.
      const extra = { lastAction: actionTransformer(action) };
      Raven.context({ extra }, () => next(action));

      // Set the last action and state as context in case we crash before
      // the next action is dispatched.
      Raven.setExtraContext({
        lastAction: actionTransformer(action),
        state: stateTransformer(store.getState())
      });
    };
  };
}

module.exports = createRavenMiddleware;
