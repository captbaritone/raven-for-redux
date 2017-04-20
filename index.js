const identity = x => x;
const getUndefined = () => {};
function createRavenMiddleware(Raven, options = {}) {
  // TODO: Validate options.
  const {
    breadcrumbDataFromAction = getUndefined,
    actionTransformer = identity,
    stateTransformer = identity,
    breadcrumbCategory = "redux-action"
  } = options;
  Raven.setDataCallback((data, original) => {
    data.extra.lastAction = actionTransformer(data.extra.lastAction);
    data.extra.state = stateTransformer(data.extra.state);
    return original ? original(data) : data;
  });
  return store => {
    // Record the initial state in case we crash before the first action
    // succeeds.
    // TODO: This does not currently work.
    Raven.setExtraContext({ state: store.getState() });

    return next => action => {
      // Log the action taken to Raven so that we have narrative context in our
      // error report.
      Raven.captureBreadcrumb({
        category: breadcrumbCategory,
        message: action.type,
        data: breadcrumbDataFromAction(action)
      });

      // Set the action as context in case we crash in the reducer.
      const extra = { lastAction: action };
      const returnValue = Raven.context({ extra }, () => next(action));

      // Set the last action and state as context in case we crash before
      // the next action is dispatched.
      Raven.setExtraContext({
        lastAction: action,
        state: store.getState()
      });
      return returnValue;
    };
  };
}

module.exports = createRavenMiddleware;
